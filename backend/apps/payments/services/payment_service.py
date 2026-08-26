from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.payments.models import Payment, PaymentStatus
from apps.payments.models import Payment, PaymentStatus
from core.events import event_publisher
from apps.audit_logs.services.audit_service import log_action, log_creation, log_transition
from core.permissions import require_permission
from apps.notification.services import DispatchOrchestrator

class PaymentService:
    """
    Orchestrates the internal Payment aggregate lifecycle, handles retries, and manages provider synchronization.
    """
    @staticmethod
    @transaction.atomic
    def initialize_payment(actor, correlation_id, order_id, request_id, customer_id, amount, currency, provider_reference, callback_url=None):
        require_permission(actor, 'payment.initialize')
        
        payment = Payment.objects.select_for_update().filter(order_id=order_id).first()
        is_new = False
        if payment:
            old_payment = Payment.objects.get(pk=payment.pk)
            payment.provider_reference = provider_reference
            payment.status = PaymentStatus.PENDING
            payment.save()
        else:
            is_new = True
            payment = Payment.objects.create(
                order_id=order_id,
                request_id=request_id,
                customer_id=customer_id,
                provider_reference=provider_reference,
                amount=amount,
                currency=currency,
                status=PaymentStatus.PENDING,
                correlation_id=correlation_id
            )
            
        if is_new:
            log_creation(
                action='payment.initialized',
                actor=actor,
                instance=payment,
                metadata={
                    'order_id': str(order_id),
                    'amount': str(amount),
                    'currency': currency,
                    'paystack_reference': provider_reference,
                    'correlation_id': correlation_id
                }
            )
        else:
            log_transition(
                action='payment.initialized',
                actor=actor,
                instance=payment,
                old_instance=old_payment,
                metadata={
                    'order_id': str(order_id),
                    'amount': str(amount),
                    'currency': currency,
                    'paystack_reference': provider_reference,
                    'correlation_id': correlation_id
                }
            )
        
        event_publisher.publish(
            event_name='payment.initialized',
            event_version=1,
            correlation_id=correlation_id,
            occurred_at=timezone.now(),
            producer='PaymentService',
            data={
                'payment_id': str(payment.id),
                'order_id': str(order_id),
                'amount': float(amount),
                'currency': currency,
                'paystack_reference': provider_reference
            }
        )
        
        from apps.orders.services.order_service import OrderService
        OrderService.require_payment(
            actor=actor,
            correlation_id=correlation_id,
            order_id=payment.order_id,
            payment_id=payment.id,
            amount=payment.amount
        )

        import requests
        from django.conf import settings
        from django.contrib.auth import get_user_model
        
        paystack_secret = getattr(settings, 'PAYSTACK_SECRET_KEY', '')
        
        if not paystack_secret or paystack_secret == 'sk_test_fake_secret':
            # Mock URL for local testing without real keys
            payment.authorization_url = f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')}/portal/customer/orders/{order_id}?mock_payment=true&reference={provider_reference}"
        else:
            User = get_user_model()
            customer = User.objects.filter(id=customer_id).first()
            email = customer.email if customer and customer.email else "customer@example.com"
            
            final_callback_url = callback_url or f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')}/portal/customer/orders/{order_id}"
            
            url = "https://api.paystack.co/transaction/initialize"
            headers = {
                "Authorization": f"Bearer {paystack_secret}",
                "Content-Type": "application/json"
            }
            payload = {
                "email": email,
                "amount": int(float(amount) * 100),
                "reference": provider_reference,
                "currency": currency,
                "callback_url": final_callback_url
            }
            try:
                response = requests.post(url, json=payload, headers=headers)
                response_data = response.json()
                if response_data.get('status'):
                    payment.authorization_url = response_data['data']['authorization_url']
                else:
                    raise ValidationError(f"Paystack initialization failed: {response_data.get('message')}")
            except Exception as e:
                raise ValidationError(f"Paystack request failed: {str(e)}")

        return payment

    @staticmethod
    @transaction.atomic
    def initialize_quote_payment(actor, correlation_id, quote_id, payment_plan, provider_reference, callback_url=None):
        require_permission(actor, 'payment.initialize')
        from apps.requests.models import Quote, Request
        quote = Quote.objects.select_for_update().get(id=quote_id)
        request = quote.request
        
        # Calculate amount based on plan
        if payment_plan == 'full':
            amount = quote.amount - quote.amount_paid
        elif payment_plan == 'fifty_fifty':
            if quote.amount_paid >= (quote.amount / 2):
                # If they already paid 50%, they must be paying the balance now.
                # Check if request state allows final payment.
                if request.status not in ['completed', 'verified']: # Assuming final payment requires completion
                    raise ValidationError("Final balance can only be paid when request is completed.")
                amount = quote.amount - quote.amount_paid
            else:
                amount = quote.amount / 2
        else:
            raise ValidationError("Invalid payment plan.")
            
        if amount <= 0:
            raise ValidationError("No outstanding balance to pay.")
            
        quote.payment_plan = payment_plan
        quote.save()

        payment = Payment.objects.filter(quote_id=quote_id, status=PaymentStatus.PENDING).first()
        is_new = False
        if payment:
            old_payment = Payment.objects.get(pk=payment.pk)
            payment.provider_reference = provider_reference
            payment.amount = amount
            payment.save()
        else:
            is_new = True
            payment = Payment.objects.create(
                quote_id=quote_id,
                request_id=request.id,
                customer_id=actor.id,
                provider_reference=provider_reference,
                amount=amount,
                currency="NGN",
                status=PaymentStatus.PENDING,
                correlation_id=correlation_id
            )
            
        import requests
        from django.conf import settings
        from django.contrib.auth import get_user_model
        
        paystack_secret = getattr(settings, 'PAYSTACK_SECRET_KEY', '')
        
        if not paystack_secret or paystack_secret == 'sk_test_fake_secret':
            payment.authorization_url = f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')}/portal/customer/requests/{request.id}?mock_payment=true&reference={provider_reference}"
        else:
            User = get_user_model()
            customer = User.objects.filter(id=actor.id).first()
            email = customer.email if customer and customer.email else "customer@example.com"
            
            final_callback_url = callback_url or f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')}/portal/customer/requests/{request.id}"
            
            url = "https://api.paystack.co/transaction/initialize"
            headers = {
                "Authorization": f"Bearer {paystack_secret}",
                "Content-Type": "application/json"
            }
            payload = {
                "email": email,
                "amount": int(float(amount) * 100),
                "reference": provider_reference,
                "currency": "NGN",
                "callback_url": final_callback_url
            }
            try:
                response = requests.post(url, json=payload, headers=headers)
                response_data = response.json()
                if response_data.get('status'):
                    payment.authorization_url = response_data['data']['authorization_url']
                else:
                    raise ValidationError(f"Paystack initialization failed: {response_data.get('message')}")
            except Exception as e:
                raise ValidationError(f"Paystack request failed: {str(e)}")

        return payment

    @staticmethod
    @transaction.atomic
    def expire_payments(actor, correlation_id):
        cutoff_time = timezone.now() - timezone.timedelta(hours=24)
        expired_payments = Payment.objects.select_for_update().filter(
            status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
            created_at__lte=cutoff_time
        )
        
        for payment in expired_payments:
            old_payment = Payment.objects.get(pk=payment.pk)
            payment.status = PaymentStatus.CANCELLED
            payment.save()
            
            log_transition(
                action='payment.expired',
                actor=actor,
                instance=payment,
                old_instance=old_payment,
                metadata={
                    'order_id': str(payment.order_id),
                    'correlation_id': correlation_id
                }
            )
            event_publisher.publish(
                event_name='payment.expired',
                event_version=1,
                correlation_id=correlation_id,
                occurred_at=timezone.now(),
                producer='PaymentService',
                data={
                    'payment_id': str(payment.id),
                    'order_id': str(payment.order_id)
                }
            )

            # [DEFERRED] Non-MVP event
            # transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
            #     event_type="payment_expired",
            #     recipient_id=payment.customer_id,
            #     resource_type="payment",
            #     resource_id=str(payment.id),
            #     category="alerts",
            #     title="Payment Expired",
            #     message="Your payment session has expired.",
            #     context={},
            #     is_system_critical=False,
            # ))

    @staticmethod
    @transaction.atomic
    def cancel_payment(actor, correlation_id, payment_id):
        require_permission(actor, 'payment.cancel')
        payment = Payment.objects.select_for_update().filter(id=payment_id).first()
        if not payment:
            raise ValidationError("Payment not found.")
            
        old_payment = Payment.objects.get(pk=payment.pk)
        payment.status = PaymentStatus.CANCELLED
        payment.save()

        log_transition(
            action='payment.cancelled',
            actor=actor,
            instance=payment,
            old_instance=old_payment,
            metadata={
                'order_id': str(payment.order_id),
                'correlation_id': correlation_id
            }
        )

        event_publisher.publish(
            event_name='payment.cancelled',
            event_version=1,
            correlation_id=correlation_id,
            occurred_at=timezone.now(),
            producer='PaymentService',
            data={
                'payment_id': str(payment.id),
                'order_id': str(payment.order_id)
            }
        )
        return payment

    @staticmethod
    @transaction.atomic
    def refund_payment(actor, correlation_id, payment_id):
        require_permission(actor, 'payment.refund')
        payment = Payment.objects.select_for_update().filter(id=payment_id).first()
        if not payment:
            raise ValidationError("Payment not found.")
            
        if payment.status != PaymentStatus.PAID:
            raise ValidationError("Only paid payments can be refunded.")
            
        old_payment = Payment.objects.get(pk=payment.pk)
        payment.status = PaymentStatus.REFUNDED
        payment.save()

        log_transition(
            action='payment.refunded',
            actor=actor,
            instance=payment,
            old_instance=old_payment,
            metadata={
                'order_id': str(payment.order_id),
                'amount': str(payment.amount),
                'correlation_id': correlation_id
            }
        )

        event_publisher.publish(
            event_name='payment.refunded',
            event_version=1,
            correlation_id=correlation_id,
            occurred_at=timezone.now(),
            producer='PaymentService',
            data={
                'payment_id': str(payment.id),
                'order_id': str(payment.order_id),
                'amount': float(payment.amount)
            }
        )

        # [DEFERRED] Non-MVP event
        # transaction.on_commit(lambda: DispatchOrchestrator.dispatch_event(
        #     event_type="refund_issued",
        #     recipient_id=payment.customer_id,
        #     resource_type="payment",
        #     resource_id=str(payment.id),
        #     category="updates",
        #     title="Refund Issued",
        #     message="A refund has been issued for your payment.",
        #     context={"amount": float(payment.amount)},
        #     is_system_critical=False,
        # ))
        
        from apps.orders.services.order_service import OrderService
        OrderService.cancel_order(
            actor=actor,
            correlation_id=correlation_id,
            order_id=payment.order_id,
            cancellation_reason="Payment was refunded"
        )
        
        return payment

    @staticmethod
    @transaction.atomic
    def escalate_payment(actor, correlation_id, payment_id, reason):
        require_permission(actor, 'payment.escalate')
        payment = Payment.objects.select_for_update().filter(id=payment_id).first()
        if not payment:
            raise ValidationError("Payment not found.")
            
        old_payment = Payment.objects.get(pk=payment.pk)
        payment.status = PaymentStatus.ESCALATED
        payment.save()

        log_transition(
            action='payment.escalated',
            actor=actor,
            instance=payment,
            old_instance=old_payment,
            metadata={
                'order_id': str(payment.order_id),
                'reason': reason,
                'correlation_id': correlation_id
            }
        )

        event_publisher.publish(
            event_name='payment.escalated',
            event_version=1,
            correlation_id=correlation_id,
            occurred_at=timezone.now(),
            producer='PaymentService',
            data={
                'payment_id': str(payment.id),
                'order_id': str(payment.order_id),
                'reason': reason
            }
        )
        return payment
