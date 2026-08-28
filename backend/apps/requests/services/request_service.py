"""
RequestService: Orchestrates the core lifecycle transitions and canonical state management.
Ref: docs/architecture/request/request-services.md (Section 5.1)
"""
import logging
import uuid
from typing import Any, Dict, List, Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.core.exceptions import PermissionDenied
from django.db.models import Q

from apps.audit_logs.services.audit_service import log_action, log_creation, log_transition
from apps.requests.domain.actions import RequestAction
from apps.requests.domain.state_machine import RequestStateMachine
from apps.requests.events.publishers import DomainEventPublisher
from apps.requests.models import LifecycleState, Request, StateHistory
from apps.notification.services import DispatchOrchestrator
from apps.requests.permissions.constants import Permission, Role
from apps.requests.permissions.checks import RBACChecker
from apps.requests.domain.exceptions import InvalidTransitionError
from apps.requests.permissions.matrix import PermissionRegistry
from apps.requests.permissions.constants import Role

User = get_user_model()
logger = logging.getLogger(__name__)


class RequestService:
    """
    Service for managing Request lifecycle, creation, and state transitions.
    """

    @staticmethod
    def list_requests(user: User) -> Any:
        """
        Lists requests based on user role and ownership.
        Ref: docs/architecture/request/request-domain.md (Section 6.2 Ownership Matrix)
        """
        base_qs = Request.objects.select_related('order').prefetch_related('payments')
        
        if not hasattr(user, "role"):
            return base_qs.filter(customer=user).order_by('-created_at')

        role = user.role.upper()
            
        if role in ["STAFF", "MANAGER", "SUPER_ADMIN"]:
            return base_qs.all().order_by('-created_at')
        elif role == "TECHNICIAN":
            from django.db.models import Q
            return base_qs.filter(Q(assigned_technician=user) | Q(assignments__technician=user)).distinct().order_by('-created_at')
        else:
            return base_qs.filter(customer=user).order_by('-created_at')

    @staticmethod
    def get_request_by_id(request_id: Any) -> Request:
        """
        Retrieves a single request, abstracting ORM access.
        """
        try:
            return Request.objects.get(pk=request_id)
        except Request.DoesNotExist:
            from django.http import Http404
            raise Http404("Request not found")

    @staticmethod
    @transaction.atomic
    def create_request(user: User, data: Dict[str, Any]) -> Request:
        """
        Creates a new Request in DRAFT state.
        Ref: docs/architecture/request/request-services.md (5.1)
        """

        # 1. RBAC Validation
        if not RBACChecker.check_scoped_permission(
            role=Role(user.role), 
            permission=Permission.REQUEST_CREATE, 
            user_id=user.id
        ):
            raise PermissionDenied("Missing request.create permission.")

        public_id = f"REQ-{uuid.uuid4().hex[:8].upper()}"

        request = Request.objects.create(
            public_id=public_id,
            customer=user,
            category=data["category"],
            priority=data.get("priority", "normal"),
            status=LifecycleState.DRAFT,
            description=data["description"],
            location=data.get("location"),
            requires_technician=data.get("requires_technician", False)
        )

        # Audit Integration
        log_creation(
            action="request.created",
            actor=user,
            instance=request,
            metadata={"category": request.category},
        )

        # Domain Event Integration
        correlation_id = str(uuid.uuid4())
        transaction.on_commit(lambda: DomainEventPublisher.publish_request_created(
            request_id=request.id,
            correlation_id=correlation_id,
            actor_id=user.id,
            customer_id=user.id,
            category=request.category,
        ))

        transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            event_type="request_created",
            recipient_id=user.id,
            resource_type="request",
            resource_id=str(request.id),
            category="updates",
            title="Request Created",
            message=f"Request {request.public_id} created successfully.",
            context={"category": request.category},
            is_system_critical=False,
        ))

        return request

    @staticmethod
    def get_timeline(request_id: Any, user: User) -> List[Dict[str, Any]]:
        """
        Retrieves the chronologically ordered state history and audit events for a request.
        Filters out internal staff actions for customers.
        """
        from apps.audit_logs.models import AuditLogEntry

        history = StateHistory.objects.filter(request_id=request_id)
        audit_logs = AuditLogEntry.objects.filter(resource_type='request', resource_id=str(request_id))
        
        timeline = []
        is_customer = not hasattr(user, 'role') or user.role.upper() == 'CUSTOMER'
        
        internal_states = [
            LifecycleState.STAFF_REVIEW,
            LifecycleState.AWAITING_ASSIGNMENT,
            LifecycleState.PENDING_VERIFICATION,
            LifecycleState.ESCALATED,
        ]
        
        for h in history:
            if is_customer and h.to_state in internal_states:
                continue
            actor_name = "System"
            if h.actor:
                actor_name = getattr(h.actor, 'get_full_name', lambda: getattr(h.actor, 'username', 'User'))()
            timeline.append({
                "type": "state_change",
                "action": f"{h.from_state} → {h.to_state}",
                "from_state": h.from_state, 
                "to_state": h.to_state, 
                "reason": h.reason, 
                "actor": actor_name,
                "created_at": h.timestamp
            })
            
        for a in audit_logs:
            actor_name = a.actor_name or (a.actor_email_snapshot if a.actor_email_snapshot else "System")
            timeline.append({
                "type": "audit_action",
                "action": a.action,
                "actor": actor_name,
                "metadata": a.metadata,
                "created_at": a.timestamp
            })

        # Sort by timestamp
        timeline.sort(key=lambda x: x["created_at"])
            
        return timeline

    @staticmethod
    @transaction.atomic
    def update_request(request_id: Any, user: User, data: Dict[str, Any]) -> Request:
        """
        Updates basic request fields (description, location).
        Does NOT support status, technician, or customer mutation.
        """

        request = Request.objects.select_for_update().get(pk=request_id)
        
        # Terminal state immutability
        if request.status in [LifecycleState.COMPLETED, LifecycleState.CANCELLED]:
            raise InvalidTransitionError("Cannot update a request in a terminal state.")

        # RBAC Validation
        if not RBACChecker.check_scoped_permission(
            role=Role(user.role), 
            permission=Permission.REQUEST_UPDATE, 
            user_id=user.id,
            resource=request
        ):
            raise PermissionDenied("Missing request.update permission.")
            
        allowed_fields = {"description", "location"}
        updates_made = {}
        
        target_action = data.get("action")
        target_status = data.get("status")
        
        if target_action or (target_status and target_status != request.status):
            machine = RequestStateMachine(request.status)
            user_permissions = [p.value for p in PermissionRegistry.get_permissions_for_role(Role(user.role))] if hasattr(user, "role") else []
            
            from apps.requests.services.context_builder import RequestContextBuilder
            context_obj = RequestContextBuilder(request).build()
            
            if target_action:
                from apps.requests.domain.actions import RequestAction
                try:
                    action_enum = RequestAction(target_action)
                except ValueError:
                    raise InvalidTransitionError(f"Invalid action: {target_action}")
                    
                new_status = machine.transition(
                    action=action_enum,
                    user_permissions=user_permissions,
                    context=context_obj
                )
            else:
                allowed_transitions = machine.get_allowed_transitions()
                valid_transition = next((t for t in allowed_transitions if t.target.value == target_status), None)
                
                if not valid_transition:
                    raise InvalidTransitionError(f"Cannot transition from {request.status} to {target_status}")
                    
                new_status = machine.transition(
                    action=valid_transition.action,
                    user_permissions=user_permissions,
                    context=context_obj
                )
            
            prev_status = request.status
            request.status = new_status
            updates_made["status"] = new_status
            
            correlation_id = str(uuid.uuid4())
            StateHistory.objects.create(
                request=request,
                from_state=prev_status,
                to_state=new_status,
                actor=user,
                correlation_id=correlation_id,
            )

        for field in allowed_fields:
            if field in data:
                setattr(request, field, data[field])
                updates_made[field] = data[field]
                
        if updates_made:
            old_request = Request.objects.get(pk=request.pk)
            request.save()
            log_transition(
                action="request.updated",
                actor=user,
                instance=request,
                old_instance=old_request,
                metadata={"fields": list(updates_made.keys())}
            )
            # Emit Domain event.
            correlation_id = str(uuid.uuid4())
            transaction.on_commit(lambda: DomainEventPublisher.publish_request_updated(
                request_id=request.id,
                correlation_id=correlation_id,
                actor_id=user.id,
                updates=updates_made
            ))
            
            if "status" in updates_made:
                from apps.requests.services.request_process_orchestrator import RequestProcessOrchestrator
                transaction.on_commit(lambda: RequestProcessOrchestrator.sync(request.id))
            
        return request

    @staticmethod
    @transaction.atomic
    def submit(request_id: Any, actor: User) -> Request:
        """
        Transitions a request from DRAFT to SUBMITTED.
        Ref: docs/architecture/request/request-services.md (5.1)
        """

        request = Request.objects.select_for_update().get(pk=request_id)
        
        # RBAC Validation
        if not RBACChecker.check_scoped_permission(
            role=Role(actor.role), 
            permission=Permission.REQUEST_SUBMIT, 
            user_id=actor.id,
            resource=request
        ):
            raise PermissionDenied("Missing request.submit permission.")

        prev_status = request.status

        # 1. State Machine Validation
        machine = RequestStateMachine(LifecycleState(request.status))
        # Context guards (e.g., has_valid_schema) are validated here
        new_status = machine.transition(
            action=RequestAction.SUBMIT,
            user_permissions=[p.value for p in PermissionRegistry.get_permissions_for_role(Role(actor.role))] if hasattr(actor, "role") else [],
            context={"has_valid_schema": True},
        )

        # 2. Persist State Change
        old_request = Request.objects.get(pk=request.pk)
        request.status = new_status
        request.save()

        # 3. State History (Immutable Ledger)
        correlation_id = str(uuid.uuid4())
        StateHistory.objects.create(
            request=request,
            from_state=prev_status,
            to_state=new_status,
            actor=actor,
            correlation_id=correlation_id,
        )

        # 4. Audit Log (Forensic)
        log_transition(
            action="request.submitted",
            actor=actor,
            instance=request,
            old_instance=old_request,
            reason="User submitted draft",
            metadata={
                "previous_state": prev_status,
                "new_state": new_status,
            },
        )

        # 5. Domain Event
        transaction.on_commit(lambda: DomainEventPublisher.publish_request_submitted(
            request_id=request.id,
            correlation_id=correlation_id,
            actor_id=actor.id,
            priority=request.priority,
            category=request.category,
        ))

        transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            event_type="request_submitted",
            recipient_id=request.customer.id,
            resource_type="request",
            resource_id=str(request.id),
            category="updates",
            title="Request Submitted",
            message=f"Request {request.public_id} has been submitted.",
            context={"priority": request.priority},
            is_system_critical=False,
        ))

        from apps.requests.services.request_process_orchestrator import RequestProcessOrchestrator
        transaction.on_commit(lambda: RequestProcessOrchestrator.sync(request.id))

        return request

    @staticmethod
    @transaction.atomic
    def cancel(request_id: Any, actor: User, reason_code: str) -> Request:
        """
        Terminal cancellation of a request.
        Ref: docs/workflows/cancellation-policy.md
        """
        
        request = Request.objects.select_for_update().get(pk=request_id)
        
        # RBAC Validation
        if not RBACChecker.check_scoped_permission(
            role=Role(actor.role), 
            permission=Permission.REQUEST_CANCEL, 
            user_id=actor.id,
            resource=request
        ):
            raise PermissionDenied("Missing request.cancel permission.")

        prev_status = request.status

        # Determine if it's a standard cancel or cancel_active (requires manager)
        is_active = request.status in [
            LifecycleState.ASSIGNED,
            LifecycleState.IN_PROGRESS,
            LifecycleState.PENDING_VERIFICATION,
        ]
        action = RequestAction.CANCEL_ACTIVE if is_active else RequestAction.CANCEL

        # 1. State Machine Validation
        machine = RequestStateMachine(LifecycleState(request.status))
        new_status = machine.transition(
            action=action,
            user_permissions=[p.value for p in PermissionRegistry.get_permissions_for_role(Role(actor.role))] if hasattr(actor, "role") else [],
            context={"trigger_condition_met": True},
        )

        # 2. Persist State Change
        old_request = Request.objects.get(pk=request.pk)
        request.status = new_status
        request.save()

        # 3. Side Effects
        correlation_id = str(uuid.uuid4())
        StateHistory.objects.create(
            request=request,
            from_state=prev_status,
            to_state=new_status,
            actor=actor,
            reason=reason_code,
            correlation_id=correlation_id,
        )

        # 4. Audit Log
        log_transition(
            action="request.cancelled",
            actor=actor,
            instance=request,
            old_instance=old_request,
            reason=reason_code,
            metadata={
                "previous_state": prev_status,
                "new_state": new_status,
            },
        )

        # 5. Domain Event
        transaction.on_commit(lambda: DomainEventPublisher.publish_request_cancelled(
            request_id=request.id,
            correlation_id=correlation_id,
            actor_id=actor.id,
            reason_code=reason_code,
        ))

        return request

    @staticmethod
    @transaction.atomic
    def handle_system_action(request_id: Any, action: RequestAction, context: Dict = None) -> Request:
        request = Request.objects.select_for_update().get(pk=request_id)
        if context is None:
            context = {}
            
        context['requires_technician'] = request.requires_technician
        prev_status = request.status
        machine = RequestStateMachine(LifecycleState(request.status))
        
        # We use a system admin role permissions to bypass RBAC for system actions
        system_permissions = [p.value for p in PermissionRegistry.get_permissions_for_role(Role.SUPER_ADMIN)]
        
        from apps.requests.services.context_builder import RequestContextBuilder
        context_obj = RequestContextBuilder(request).build()
        for k, v in context.items():
            if hasattr(context_obj, k):
                setattr(context_obj, k, v)
        
        new_status = machine.transition(
            action=action,
            user_permissions=system_permissions,
            context=context_obj,
        )
        
        request.status = new_status
        request.save()
        
        correlation_id = str(uuid.uuid4())
        StateHistory.objects.create(
            request=request,
            from_state=prev_status,
            to_state=new_status,
            actor=None,
            reason=f"System action: {action.value}",
            correlation_id=correlation_id,
        )
        return request

    @staticmethod
    @transaction.atomic
    def pickup(request_id: Any, actor: User) -> Request:
        """
        Transitions a request from SUBMITTED to STAFF_REVIEW.
        """
        request = Request.objects.select_for_update().get(pk=request_id)
        
        if request.status != 'submitted':
            raise ValueError("Request has already been claimed or is not in submitted state.")
        
        if not RBACChecker.check_scoped_permission(
            role=Role(actor.role), 
            permission=Permission.REQUEST_TRIAGE, 
            user_id=actor.id,
            resource=request
        ):
            raise PermissionDenied("Missing request.triage permission.")

        prev_status = request.status
        machine = RequestStateMachine(LifecycleState(request.status))
        
        from apps.requests.services.context_builder import RequestContextBuilder
        context = RequestContextBuilder(request).build()
        
        new_status = machine.transition(
            action=RequestAction.PICK_UP,
            user_permissions=[p.value for p in PermissionRegistry.get_permissions_for_role(Role(actor.role))] if hasattr(actor, "role") else [],
            context=context,
        )
        
        old_request = Request.objects.get(pk=request.pk)
        request.status = new_status
        request.save()

        correlation_id = str(uuid.uuid4())
        StateHistory.objects.create(
            request=request,
            from_state=prev_status,
            to_state=new_status,
            actor=actor,
            correlation_id=correlation_id,
            reason="Staff picked up request"
        )
        
        log_transition(
            action="request.picked_up",
            actor=actor,
            instance=request,
            old_instance=old_request,
        )

        from apps.requests.events.publishers import DomainEventPublisher
        transaction.on_commit(lambda: DomainEventPublisher.publish_request_updated(
            request_id=request.id,
            correlation_id=correlation_id,
            actor_id=actor.id,
            updates={"status": new_status.value if hasattr(new_status, 'value') else new_status}
        ))

        from apps.requests.services.request_process_orchestrator import RequestProcessOrchestrator
        transaction.on_commit(lambda: RequestProcessOrchestrator.sync(request.id))

        return request

    @staticmethod
    @transaction.atomic
    def triage(request_id: Any, actor: User, action: RequestAction) -> Request:
        """
        Transitions a request out of STAFF_REVIEW (e.g., NEEDS_QUOTE, REQUIRE_PAYMENT, ASSIGN_DIRECTLY).
        """
        request = Request.objects.select_for_update().get(pk=request_id)
        
        if not RBACChecker.check_scoped_permission(
            role=Role(actor.role), 
            permission=Permission.REQUEST_TRIAGE, 
            user_id=actor.id,
            resource=request
        ):
            raise PermissionDenied("Missing request.triage permission.")

        prev_status = request.status
        machine = RequestStateMachine(LifecycleState(request.status))
        
        from apps.requests.services.context_builder import RequestContextBuilder
        context = RequestContextBuilder(request).build()
        
        new_status = machine.transition(
            action=action,
            user_permissions=[p.value for p in PermissionRegistry.get_permissions_for_role(Role(actor.role))] if hasattr(actor, "role") else [],
            context=context,
        )
        
        old_request = Request.objects.get(pk=request.pk)
        request.status = new_status
        request.save()

        correlation_id = str(uuid.uuid4())
        StateHistory.objects.create(
            request=request,
            from_state=prev_status,
            to_state=new_status,
            actor=actor,
            correlation_id=correlation_id,
            reason=f"Staff triage action: {action.value}"
        )
        
        log_transition(
            action=f"request.triaged.{action.value}",
            actor=actor,
            instance=request,
            old_instance=old_request,
        )

        from apps.requests.events.publishers import DomainEventPublisher
        transaction.on_commit(lambda: DomainEventPublisher.publish_request_updated(
            request_id=request.id,
            correlation_id=correlation_id,
            actor_id=actor.id,
            updates={"status": new_status.value if hasattr(new_status, 'value') else new_status}
        ))

        from apps.requests.services.request_process_orchestrator import RequestProcessOrchestrator
        transaction.on_commit(lambda: RequestProcessOrchestrator.sync(request.id))

        return request
