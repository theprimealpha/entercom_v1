import pytest
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model
from apps.requests.models import Request, LifecycleState, Quote, QuoteStatus
from apps.requests.models.quote import PaymentPlan
from apps.requests.services.request_process_orchestrator import RequestProcessOrchestrator
from apps.requests.services.quote_service import QuoteService
from apps.requests.tasks.reminder_tasks import send_final_balance_reminder
from apps.payments.models import Payment, PaymentStatus
from apps.payments.services.payment_service import PaymentService
from apps.payments.services.webhook_service import WebhookService
from apps.requests.models.verification import Verification

User = get_user_model()

@pytest.fixture
def test_users(db):
    return {
        "customer": User.objects.create(email="c1@test.com", role="CUSTOMER"),
        "staff": User.objects.create(email="s1@test.com", role="STAFF"),
        "tech": User.objects.create(email="t1@test.com", role="TECHNICIAN")
    }

@pytest.fixture
def partially_paid_verified_request(test_users):
    req = Request.objects.create(
        public_id="REQ-5050",
        customer=test_users["customer"],
        assigned_technician=test_users["tech"],
        category="installation",
        status=LifecycleState.PENDING_VERIFICATION,
        description="Test 50/50"
    )
    quote = QuoteService.create_quote(
        request_id=req.id,
        actor=test_users["tech"],
        data={"amount": 200.0}
    )
    QuoteService.approve_quote(request_id=req.id, actor=test_users["customer"])
    quote.payment_plan = PaymentPlan.FIFTY_FIFTY
    quote.amount_paid = 100.0
    quote.status = QuoteStatus.PARTIALLY_PAID
    quote.save()

    Verification.objects.create(
        request=req,
        status='approved',
        comments="Looks good"
    )
    return req

@pytest.fixture
def fully_paid_verified_request(test_users):
    req = Request.objects.create(
        public_id="REQ-100",
        customer=test_users["customer"],
        assigned_technician=test_users["tech"],
        category="installation",
        status=LifecycleState.PENDING_VERIFICATION,
        description="Test Full"
    )
    quote = QuoteService.create_quote(
        request_id=req.id,
        actor=test_users["tech"],
        data={"amount": 200.0}
    )
    QuoteService.approve_quote(request_id=req.id, actor=test_users["customer"])
    quote.payment_plan = PaymentPlan.FULL
    quote.amount_paid = 200.0
    quote.status = QuoteStatus.PAID
    quote.save()

    Verification.objects.create(
        request=req,
        status='approved',
        comments="Looks good"
    )
    return req

@pytest.mark.django_db(transaction=True)
class TestFinalBalanceOrchestration:

    @patch('apps.requests.tasks.reminder_tasks.send_final_balance_reminder.delay')
    @patch('apps.requests.tasks.reminder_tasks.send_final_balance_reminder.apply_async')
    def test_50_50_payment_work_final_payment(self, mock_apply_async, mock_delay, partially_paid_verified_request, test_users):
        req = partially_paid_verified_request
        
        # 1. Staff verifies work (Orchestrator syncs)
        RequestProcessOrchestrator.sync(req.id)
        req.refresh_from_db()
        
        # Since it's only 50% paid, it should go to AWAITING_PAYMENT
        assert req.status == LifecycleState.AWAITING_PAYMENT
        
        # Celery tasks should be called
        assert mock_delay.called
        assert mock_apply_async.called

        # 2. Final payment arrives
        quote = req.quotes.first()
        payment = PaymentService.initialize_quote_payment(
            actor=test_users["customer"],
            correlation_id="cor-final",
            quote_id=quote.id,
            payment_plan=PaymentPlan.FULL,
            provider_reference="REF-FINAL-01"
        )
        
        WebhookService.process_webhook(
            actor=test_users["customer"],
            correlation_id="cor-final-hook",
            payload={"event": "charge.success", "data": {"reference": "REF-FINAL-01"}},
            signature="test",
            secret_key="sk_test_fake_secret",
            raw_body=b""
        )
        
        req.refresh_from_db()
        # Because work is verified, webhook transitions it directly to COMPLETED
        assert req.status == LifecycleState.COMPLETED
        quote.refresh_from_db()
        assert quote.amount_paid == 200.0
        assert quote.status == QuoteStatus.PAID

    @patch('apps.requests.tasks.reminder_tasks.send_final_balance_reminder.delay')
    def test_100_upfront_payment(self, mock_delay, fully_paid_verified_request):
        req = fully_paid_verified_request
        
        # 1. Staff verifies work
        RequestProcessOrchestrator.sync(req.id)
        req.refresh_from_db()
        
        # Fully paid goes directly to completed
        assert req.status == LifecycleState.COMPLETED
        # No reminder should be sent
        assert not mock_delay.called

    @patch('apps.notification.services.DispatchOrchestrator.dispatch_event')
    def test_reminder_execution_unpaid_balance(self, mock_dispatch, partially_paid_verified_request):
        req = partially_paid_verified_request
        req.status = LifecycleState.AWAITING_PAYMENT
        req.save()
        
        send_final_balance_reminder(req.id)
        
        assert mock_dispatch.called
        args, kwargs = mock_dispatch.call_args
        assert kwargs["title"] == "Final Balance Due"

    @patch('apps.notification.services.DispatchOrchestrator.dispatch_event')
    def test_reminder_execution_after_payment(self, mock_dispatch, partially_paid_verified_request):
        req = partially_paid_verified_request
        req.status = LifecycleState.COMPLETED
        req.save()
        quote = req.quotes.first()
        quote.status = QuoteStatus.PAID
        quote.save()
        
        send_final_balance_reminder(req.id)
        
        # Already paid, should not dispatch
        assert not mock_dispatch.called
