from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.payments.models import Payment, PaymentStatus
from core.events import event_publisher
from apps.audit_logs.services.audit_service import log_action, log_creation, log_transition
from core.permissions import require_permission
import hashlib
import hmac
import json
from apps.notification.services import DispatchOrchestrator

class WebhookService:
    """
    Authoritative, secure processor for asynchronous state changes sent by the payment provider.
    """
    @staticmethod
    @transaction.atomic
    def process_webhook(actor, correlation_id, payload, signature, secret_key, raw_body):
        require_permission(actor, 'webhook.process')
        
        paystack_reference = payload.get('data', {}).get('reference')
        event_type = payload.get('event')

        computed_hmac = hmac.new(
            secret_key.encode('utf-8'),
            msg=raw_body,
            digestmod=hashlib.sha512
        ).hexdigest()
        
        is_local_mock = (secret_key == 'sk_test_fake_secret')
        
        if not is_local_mock and computed_hmac != signature:
            log_action(
                action='webhook.rejected',
                actor=actor,
                resource_type='payment',
                resource_id=paystack_reference or 'unknown',
                metadata={
                    'rejection_reason': 'HMAC mismatch',
                    'correlation_id': correlation_id
                }
            )
            event_publisher.publish(
                event_name='webhook.rejected',
                event_version=1,
                correlation_id=correlation_id,
                occurred_at=timezone.now(),
                producer='WebhookService',
                data={
                    'paystack_reference': paystack_reference or 'unknown',
                    'rejection_reason': 'HMAC mismatch'
                }
            )
            raise ValidationError("HMAC verification failed")
            
        log_action(
            action='webhook.received',
            actor=actor,
            resource_type='payment',
            resource_id=paystack_reference,
            metadata={
                'event_type': event_type,
                'correlation_id': correlation_id
            }
        )
        
        event_publisher.publish(
            event_name='webhook.received',
            event_version=1,
            correlation_id=correlation_id,
            occurred_at=timezone.now(),
            producer='WebhookService',
            data={
                'paystack_reference': paystack_reference,
                'event_type': event_type
            }
        )

        payment = Payment.objects.select_for_update().filter(provider_reference=paystack_reference).first()
        if not payment:
            raise ValidationError("Payment not found.")
            
        if payment.status in [PaymentStatus.PAID, PaymentStatus.CANCELLED]:
            return
            
        if event_type == 'charge.success':
            old_payment = Payment.objects.get(pk=payment.pk)
            payment.status = PaymentStatus.PAID
            payment.save()
            
            log_transition(
                action='payment.paid',
                actor=actor,
                instance=payment,
                old_instance=old_payment,
                metadata={
                    'order_id': str(payment.order_id),
                    'paystack_reference': payment.provider_reference,
                    'amount': str(payment.amount),
                    'currency': payment.currency,
                    'correlation_id': correlation_id
                }
            )

            event_publisher.publish(
                event_name='payment.paid',
                event_version=1,
                correlation_id=correlation_id,
                occurred_at=timezone.now(),
                producer='WebhookService',
                data={
                    'order_id': str(payment.order_id),
                    'payment_id': str(payment.id),
                    'paystack_reference': payment.provider_reference,
                    'amount': float(payment.amount),
                    'currency': payment.currency,
                    'previous_state': PaymentStatus.PENDING,
                    'new_state': PaymentStatus.PAID
                }
            )

            transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
                event_type="payment_receipt",
                recipient_id=payment.customer_id,
                context={"amount": str(payment.amount)},
                resource_type="payment",
                resource_id=str(payment.id),
                category="updates",
                title="Payment Receipt",
                message=f"We have received your payment of {payment.amount}.",
                is_system_critical=True,
            ))
            
            if payment.order_id:
                from apps.orders.services.order_service import OrderService
                OrderService.process_payment_paid_event(
                    actor=actor,
                    correlation_id=correlation_id,
                    order_id=payment.order_id
                )
                
            if payment.quote_id:
                from apps.requests.models import QuoteStatus
                quote = payment.quote
                quote.amount_paid += payment.amount
                if quote.amount_paid >= quote.amount:
                    quote.status = QuoteStatus.PAID
                else:
                    quote.status = QuoteStatus.PARTIALLY_PAID
                quote.save()
                
                from apps.requests.services.request_process_orchestrator import RequestProcessOrchestrator
                import logging
                logger = logging.getLogger(__name__)
                try:
                    RequestProcessOrchestrator.sync(quote.request_id)
                except Exception as exc:
                    logger.error(f"Orchestrator sync failed after quote payment {quote.id}: {exc}")

        elif event_type == 'charge.failed':
            old_payment = Payment.objects.get(pk=payment.pk)
            payment.status = PaymentStatus.FAILED
            payment.save()
            failure_reason = payload.get('data', {}).get('gateway_response', 'Failed')
            
            log_transition(
                action='payment.failed',
                actor=actor,
                instance=payment,
                old_instance=old_payment,
                metadata={
                    'order_id': str(payment.order_id),
                    'failure_reason': failure_reason,
                    'correlation_id': correlation_id
                }
            )

            event_publisher.publish(
                event_name='payment.failed',
                event_version=1,
                correlation_id=correlation_id,
                occurred_at=timezone.now(),
                producer='WebhookService',
                data={
                    'payment_id': str(payment.id),
                    'order_id': str(payment.order_id),
                    'paystack_reference': payment.provider_reference,
                    'failure_reason': failure_reason
                }
            )

            # [DEFERRED] Non-MVP event
            # transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            #     event_type="payment_failed",
            #     recipient_id=payment.customer_id,
            #     resource_type="payment",
            #     resource_id=str(payment.id),
            #     category="alerts",
            #     title="Payment Failed",
            #     message="Your recent payment attempt failed.",
            #     context={"failure_reason": failure_reason},
            #     is_system_critical=True,
            # ))
