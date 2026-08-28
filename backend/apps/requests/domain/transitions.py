from typing import Callable, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum
from .states import RequestState
from .actions import RequestAction
from .context import RequestContext

class TriggerType(Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"
    SYSTEM = "system"
    SCHEDULED = "scheduled"

@dataclass
class Transition:
    source: RequestState
    action: RequestAction
    target: RequestState
    required_permission: str
    trigger_type: TriggerType = TriggerType.MANUAL
    guard: Optional[Callable[[RequestContext], bool]] = None

def _has_valid_schema(context: RequestContext) -> bool:
    return context.has_valid_schema

def _staff_assigned(context: RequestContext) -> bool:
    return context.staff_assigned

def _category_requires_quote(context: RequestContext) -> bool:
    return context.category_requires_quote

def _category_skips_quote(context: RequestContext) -> bool:
    return not context.category_requires_quote

def _category_skips_quote_and_payment(context: RequestContext) -> bool:
    return not context.category_requires_quote and not context.category_requires_payment

def _category_allows_direct_close(context: RequestContext) -> bool:
    """information and support requests may be resolved directly by staff without technician assignment.
    Ref: docs/workflows/request-lifecycle.md §17
    """
    return context.category in {"information", "support"}

def _has_valid_quote_version(context: RequestContext) -> bool:
    return context.has_valid_quote_version

def _upfront_payment_required(context: RequestContext) -> bool:
    return context.upfront_payment_required

def _no_upfront_payment_required(context: RequestContext) -> bool:
    return not context.upfront_payment_required

def _revision_count_under_limit(context: RequestContext) -> bool:
    return context.revision_count < 3

def _revision_count_at_limit(context: RequestContext) -> bool:
    return context.revision_count >= 3

def _verified_transaction(context: RequestContext) -> bool:
    return context.payment_confirmed

def _tech_available(context: RequestContext) -> bool:
    return context.tech_available

def _within_timeout(context: RequestContext) -> bool:
    return context.within_timeout

def _decline_count_under_limit(context: RequestContext) -> bool:
    return context.decline_count < 3

def _decline_count_at_limit(context: RequestContext) -> bool:
    return context.decline_count >= 3

def _evidence_uploaded(context: RequestContext) -> bool:
    return context.evidence_uploaded

def _verification_not_required(context: RequestContext) -> bool:
    return not context.category_requires_verification

def _qa_pass(context: RequestContext) -> bool:
    return context.qa_pass

def _qa_fail(context: RequestContext) -> bool:
    return context.qa_fail

def _audit_justification_provided(context: RequestContext) -> bool:
    return context.audit_justification_provided

def _trigger_condition_met(context: RequestContext) -> bool:
    return context.trigger_condition_met

def _manager_pre_approval_needed(context: RequestContext) -> bool:
    return context.manager_pre_approval_needed

def _all_requirements_met_for_completion(context: RequestContext) -> bool:
    if context.has_order and not context.order_fulfilled:
        return False
    return True


def _fully_paid(context: RequestContext) -> bool:
    return context.is_fully_paid

def _partially_paid(context: RequestContext) -> bool:
    return context.is_partially_paid

def _work_verified(context: RequestContext) -> bool:
    return context.work_verified

def _work_not_verified(context: RequestContext) -> bool:
    return not context.work_verified

TRANSITIONS = [
    Transition(RequestState.DRAFT, RequestAction.SUBMIT, RequestState.SUBMITTED, "request.submit", TriggerType.MANUAL, _has_valid_schema),
    Transition(RequestState.SUBMITTED, RequestAction.PICK_UP, RequestState.STAFF_REVIEW, "request.triage", TriggerType.MANUAL, _staff_assigned),
    Transition(RequestState.STAFF_REVIEW, RequestAction.NEEDS_QUOTE, RequestState.AWAITING_QUOTE, "request.triage", TriggerType.MANUAL, _category_requires_quote),
    Transition(RequestState.STAFF_REVIEW, RequestAction.REQUIRE_PAYMENT, RequestState.AWAITING_PAYMENT, "request.triage", TriggerType.MANUAL, _category_skips_quote),
    Transition(RequestState.STAFF_REVIEW, RequestAction.ASSIGN_DIRECTLY, RequestState.AWAITING_ASSIGNMENT, "request.triage", TriggerType.MANUAL, _category_skips_quote_and_payment),
    Transition(RequestState.STAFF_REVIEW, RequestAction.CLOSE_DIRECT, RequestState.COMPLETED, "request.triage", TriggerType.MANUAL, _category_allows_direct_close),
    Transition(RequestState.AWAITING_QUOTE, RequestAction.ISSUE_QUOTE, RequestState.AWAITING_CUSTOMER_APPROVAL, "quote.create", TriggerType.MANUAL, _has_valid_quote_version),
    Transition(RequestState.IN_PROGRESS, RequestAction.ISSUE_QUOTE, RequestState.AWAITING_CUSTOMER_APPROVAL, "quote.create", TriggerType.MANUAL, _has_valid_quote_version),
    Transition(RequestState.AWAITING_CUSTOMER_APPROVAL, RequestAction.APPROVE_QUOTE_PAYMENT_REQ, RequestState.AWAITING_PAYMENT, "quote.approve", TriggerType.MANUAL, _upfront_payment_required),
    Transition(RequestState.AWAITING_CUSTOMER_APPROVAL, RequestAction.APPROVE_QUOTE_NO_PAYMENT, RequestState.IN_PROGRESS, "quote.approve", TriggerType.MANUAL, lambda ctx: _no_upfront_payment_required(ctx) and _tech_available(ctx)),
    Transition(RequestState.AWAITING_CUSTOMER_APPROVAL, RequestAction.APPROVE_QUOTE_NO_PAYMENT, RequestState.AWAITING_ASSIGNMENT, "quote.approve", TriggerType.MANUAL, lambda ctx: _no_upfront_payment_required(ctx) and not _tech_available(ctx)),
    Transition(RequestState.AWAITING_CUSTOMER_APPROVAL, RequestAction.REQUEST_REVISION, RequestState.AWAITING_QUOTE, "quote.revise", TriggerType.MANUAL, _revision_count_under_limit),
    Transition(RequestState.AWAITING_CUSTOMER_APPROVAL, RequestAction.REQUEST_REVISION, RequestState.ESCALATED, "quote.revise", TriggerType.MANUAL, _revision_count_at_limit),
    Transition(RequestState.AWAITING_CUSTOMER_APPROVAL, RequestAction.REJECT_QUOTE, RequestState.AWAITING_QUOTE, "quote.reject", TriggerType.MANUAL),
    Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.COMPLETED, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and _work_verified(ctx)),
    Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.AWAITING_ASSIGNMENT, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and ctx.requires_technician and not _tech_available(ctx) and _work_not_verified(ctx)),
    Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.IN_PROGRESS, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and (not ctx.requires_technician or _tech_available(ctx)) and _work_not_verified(ctx)),
    Transition(RequestState.IN_PROGRESS, RequestAction.ORDER_FULFILLED, RequestState.COMPLETED, "system.fulfillment", TriggerType.SYSTEM, lambda ctx: not ctx.requires_technician and ctx.order_fulfilled),
    Transition(RequestState.AWAITING_ASSIGNMENT, RequestAction.ASSIGN_TECH, RequestState.ASSIGNED, "request.assign", TriggerType.MANUAL, _tech_available),
    Transition(RequestState.ASSIGNED, RequestAction.ACCEPT, RequestState.IN_PROGRESS, "assignment.accept", TriggerType.MANUAL, _within_timeout),
    Transition(RequestState.ASSIGNED, RequestAction.DECLINE, RequestState.AWAITING_ASSIGNMENT, "assignment.decline", TriggerType.MANUAL, _decline_count_under_limit),
    Transition(RequestState.ASSIGNED, RequestAction.DECLINE, RequestState.ESCALATED, "assignment.decline", TriggerType.MANUAL, _decline_count_at_limit),
    Transition(RequestState.ASSIGNED, RequestAction.TIMEOUT, RequestState.ESCALATED, "system.timeout", TriggerType.SCHEDULED, _decline_count_at_limit),
    Transition(RequestState.IN_PROGRESS, RequestAction.MARK_FINISHED, RequestState.PENDING_VERIFICATION, "verification.submit", TriggerType.MANUAL, _evidence_uploaded),
    Transition(RequestState.IN_PROGRESS, RequestAction.MARK_FINISHED_NO_VERIFICATION, RequestState.COMPLETED, "verification.submit", TriggerType.MANUAL, lambda ctx: _verification_not_required(ctx) and _all_requirements_met_for_completion(ctx)),
    Transition(RequestState.PENDING_VERIFICATION, RequestAction.APPROVE_VERIFICATION, RequestState.COMPLETED, "verification.verify", TriggerType.MANUAL, lambda ctx: _qa_pass(ctx) and _all_requirements_met_for_completion(ctx) and _fully_paid(ctx)),
    Transition(RequestState.PENDING_VERIFICATION, RequestAction.APPROVE_VERIFICATION, RequestState.AWAITING_PAYMENT, "verification.verify", TriggerType.MANUAL, lambda ctx: _qa_pass(ctx) and _partially_paid(ctx)),
    Transition(RequestState.PENDING_VERIFICATION, RequestAction.REJECT_VERIFICATION, RequestState.IN_PROGRESS, "verification.verify", TriggerType.MANUAL, _qa_fail),
    Transition(RequestState.PENDING_VERIFICATION, RequestAction.OVERRIDE_VERIFICATION, RequestState.COMPLETED, "verification.override", TriggerType.MANUAL, lambda ctx: _audit_justification_provided(ctx) and _all_requirements_met_for_completion(ctx)),
    Transition(RequestState.ESCALATED, RequestAction.RESOLVE_ESCALATION, RequestState.AWAITING_ASSIGNMENT, "escalation.resolve", TriggerType.MANUAL),
    Transition(RequestState.ESCALATED, RequestAction.RESOLVE_ESCALATION, RequestState.ASSIGNED, "escalation.resolve", TriggerType.MANUAL),
    Transition(RequestState.ESCALATED, RequestAction.RESOLVE_ESCALATION, RequestState.IN_PROGRESS, "escalation.resolve", TriggerType.MANUAL),
    Transition(RequestState.ESCALATED, RequestAction.RESOLVE_ESCALATION, RequestState.CANCELLED, "escalation.resolve", TriggerType.MANUAL),
]

# Cancellation Transitions
for state in RequestState:
    if state not in [RequestState.COMPLETED, RequestState.CANCELLED]:
        if state in [RequestState.ASSIGNED, RequestState.IN_PROGRESS, RequestState.PENDING_VERIFICATION]:
            TRANSITIONS.append(Transition(state, RequestAction.CANCEL_ACTIVE, RequestState.CANCELLED, "request.cancel_active", TriggerType.MANUAL, _manager_pre_approval_needed))
        else:
             TRANSITIONS.append(Transition(state, RequestAction.CANCEL, RequestState.CANCELLED, "request.cancel", TriggerType.MANUAL))

# Escalation Transitions
for state in RequestState:
    if state not in [RequestState.COMPLETED, RequestState.CANCELLED, RequestState.ESCALATED]:
        TRANSITIONS.append(Transition(state, RequestAction.ESCALATE, RequestState.ESCALATED, "request.escalate", TriggerType.SYSTEM, _trigger_condition_met))
