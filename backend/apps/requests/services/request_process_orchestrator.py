import logging
import uuid
import time
from typing import Any
from django.db import transaction
from django.utils import timezone

from apps.requests.models import Request, LifecycleState, StateHistory
from apps.requests.domain.state_machine import RequestStateMachine
from apps.requests.domain.actions import RequestAction
from apps.requests.domain.transitions import TRANSITIONS, TriggerType
from apps.requests.services.context_builder import RequestContextBuilder
from apps.requests.events.publishers import DomainEventPublisher
from apps.notification.services import DispatchOrchestrator

logger = logging.getLogger(__name__)

class RequestProcessOrchestrator:
    @staticmethod
    @transaction.atomic
    def sync(request_id: Any) -> Request:
        """
        Evaluates the current state of the Request against all facts and 
        progresses the state machine automatically if a valid automatic transition exists.
        """
        request = Request.objects.select_for_update().get(pk=request_id)
        machine = RequestStateMachine(LifecycleState(request.status))
        
        # We assume the orchestrator has super permissions for evaluating system/automatic rules.
        system_permissions = list(set(t.required_permission for t in TRANSITIONS))
        
        # Single correlation ID for this entire orchestration cycle
        correlation_id = str(uuid.uuid4())
        
        max_iterations = 10 # Prevent infinite loops
        iterations = 0
        visited_states = set()
        visited_states.add(request.status)

        while iterations < max_iterations:
            start_time = time.time()
            
            # 1. Build Context
            context = RequestContextBuilder(request).build()
            
            # 2. Discover Automatic Transitions
            valid_transitions = machine.get_allowed_automatic_transitions(context)
            
            if not valid_transitions:
                break
                
            # Pick the first valid transition
            t = valid_transitions[0]
            
            try:
                prev_status = request.status
                
                # 3. Transition State
                new_status = machine.transition(t.action, system_permissions, context, target_state=t.target)
                
                # Infinite loop protection
                if new_status in visited_states:
                    logger.error(f"Orchestrator Cycle Detected: Request {request.id} returned to {new_status}. Aborting cycle.")
                    break
                visited_states.add(new_status)
                
                # 4. Save and Log
                request.status = new_status
                request.save()

                StateHistory.objects.create(
                    request=request,
                    from_state=prev_status,
                    to_state=new_status,
                    actor=None, # System actor
                    correlation_id=correlation_id,
                    reason=f"System Trigger: {t.action.value}"
                )
                
                elapsed_time = round((time.time() - start_time) * 1000, 2)
                
                logger.info(
                    f"Orchestrator Automatic Transition | "
                    f"ReqID: {request.id} | "
                    f"State: {prev_status} -> {new_status} | "
                    f"Action: {t.action.value} | "
                    f"Trigger: {t.trigger_type.value} | "
                    f"CorrelationID: {correlation_id} | "
                    f"Elapsed: {elapsed_time}ms"
                )
                
                # 5. Emit Events
                transaction.on_commit(lambda r_id=request.id, cid=correlation_id, ns=new_status: DomainEventPublisher.publish_request_updated(
                    request_id=r_id,
                    correlation_id=cid,
                    actor_id=None,
                    updates={"status": ns.value if hasattr(ns, 'value') else ns}
                ))

                if new_status == LifecycleState.AWAITING_PAYMENT and prev_status == LifecycleState.PENDING_VERIFICATION:
                    from apps.requests.tasks.reminder_tasks import send_final_balance_reminder
                    # Send immediate reminder
                    transaction.on_commit(lambda r_id=request.id: send_final_balance_reminder.delay(r_id))
                    # Schedule 24h reminder
                    transaction.on_commit(lambda r_id=request.id: send_final_balance_reminder.apply_async(args=[r_id], countdown=86400))

                if new_status == LifecycleState.COMPLETED:
                    transaction.on_commit(lambda r_id=request.id, cid=request.customer_id: DispatchOrchestrator.dispatch_event(
                        event_type="request_completed",
                        recipient_id=cid,
                        context={},
                        resource_type="request",
                        resource_id=str(r_id),
                        category="alerts",
                        title="Request Completed",
                        message=f"Your request has been successfully completed.",
                        is_system_critical=True,
                    ))
                
            except Exception as e:
                logger.warning(f"Orchestrator failed to auto-transition request {request.id} via {t.action}: {str(e)}")
                break
                
            iterations += 1

        if iterations >= max_iterations:
            logger.error(f"Orchestrator Loop Limit Reached for Request {request.id}. Aborting.")

        return request
