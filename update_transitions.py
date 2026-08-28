import sys

with open('backend/apps/requests/domain/transitions.py', 'r', encoding='utf-8') as f:
    text = f.read()

funcs_to_add = """
def _fully_paid(context: RequestContext) -> bool:
    return context.is_fully_paid

def _partially_paid(context: RequestContext) -> bool:
    return context.is_partially_paid

def _work_verified(context: RequestContext) -> bool:
    return context.work_verified

def _work_not_verified(context: RequestContext) -> bool:
    return not context.work_verified
"""

# Insert functions before TRANSITIONS = [
if 'TRANSITIONS = [' in text:
    text = text.replace('TRANSITIONS = [', funcs_to_add + '\nTRANSITIONS = [')

# Update verification approve rules:
target1 = 'Transition(RequestState.PENDING_VERIFICATION, RequestAction.APPROVE_VERIFICATION, RequestState.COMPLETED, "verification.verify", TriggerType.MANUAL, lambda ctx: _qa_pass(ctx) and _all_requirements_met_for_completion(ctx)),'
repl1 = """Transition(RequestState.PENDING_VERIFICATION, RequestAction.APPROVE_VERIFICATION, RequestState.COMPLETED, "verification.verify", TriggerType.MANUAL, lambda ctx: _qa_pass(ctx) and _all_requirements_met_for_completion(ctx) and _fully_paid(ctx)),
    Transition(RequestState.PENDING_VERIFICATION, RequestAction.APPROVE_VERIFICATION, RequestState.AWAITING_PAYMENT, "verification.verify", TriggerType.MANUAL, lambda ctx: _qa_pass(ctx) and _partially_paid(ctx)),"""
text = text.replace(target1, repl1)

# Update payment webhook rules:
target2 = 'Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.AWAITING_ASSIGNMENT, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and ctx.requires_technician and not _tech_available(ctx)),'
repl2 = """Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.COMPLETED, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and _work_verified(ctx)),
    Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.AWAITING_ASSIGNMENT, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and ctx.requires_technician and not _tech_available(ctx) and _work_not_verified(ctx)),"""
text = text.replace(target2, repl2)

target3 = 'Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.IN_PROGRESS, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and (not ctx.requires_technician or _tech_available(ctx))),'
repl3 = 'Transition(RequestState.AWAITING_PAYMENT, RequestAction.PAYMENT_WEBHOOK, RequestState.IN_PROGRESS, "system.webhook", TriggerType.SYSTEM, lambda ctx: _verified_transaction(ctx) and (not ctx.requires_technician or _tech_available(ctx)) and _work_not_verified(ctx)),'
text = text.replace(target3, repl3)

with open('backend/apps/requests/domain/transitions.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("SUCCESS")
