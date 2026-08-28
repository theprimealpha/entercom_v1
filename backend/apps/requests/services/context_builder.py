from typing import Protocol, List
from apps.requests.models import Request, Assignment, Quote
from apps.requests.domain.context import RequestContext

class ContextProvider(Protocol):
    def build(self, request: Request, context: RequestContext) -> None:
        """Injects facts from a specific bounded context into the RequestContext."""
        pass

class CoreContextProvider:
    def build(self, request: Request, context: RequestContext) -> None:
        context.requires_technician = request.requires_technician
        context.category = request.category
        context.has_valid_schema = True  # Assuming validated at creation
        context.staff_assigned = True # Used as a dummy guard for PICK_UP

class PolicyContextProvider:
    # Canonical policy matrices — authoritative source: prompt.txt decisions (2026-07-14)
    # Workflow Catalog is the new source of truth over stale architecture docs.
    PAYMENT_REQUIRED_CATEGORIES = {
        'installation',
        'maintenance',
        'product_order',
        'consultation',
    }
    VERIFICATION_REQUIRED_CATEGORIES = {
        'installation',
        'maintenance',
        'consultation',
        'device_outage',
        'warranty',
    }
    QUOTE_REQUIRED_CATEGORIES = {
        'installation',
        'maintenance',
    }

    def build(self, request: Request, context: RequestContext) -> None:
        category = request.category
        context.category_requires_quote = category in self.QUOTE_REQUIRED_CATEGORIES
        context.category_requires_payment = category in self.PAYMENT_REQUIRED_CATEGORIES
        context.category_requires_verification = category in self.VERIFICATION_REQUIRED_CATEGORIES

class OrderContextProvider:
    def build(self, request: Request, context: RequestContext) -> None:
        if hasattr(request, 'order') and request.order:
            context.has_order = True
            order_status = request.order.status.lower()
            if order_status in ['paid', 'fulfilled']:
                context.payment_confirmed = True
            if order_status == 'fulfilled':
                context.order_fulfilled = True
            if order_status == 'cancelled':
                context.order_cancelled = True

class QuoteContextProvider:
    def build(self, request: Request, context: RequestContext) -> None:
        quotes = Quote.objects.filter(request=request).order_by('-created_at')
        quote = quotes.first()
        context.revision_count = quotes.count()
        if quote:
            status = quote.status.lower()
            context.has_valid_quote_version = True
            context.quote_approved = status in ['approved', 'partially_paid', 'paid']
            context.quote_rejected = status == 'rejected'
            if status in ['partially_paid', 'paid']:
                context.payment_confirmed = True
        # upfront_payment_required is driven by policy, not quote presence.
        # A fixed-price category (e.g. consultation) requires payment even without a quote.
        context.upfront_payment_required = context.category_requires_payment

class AssignmentContextProvider:
    def build(self, request: Request, context: RequestContext) -> None:
        context.tech_available = Assignment.objects.filter(request=request).exclude(response_status__in=['declined', 'timeout']).exists()
        # You would calculate timeouts or decline limits based on historical Assignments
        context.within_timeout = True
        context.decline_count = request.decline_count

class VerificationContextProvider:
    def build(self, request: Request, context: RequestContext) -> None:
        try:
            from apps.requests.models.verification import Verification
            verification = Verification.objects.filter(request=request).order_by('-created_at').first()
            if verification:
                context.evidence_uploaded = verification.evidence.exists()
                context.qa_pass = verification.status == 'approved'
                if context.qa_pass:
                    context.work_verified = True
                context.qa_fail = verification.status == 'rejected'
        except ImportError:
            pass

class AuditContextProvider:
    def build(self, request: Request, context: RequestContext) -> None:
        context.audit_justification_provided = True
        context.trigger_condition_met = request.sla_status == 'breached'
        context.manager_pre_approval_needed = request.priority == 'emergency'

class RequestContextBuilder:
    def __init__(self, request: Request):
        self.request = request
        self.providers: List[ContextProvider] = [
            CoreContextProvider(),
            PolicyContextProvider(),
            OrderContextProvider(),
            QuoteContextProvider(),
            AssignmentContextProvider(),
            VerificationContextProvider(),
            AuditContextProvider(),
        ]

    def build(self) -> RequestContext:
        context = RequestContext()
        for provider in self.providers:
            provider.build(self.request, context)
        return context
