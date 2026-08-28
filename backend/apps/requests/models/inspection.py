import uuid
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

class InspectionReport(models.Model):
    """
    Documents site conditions, requirements, and recommendations to hand off to the installing technician.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.OneToOneField(
        'requests.Request',
        on_delete=models.CASCADE,
        related_name="inspection_report"
    )
    
    site_observations = models.TextField(null=True, blank=True)
    required_materials = models.TextField(null=True, blank=True)
    required_tools = models.TextField(null=True, blank=True)
    installation_notes = models.TextField(null=True, blank=True)
    recommendations = models.TextField(null=True, blank=True)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_inspections"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Inspection Report")
        verbose_name_plural = _("Inspection Reports")

    def __str__(self):
        return f"Inspection for Request {self.request_id}"

class InspectionPhoto(models.Model):
    """
    Photos specifically related to an inspection report.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(
        InspectionReport,
        on_delete=models.CASCADE,
        related_name="photos"
    )
    
    file_url = models.URLField(max_length=1024, null=True, blank=True)
    file = models.FileField(upload_to='inspection_photos/', null=True, blank=True)
    description = models.CharField(max_length=255, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Inspection Photo")
        verbose_name_plural = _("Inspection Photos")

    def __str__(self):
        return f"Photo for Inspection {self.report_id}"
