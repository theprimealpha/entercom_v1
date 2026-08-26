from apps.requests.permissions.matrix import PermissionRegistry
from apps.requests.permissions.constants import Role
"""
QuoteService: Governs the financial estimation and customer approval workflow.
Ref: docs/architecture/request/request-services.md (Section 5.3)
"""
import logging
import uuid
from datetime import timedelta
from typing import Any, Dict, List

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.audit_logs.services.audit_service import log_action, log_creation, log_transition
from apps.requests.domain.actions import RequestAction
from apps.requests.domain.exceptions import RuleViolationError
from apps.requests.domain.state_machine import RequestStateMachine
from apps.requests.events.publishers import DomainEventPublisher
from apps.requests.models import LifecycleState, Quote, QuoteStatus, Request, StateHistory
from apps.notification.services import DispatchOrchestrator

User = get_user_model()
logger = logging.getLogger(__name__)


class QuoteService:
    """
    Service for managing financial quotes, versioning, and approvals.
    """

    @staticmethod
    def list_quotes(request_id: Any, user: User) -> Any:
        """Lists all quote versions for a specific request."""
        return Quote.objects.filter(request_id=request_id).order_by("-version")

    @staticmethod
    @transaction.atomic
    def create_quote(request_id: Any, actor: User, data: Dict[str, Any]) -> Quote:
        """
        Generates a new quote version for a request.
        Ref: docs/architecture/request/request-services.md (5.3)
        """
        from apps.requests.permissions.constants import Permission, Role
        from apps.requests.permissions.checks import RBACChecker
        from django.core.exceptions import PermissionDenied

        request = Request.objects.select_for_update().get(pk=request_id)

        # RBAC Validation
        if not RBACChecker.check_scoped_permission(
            role=Role(actor.role), 
            permission=Permission.QUOTE_CREATE, 
            user_id=actor.id,
            resource=request
        ):
            raise PermissionDenied("Missing quote.create permission.")

        prev_status = request.status

        latest_quote = Quote.objects.filter(request=request).order_by("-version").first()
        new_version = (latest_quote.version + 1) if latest_quote else 1

        if new_version > 3:
            raise RuleViolationError("Maximum quote revision limit (3) exceeded.")

        machine = RequestStateMachine(LifecycleState(request.status))
        user_permissions = [p.value for p in PermissionRegistry.get_permissions_for_role(Role(actor.role))] if hasattr(actor, "role") else []
        
        new_status = machine.transition(
            action=RequestAction.ISSUE_QUOTE,
            user_permissions=user_permissions,
            context={"has_valid_quote_version": True},
        )

        old_request = Request.objects.get(pk=request.pk)
        request.status = new_status
        request.save()

        quote = Quote.objects.create(
            request=request,
            version=new_version,
            amount=data["amount"],
            status=QuoteStatus.ISSUED,
            expires_at=timezone.now() + timedelta(days=30),
            created_by=actor,
        )

        if latest_quote:
            latest_quote.status = QuoteStatus.SUPERSEDED
            latest_quote.save()

        correlation_id = str(uuid.uuid4())
        StateHistory.objects.create(
            request=request,
            from_state=prev_status,
            to_state=new_status,
            actor=actor,
            correlation_id=correlation_id,
        )

        log_transition(
            action="quote.created",
            actor=actor,
            instance=request,
            old_instance=old_request,
            metadata={
                "quote_id": str(quote.id),
                "version": new_version,
                "amount": str(quote.amount),
                "initiator_role": actor.role if hasattr(actor, "role") else "unknown",
                "previous_state": prev_status,
                "new_state": new_status,
            },
        )

        transaction.on_commit(lambda: DomainEventPublisher.publish_quote_created(
            request_id=request.id,
            correlation_id=correlation_id,
            actor_id=actor.id,
            quote_id=quote.id,
            version=new_version,
            amount=float(quote.amount),
        ))

        transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            event_type="quote_ready",
            recipient_id=request.customer.id,
            resource_type="quote",
            resource_id=str(quote.id),
            category="updates",
            title="Quote Ready",
            message=f"A new quote for request {request.public_id} is ready.",
            context={"amount": float(quote.amount), "version": new_version},
            is_system_critical=False,
        ))

        return quote

    @staticmethod
    @transaction.atomic
    def approve_quote(request_id: Any, actor: User) -> Request:
        """
        Explicit approval of the latest quote.
        """
        return QuoteService.handle_customer_action(request_id, actor, "approve")

    @staticmethod
    @transaction.atomic
    def handle_customer_action(
        request_id: Any, actor: User, action_type: str, reason: str = None
    ) -> Request:
        """
        Handles Customer Approve, Reject, or Revise actions on the latest quote.
        Ref: docs/workflows/quote-flow.md
        """
        from apps.requests.permissions.constants import Permission, Role
        from apps.requests.permissions.checks import RBACChecker
        from django.core.exceptions import PermissionDenied

        request = Request.objects.select_for_update().get(pk=request_id)
        
        permission_map = {
            "approve": Permission.QUOTE_APPROVE,
            "reject": Permission.QUOTE_REJECT,
            "revise": Permission.QUOTE_REVISE,
        }
        permission_required = permission_map.get(action_type)
        if permission_required:
            if not RBACChecker.check_scoped_permission(
                role=Role(actor.role), 
                permission=permission_required, 
                user_id=actor.id,
                resource=request
            ):
                raise PermissionDenied(f"Missing {permission_required.value} permission.")

        latest_quote = Quote.objects.filter(request=request).order_by("-version").first()

        if not latest_quote or latest_quote.status != QuoteStatus.ISSUED:
            raise RuleViolationError("No active quote available for action.")

        if latest_quote.expires_at < timezone.now():
            raise RuleViolationError("Quote has expired.")

        prev_status = request.status
        machine = RequestStateMachine(LifecycleState(request.status))
        user_permissions = [p.value for p in PermissionRegistry.get_permissions_for_role(Role(actor.role))] if hasattr(actor, "role") else []
        correlation_id = str(uuid.uuid4())
        
        old_request = Request.objects.get(pk=request.pk)

        if action_type == "approve":
            # Canonical payment-required categories — must stay in sync with PolicyContextProvider
            PAYMENT_REQUIRED_CATEGORIES = {"installation", "maintenance", "product_order", "consultation"}
            upfront_req = request.category in PAYMENT_REQUIRED_CATEGORIES
            action = (
                RequestAction.APPROVE_QUOTE_PAYMENT_REQ
                if upfront_req
                else RequestAction.APPROVE_QUOTE_NO_PAYMENT
            )

            new_status = machine.transition(
                action=action,
                user_permissions=user_permissions,
                context={"upfront_payment_required": upfront_req},
            )
            
            request.status = new_status
            request.save()
            
            latest_quote.status = QuoteStatus.APPROVED
            latest_quote.save()
            
            # Payment is now handled directly against the Quote using initialize_quote_payment
            # CORRECTION: Explicit fields in metadata
            log_transition(
                action="quote.approved",
                actor=actor,
                instance=request,
                old_instance=old_request,
                metadata={
                    "version": latest_quote.version,
                    "amount": str(latest_quote.amount),
                    "initiator_role": actor.role if hasattr(actor, "role") else "unknown",
                    "previous_state": prev_status,
                    "new_state": new_status,
                },
            )
            transaction.on_commit(lambda: DomainEventPublisher.publish_quote_approved(
                request_id=request.id,
                correlation_id=correlation_id,
                actor_id=actor.id,
                quote_id=latest_quote.id,
                customer_id=actor.id,
            ))

            # [DEFERRED] Non-MVP event
            # transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            #     event_type="quote_approved",
            #     recipient_id=request.customer.id,
            #     resource_type="quote",
            #     resource_id=str(latest_quote.id),
            #     category="updates",
            #     title="Quote Approved",
            #     message="Your quote has been approved.",
            #     context={"amount": float(latest_quote.amount)},
            #     is_system_critical=False,
            # ))

        elif action_type == "reject":
            new_status = machine.transition(
                action=RequestAction.REJECT_QUOTE,
                user_permissions=user_permissions,
            )
            
            request.status = new_status
            request.save()
            
            latest_quote.status = QuoteStatus.REJECTED
            latest_quote.save()

            log_transition(
                action="quote.rejected",
                actor=actor,
                instance=request,
                old_instance=old_request,
                reason=reason or "Quote rejected",
                metadata={
                    "version": latest_quote.version,
                    "amount": str(latest_quote.amount),
                    "initiator_role": actor.role if hasattr(actor, "role") else "unknown",
                    "previous_state": prev_status,
                    "new_state": new_status,
                },
            )
            transaction.on_commit(lambda: DomainEventPublisher.publish_quote_rejected(
                request_id=request.id,
                correlation_id=correlation_id,
                actor_id=actor.id,
                quote_id=latest_quote.id,
                reason_code=reason,
            ))

            # [DEFERRED] Non-MVP event
            # transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            #     event_type="quote_rejected",
            #     recipient_id=request.customer.id,
            #     resource_type="quote",
            #     resource_id=str(latest_quote.id),
            #     category="alerts",
            #     title="Quote Rejected",
            #     message="Your quote has been rejected.",
            #     context={"reason": reason},
            #     is_system_critical=False,
            # ))

        elif action_type == "revise":
            new_status = machine.transition(
                action=RequestAction.REQUEST_REVISION,
                user_permissions=user_permissions,
                context={"revision_count": latest_quote.version},
            )
            
            request.status = new_status
            request.save()

            # CORRECTION: Fixed audit label from 'quote.revision_requested' to 'quote_revised'
            log_transition(
                action="quote.revision_requested",
                actor=actor,
                instance=request,
                old_instance=old_request,
                reason=reason or "Quote revision requested",
                metadata={
                    "version": latest_quote.version,
                    "amount": str(latest_quote.amount),
                    "initiator_role": actor.role if hasattr(actor, "role") else "unknown",
                    "previous_state": prev_status,
                    "new_state": new_status,
                },
            )
            transaction.on_commit(lambda: DomainEventPublisher.publish_quote_revision_requested(
                request_id=request.id,
                correlation_id=correlation_id,
                actor_id=actor.id,
                quote_id=latest_quote.id,
                revision_notes=reason,
            ))

            # [DEFERRED] Non-MVP event
            # transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            #     event_type="quote_revision_requested",
            #     recipient_id=request.customer.id,
            #     resource_type="quote",
            #     resource_id=str(latest_quote.id),
            #     category="updates",
            #     title="Quote Revision Requested",
            #     message="A revision has been requested for your quote.",
            #     context={"reason": reason},
            #     is_system_critical=False,
            # ))
        else:
            raise ValueError(f"Invalid action type: {action_type}")

        StateHistory.objects.create(
            request=request,
            from_state=prev_status,
            to_state=new_status,
            actor=actor,
            correlation_id=correlation_id,
            reason=reason,
        )

        # Drive any subsequent automatic transitions (e.g. quote approved → no payment needed
        # → orchestrator moves to awaiting_assignment automatically).
        # Must run after save so context builder sees the updated state.
        from apps.requests.services.request_process_orchestrator import RequestProcessOrchestrator
        try:
            RequestProcessOrchestrator.sync(request.id)
        except Exception as exc:
            logger.error(f"Orchestrator sync failed after quote action on request {request.id}: {exc}")

        return request

    @staticmethod
    @transaction.atomic
    def expire_quotes() -> List[str]:
        """Sweeps for quotes > 30 days and cancels parent requests."""
        stale_quotes = Quote.objects.filter(
            status=QuoteStatus.ISSUED, expires_at__lt=timezone.now()
        )

        processed_ids = []
        for quote in stale_quotes:
            req = Request.objects.select_for_update().get(pk=quote.request_id)
            try:
                machine = RequestStateMachine(LifecycleState(req.status))
                new_status = machine.transition(
                    action=RequestAction.CANCEL, user_permissions=["system.timeout"]
                )

                old_request = Request.objects.get(pk=req.pk)
                prev_status = req.status
                req.status = new_status
                req.save()

                quote.status = QuoteStatus.EXPIRED
                quote.save()

                correlation_id = str(uuid.uuid4())
                log_transition(
                    action="quote.expired",
                    actor=None,
                    instance=req,
                    old_instance=old_request,
                    metadata={
                        "previous_state": prev_status,
                        "new_state": new_status,
                    },
                )
                log_transition(
                    action="request.cancelled",
                    actor=None,
                    instance=req,
                    old_instance=old_request,
                    reason="quote_expired",
                    metadata={
                        "previous_state": prev_status,
                        "new_state": new_status,
                    },
                )
                
                # CORRECTION: Now emitting BOTH quote.expired and request.cancelled
                transaction.on_commit(lambda r_id=req.id, c_id=correlation_id, q_id=quote.id: DomainEventPublisher.publish_quote_expired(
                    request_id=r_id,
                    correlation_id=c_id,
                    actor_id=0,
                    quote_id=q_id,
                ))

                # [DEFERRED] Non-MVP event
                # transaction.on_commit(lambda r_id=req.id, q_id=quote.id, c_id=req.customer_id: DispatchOrchestrator.dispatch_event(
                #     event_type="quote_expired",
                #     recipient_id=c_id,
                #     resource_type="quote",
                #     resource_id=str(q_id),
                #     category="alerts",
                #     title="Quote Expired",
                #     message="Your quote has expired.",
                #     context={},
                #     is_system_critical=False,
                # ))
                transaction.on_commit(lambda r_id=req.id, c_id=correlation_id: DomainEventPublisher.publish_request_cancelled(
                    request_id=r_id,
                    correlation_id=c_id,
                    actor_id=0,
                    reason_code="quote_expired"
                ))
                processed_ids.append(str(quote.id))

            except Exception as e:
                logger.error(f"Failed to expire quote {quote.id}: {str(e)}")
                continue

        return processed_ids
