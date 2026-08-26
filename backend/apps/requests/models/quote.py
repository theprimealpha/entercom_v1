import uuid
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

class QuoteStatus(models.TextChoices):
    DRAFT = "draft", _("Draft")
    ISSUED = "issued", _("Issued")
    APPROVED = "approved", _("Approved")
    REJECTED = "rejected", _("Rejected")
    EXPIRED = "expired", _("Expired")
    SUPERSEDED = "superseded", _("Superseded")
    PARTIALLY_PAID = "partially_paid", _("Partially Paid")
    PAID = "paid", _("Paid")

class PaymentPlan(models.TextChoices):
    FULL = "full", _("Full Payment")
    FIFTY_FIFTY = "fifty_fifty", _("50/50 Deposit")


class Quote(models.Model):
    """
    Financial estimates tied to a Request. Tracks versions, expiry, and approval status.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    request = models.ForeignKey(
        'requests.Request',
        on_delete=models.PROTECT,
        related_name="quotes"
    )
    
    version = models.IntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_plan = models.CharField(max_length=50, choices=PaymentPlan.choices, null=True, blank=True)
    status = models.CharField(max_length=50, choices=QuoteStatus.choices)
    
    expires_at = models.DateTimeField()
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_quotes"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Quote")
        verbose_name_plural = _("Quotes")
        constraints = [
            models.UniqueConstraint(fields=["request", "version"], name="unique_quote_version")
        ]
        indexes = [
            models.Index(fields=["status", "expires_at"]),
        ]

    def __str__(self):
        return f"Quote v{self.version} for Request {self.request_id}"
