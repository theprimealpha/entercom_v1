from celery import shared_task
import logging
from apps.requests.models import Request, LifecycleState
from apps.requests.models.quote import Quote
from apps.notification.services import DispatchOrchestrator

logger = logging.getLogger(__name__)

@shared_task
def send_final_balance_reminder(request_id: str) -> None:
    """
    Sends a reminder to the customer to pay their final balance.
    Checks if the request is still AWAITING_PAYMENT and if the active quote is still partially_paid.
    """
    try:
        request = Request.objects.get(pk=request_id)
    except Request.DoesNotExist:
        return

    # Check if request is still awaiting payment
    if request.status != LifecycleState.AWAITING_PAYMENT:
        logger.info(f"Final balance reminder skipped for Request {request_id}: Status is {request.status}")
        return

    # Check quote status
    active_quote = Quote.objects.filter(request=request).order_by('-created_at').first()
    if not active_quote or active_quote.status != 'partially_paid':
        logger.info(f"Final balance reminder skipped for Request {request_id}: Quote is not partially_paid")
        return

    # Send reminder
    DispatchOrchestrator.dispatch_event(
        event_type="payment_reminder",
        recipient_id=request.customer_id,
        context={
            "quote_id": str(active_quote.id),
            "amount_remaining": float(active_quote.amount) - (float(active_quote.amount_paid) if active_quote.amount_paid else 0.0)
        },
        resource_type="request",
        resource_id=str(request.id),
        category="updates",
        title="Final Balance Due",
        message=f"Your request has been verified! Please pay the final balance of your quote.",
        is_system_critical=True,
    )
    logger.info(f"Final balance reminder sent for Request {request_id}")
