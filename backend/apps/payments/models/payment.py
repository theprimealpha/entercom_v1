import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _

class PaymentStatus(models.TextChoices):
    PENDING = "pending", _("Pending")
    PAID = "paid", _("Paid")
    FAILED = "failed", _("Failed")
    CANCELLED = "cancelled", _("Cancelled")
    REFUNDED = "refunded", _("Refunded")
    ESCALATED = "escalated", _("Escalated")

class Payment(models.Model):
    """
    The internal representation of a financial transaction, acting as the 
    authoritative record of settlement status.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.PROTECT,
        related_name="payment",
        null=True,
        blank=True
    )
    quote = models.ForeignKey(
        'requests.Quote',
        on_delete=models.PROTECT,
        related_name="payments",
        null=True,
        blank=True
    )
    request = models.ForeignKey(
        'requests.Request',
        on_delete=models.PROTECT,
        related_name="payments"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payments"
    )
    provider_reference = models.CharField(max_length=255, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="NGN")
    status = models.CharField(
        max_length=50, 
        choices=PaymentStatus.choices, 
        default=PaymentStatus.PENDING
    )
    correlation_id = models.UUIDField(editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Payment")
        verbose_name_plural = _("Payments")
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"Payment {self.id} for Order {self.order_id} ({self.status})"
