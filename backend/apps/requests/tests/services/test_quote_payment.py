import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from apps.requests.models import Request, LifecycleState, Quote, QuoteStatus
from apps.requests.models.quote import PaymentPlan
from apps.payments.models import Payment, PaymentStatus
from apps.payments.services.payment_service import PaymentService
from apps.payments.services.webhook_service import WebhookService
from apps.requests.services.quote_service import QuoteService

User = get_user_model()

@pytest.fixture
def customer_user(db):
    return User.objects.create(email="customer2@test.com", role="CUSTOMER")

@pytest.fixture
def tech_user(db):
    return User.objects.create(email="tech2@test.com", role="TECHNICIAN")

@pytest.fixture
def awaiting_payment_request(customer_user, tech_user):
    req = Request.objects.create(
        public_id="REQ-TEST-PAY",
        customer=customer_user,
        assigned_technician=tech_user,
        category="installation",
        status=LifecycleState.AWAITING_PAYMENT,
        description="Test payment"
    )
    quote = QuoteService.create_quote(
        request_id=req.id,
        actor=tech_user,
        data={"amount": 200.0}
    )
    QuoteService.approve_quote(request_id=req.id, actor=customer_user)
    req.refresh_from_db()
    return req

@pytest.mark.django_db(transaction=True)
class TestQuotePayment:
    def test_full_payment(self, customer_user, awaiting_payment_request):
        quote = awaiting_payment_request.quotes.first()
        payment = PaymentService.initialize_quote_payment(
            actor=customer_user,
            correlation_id="cor-1",
            quote_id=quote.id,
            payment_plan=PaymentPlan.FULL,
            provider_reference="REF-FULL-01"
        )
        assert payment.amount == 200.0
        assert payment.quote_id == quote.id
        
        quote.refresh_from_db()
        assert quote.payment_plan == PaymentPlan.FULL

        # Simulate webhook payment success
        WebhookService.process_webhook(
            actor=customer_user,
            correlation_id="cor-2",
            payload={
                "event": "charge.success",
                "data": {"reference": "REF-FULL-01"}
            },
            signature="test",
            secret_key="sk_test_fake_secret",
            raw_body=b""
        )
        
        quote.refresh_from_db()
        assert quote.amount_paid == 200.0
        assert quote.status == QuoteStatus.PAID
        
        awaiting_payment_request.refresh_from_db()
        # Orchestrator would run and transition it. It should at least be out of AWAITING_PAYMENT.
        # It transitions to awaiting_assignment.
        assert awaiting_payment_request.status == LifecycleState.AWAITING_ASSIGNMENT

    def test_fifty_fifty_payment(self, customer_user, awaiting_payment_request):
        quote = awaiting_payment_request.quotes.first()
        payment = PaymentService.initialize_quote_payment(
            actor=customer_user,
            correlation_id="cor-3",
            quote_id=quote.id,
            payment_plan=PaymentPlan.FIFTY_FIFTY,
            provider_reference="REF-HALF-01"
        )
        assert payment.amount == 100.0
        assert payment.quote_id == quote.id
        
        quote.refresh_from_db()
        assert quote.payment_plan == PaymentPlan.FIFTY_FIFTY

        # Simulate webhook
        WebhookService.process_webhook(
            actor=customer_user,
            correlation_id="cor-4",
            payload={
                "event": "charge.success",
                "data": {"reference": "REF-HALF-01"}
            },
            signature="test",
            secret_key="sk_test_fake_secret",
            raw_body=b""
        )
        
        quote.refresh_from_db()
        assert quote.amount_paid == 100.0
        assert quote.status == QuoteStatus.PARTIALLY_PAID
        
        awaiting_payment_request.refresh_from_db()
        assert awaiting_payment_request.status == LifecycleState.AWAITING_ASSIGNMENT
        
        # In the new flow, the request re-enters AWAITING_PAYMENT when verified
        awaiting_payment_request.status = LifecycleState.AWAITING_PAYMENT
        awaiting_payment_request.save()
        
        # Now we can pay balance
        payment2 = PaymentService.initialize_quote_payment(
            actor=customer_user,
            correlation_id="cor-6",
            quote_id=quote.id,
            payment_plan=PaymentPlan.FIFTY_FIFTY,
            provider_reference="REF-HALF-02"
        )
        assert payment2.amount == 100.0
        
        WebhookService.process_webhook(
            actor=customer_user,
            correlation_id="cor-7",
            payload={
                "event": "charge.success",
                "data": {"reference": "REF-HALF-02"}
            },
            signature="test",
            secret_key="sk_test_fake_secret",
            raw_body=b""
        )
        quote.refresh_from_db()
        assert quote.amount_paid == 200.0
        assert quote.status == QuoteStatus.PAID
