import logging
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import LimitOffsetPagination
from django.core.exceptions import PermissionDenied
from drf_spectacular.utils import extend_schema, OpenApiResponse

from .serializers import (
    CreateRequestSerializer, UpdateRequestSerializer, AssignTechnicianSerializer, 
    DeclineAssignmentSerializer, CancelRequestSerializer, CreateQuoteSerializer, 
    CustomerQuoteActionSerializer, SubmitVerificationSerializer, 
    VerificationReviewSerializer, EscalationSerializer, EscalationResolveSerializer,
    RequestListSerializer, QuoteListSerializer
)
from .permissions import GenericRBACPermission
from apps.requests.permissions.constants import Permission

from apps.requests.services.request_service import RequestService
from apps.requests.services.assignment_service import AssignmentService
from apps.requests.services.quote_service import QuoteService
from apps.requests.services.verification_service import VerificationService
from apps.requests.services.escalation_service import EscalationService
from apps.requests.models import StateHistory
from apps.requests.domain.exceptions import DomainException

logger = logging.getLogger(__name__)

def success_response(message="Success", data=None, status_code=status.HTTP_200_OK):
    return Response({"success": True, "message": message, "data": data or {}}, status=status_code)

def error_response(message="Unexpected error", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    payload = {"success": False, "message": message}
    if errors:
        payload["errors"] = errors
    return Response(payload, status=status_code)

class StandardResultsSetPagination(LimitOffsetPagination):
    default_limit = 20
    max_limit = 100

class RequestViewSet(viewsets.ViewSet):
    permission_classes = [GenericRBACPermission]
    pagination_class = StandardResultsSetPagination
    
    rbac_action_map = {
        'list': None,
        'retrieve': None,
        'timeline': None,
        'create': Permission.REQUEST_CREATE,
        'partial_update': Permission.REQUEST_UPDATE,
        'submit': Permission.REQUEST_SUBMIT,
        'pickup': Permission.REQUEST_TRIAGE,
        'triage_action': Permission.REQUEST_TRIAGE,
        'assign': Permission.REQUEST_ASSIGN,
        'accept': Permission.ASSIGNMENT_ACCEPT,
        'decline': Permission.ASSIGNMENT_DECLINE,
        'cancel': Permission.REQUEST_CANCEL,
        'escalate': Permission.REQUEST_ESCALATE,
        'resolve_escalation': Permission.ESCALATION_RESOLVE,
    }

    @property
    def paginator(self):
        if not hasattr(self, '_paginator'):
            if self.pagination_class is None:
                self._paginator = None
            else:
                self._paginator = self.pagination_class()
        return self._paginator

    def paginate_queryset(self, queryset):
        if self.paginator is None:
            return None
        return self.paginator.paginate_queryset(queryset, self.request, view=self)

    def get_paginated_response(self, data, message="Success"):
        assert self.paginator is not None
        return Response({
            "success": True,
            "message": message,
            "data": data,
            "pagination": {
                "count": self.paginator.count,
                "next": self.paginator.get_next_link(),
                "previous": self.paginator.get_previous_link()
            }
        })

    def get_object(self):
        pk = self.kwargs.get('pk') or self.kwargs.get('request_pk')
        return RequestService.get_request_by_id(request_id=pk)

    @extend_schema(summary="List Requests", responses={200: RequestListSerializer(many=True)})
    def list(self, request):
        queryset = RequestService.list_requests(user=request.user)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = RequestListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data, "Requests retrieved successfully")

        serializer = RequestListSerializer(queryset, many=True, context={'request': request})
        return success_response("Requests retrieved successfully", serializer.data)

    @extend_schema(summary="Retrieve Request", responses={200: RequestListSerializer})
    def retrieve(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = RequestListSerializer(obj, context={'request': request})
        return success_response("Request retrieved successfully", serializer.data)

    @extend_schema(summary="Create Request", request=CreateRequestSerializer, responses={201: OpenApiResponse(description="Created"), 400: OpenApiResponse(description="Validation Error")})
    def create(self, request):
        serializer = CreateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = RequestService.create_request(user=request.user, data=serializer.validated_data)
            RequestService.submit(request_id=result.id, actor=request.user)
            # Re-fetch or manually update the status for the response
            result.refresh_from_db()
            return success_response("Request created and submitted successfully", {"id": str(result.id), "public_id": getattr(result, 'public_id', '')}, status.HTTP_201_CREATED)
        except PermissionDenied:
            return error_response("Permission denied", status_code=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Update Request", request=UpdateRequestSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    def partial_update(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = UpdateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = RequestService.update_request(request_id=pk, user=request.user, data=serializer.validated_data)
            return success_response("Request updated successfully", {"id": str(result.id)})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Request Timeline", responses={200: OpenApiResponse(description="Success")})
    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        data = RequestService.get_timeline(request_id=pk, user=request.user)
        return success_response("Timeline retrieved successfully", data)

    @extend_schema(summary="Submit Request", request=None, responses={200: OpenApiResponse(description="Success")})
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        try:
            result = RequestService.submit(request_id=pk, actor=request.user)
            return success_response("Request submitted successfully", {"id": str(result.id), "status": result.status})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Pick Up Request", request=None, responses={200: OpenApiResponse(description="Success"), 409: OpenApiResponse(description="Conflict")})
    @action(detail=True, methods=['post'], url_path='pick-up')
    def pickup(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        try:
            result = RequestService.pickup(request_id=pk, actor=request.user)
            return success_response("Request picked up successfully", {"id": str(result.id), "status": result.status})
        except Exception as e:
            error_msg = str(e).lower()
            if "already" in error_msg or "claimed" in error_msg or "not allowed" in error_msg or "not in submitted" in error_msg:
                return error_response("Request has already been claimed.", status_code=status.HTTP_409_CONFLICT)
            
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Assign Technician", request=AssignTechnicianSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = AssignTechnicianSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = AssignmentService.assign(request_id=pk, actor=request.user, technician_id=serializer.validated_data['technician_id'])
            return success_response("Technician assigned successfully", {"id": str(result.id), "status": result.status})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Accept Assignment", request=None, responses={200: OpenApiResponse(description="Success")})
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        try:
            result = AssignmentService.accept(request_id=pk, actor=request.user)
            return success_response("Assignment accepted successfully", {"id": str(result.id), "status": result.status})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Decline Assignment", request=DeclineAssignmentSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = DeclineAssignmentSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = AssignmentService.decline(request_id=pk, actor=request.user, reason_code=serializer.validated_data['reason_code'])
            return success_response("Assignment declined successfully", {"id": str(result.id), "status": result.status})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Cancel Request", request=CancelRequestSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = CancelRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = RequestService.cancel(request_id=pk, actor=request.user, reason_code=serializer.validated_data['reason_code'])
            return success_response("Request cancelled successfully", {"id": str(result.id), "status": result.status})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Escalate Request", request=EscalationSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = EscalationSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = EscalationService.process_escalation(request_id=pk, trigger_type=serializer.validated_data['reason'], actor=request.user)
            return success_response("Request escalated successfully", {"id": str(result.id), "status": getattr(result, 'status', 'escalated')})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Resolve Escalation", request=EscalationResolveSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error"), 403: OpenApiResponse(description="Forbidden")})
    @action(detail=True, methods=['post'], url_path='resolve-escalation')
    def resolve_escalation(self, request, pk=None):
        """Manager resolves an escalation and routes the request to the chosen target state."""
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = EscalationResolveSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = EscalationService.resolve(
                request_id=pk,
                actor=request.user,
                target_state=serializer.validated_data['target_state'],
                resolution_type=serializer.validated_data.get('resolution_type', 'MANUAL'),
            )
            return success_response(
                "Escalation resolved successfully",
                {"id": str(result.id), "status": result.status}
            )
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Resolve escalation error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


    @extend_schema(summary="Triage Action", request=UpdateRequestSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    @action(detail=True, methods=['post'], url_path='triage')
    def triage_action(self, request, pk=None):
        """Staff triage decisions: needs_quote, require_payment, assign_directly, close_direct."""
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = UpdateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        action_value = serializer.validated_data.get('action')
        if not action_value:
            return error_response("'action' field is required", status_code=status.HTTP_400_BAD_REQUEST)
        TRIAGE_ACTIONS = {'needs_quote', 'require_payment', 'assign_directly', 'close_direct'}
        if action_value not in TRIAGE_ACTIONS:
            return error_response(
                f"Invalid triage action '{action_value}'. Must be one of: {', '.join(TRIAGE_ACTIONS)}",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        try:
            from apps.requests.domain.actions import RequestAction
            result = RequestService.triage(
                request_id=pk,
                actor=request.user,
                action=RequestAction(action_value)
            )
            return success_response("Triage decision applied", {"id": str(result.id), "status": result.status})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Triage error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RequestQuoteViewSet(viewsets.ViewSet):
    permission_classes = [GenericRBACPermission]
    pagination_class = StandardResultsSetPagination
    
    rbac_action_map = {
        'list': None, 
        'create': Permission.QUOTE_CREATE,
        'approve': Permission.QUOTE_APPROVE,
        'reject': Permission.QUOTE_REJECT,
        'revise': Permission.QUOTE_REVISE,
        'customer_action': {
            'approve': Permission.QUOTE_APPROVE,
            'reject': Permission.QUOTE_REJECT,
            'revise': Permission.QUOTE_REVISE,
        }
    }

    @property
    def paginator(self):
        if not hasattr(self, '_paginator'):
            if self.pagination_class is None:
                self._paginator = None
            else:
                self._paginator = self.pagination_class()
        return self._paginator

    def paginate_queryset(self, queryset):
        if self.paginator is None:
            return None
        return self.paginator.paginate_queryset(queryset, self.request, view=self)

    def get_paginated_response(self, data, message="Success"):
        assert self.paginator is not None
        return Response({
            "success": True,
            "message": message,
            "data": data,
            "pagination": {
                "count": self.paginator.count,
                "next": self.paginator.get_next_link(),
                "previous": self.paginator.get_previous_link()
            }
        })

    def get_object(self):
        pk = self.kwargs.get('request_pk')
        return RequestService.get_request_by_id(request_id=pk)

    @extend_schema(summary="List Quotes", responses={200: QuoteListSerializer(many=True)})
    def list(self, request, request_pk=None):
        queryset = QuoteService.list_quotes(request_id=request_pk, user=request.user)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = QuoteListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data, "Quotes retrieved successfully")

        serializer = QuoteListSerializer(queryset, many=True)
        return success_response("Quotes retrieved successfully", serializer.data)

    @extend_schema(summary="Create Quote", request=CreateQuoteSerializer, responses={201: OpenApiResponse(description="Created"), 400: OpenApiResponse(description="Validation Error")})
    def create(self, request, request_pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = CreateQuoteSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = QuoteService.create_quote(request_id=request_pk, actor=request.user, data=serializer.validated_data)
            return success_response("Quote created successfully", {"id": str(result.id), "version": result.version}, status.HTTP_201_CREATED)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Approve Quote", request=None, responses={200: OpenApiResponse(description="Success")})
    def approve(self, request, request_pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        try:
            result = QuoteService.approve_quote(request_id=request_pk, actor=request.user)
            return success_response("Quote approved successfully", {"status": getattr(result, 'status', 'approved')})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Reject Quote", request=None, responses={200: OpenApiResponse(description="Success")})
    def reject(self, request, request_pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        try:
            result = QuoteService.handle_customer_action(request_id=request_pk, actor=request.user, action_type="reject")
            return success_response("Quote rejected successfully", {"status": getattr(result, 'status', 'rejected')})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Revise Quote", request=None, responses={200: OpenApiResponse(description="Success")})
    def revise(self, request, request_pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        try:
            result = QuoteService.handle_customer_action(request_id=request_pk, actor=request.user, action_type="revise")
            return success_response("Quote revision requested successfully", {"status": getattr(result, 'status', 'revision_requested')})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Customer Action on Quote", request=CustomerQuoteActionSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    def customer_action(self, request, request_pk=None):
        obj = self.get_object()
        serializer = CustomerQuoteActionSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        self.check_object_permissions(request, obj)
        try:
            result = QuoteService.handle_customer_action(
                request_id=request_pk, actor=request.user,
                action_type=serializer.validated_data['action'], reason=serializer.validated_data.get('reason')
            )
            return success_response("Customer action processed successfully", {"status": getattr(result, 'status', 'processed')})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RequestVerificationViewSet(viewsets.ViewSet):
    permission_classes = [GenericRBACPermission]
    
    rbac_action_map = {
        'submit_verification': Permission.VERIFICATION_SUBMIT,
        'review_verification': Permission.VERIFICATION_VERIFY,
    }

    def get_object(self):
        pk = self.kwargs.get('request_pk')
        return RequestService.get_request_by_id(request_id=pk)

    @extend_schema(summary="Submit Verification", request=SubmitVerificationSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    def submit_verification(self, request, request_pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = SubmitVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = VerificationService.submit(request_id=request_pk, actor=request.user, evidence=serializer.validated_data)
            return success_response("Verification submitted successfully", {"id": str(result.id), "status": "pending_verification"})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            if type(e).__name__ == "ValidationError":
                return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(summary="Review Verification", request=VerificationReviewSerializer, responses={200: OpenApiResponse(description="Success"), 400: OpenApiResponse(description="Validation Error")})
    def review_verification(self, request, request_pk=None):
        obj = self.get_object()
        self.check_object_permissions(request, obj)
        serializer = VerificationReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
        try:
            result = VerificationService.verify(
                request_id=request_pk, actor=request.user,
                action_type=serializer.validated_data['action'], notes=serializer.validated_data.get('notes')
            )
            return success_response("Verification reviewed successfully", {"id": str(getattr(result, 'id', '')), "status": getattr(result, 'status', 'reviewed')})
        except DomainException as e:
            return error_response(str(e), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Service error: {e}")
            return error_response("Unexpected error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
from apps.requests.models.inspection import InspectionReport, InspectionPhoto
from apps.requests.api.serializers import InspectionReportSerializer, InspectionPhotoSerializer
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser

class RequestInspectionViewSet(viewsets.ViewSet):
    permission_classes = [GenericRBACPermission]
    
    rbac_action_map = {
        'retrieve': None,
        'update': Permission.REQUEST_UPDATE,
        'upload_photo': Permission.REQUEST_UPDATE,
    }

    def get_object(self):
        pk = self.kwargs.get('request_pk')
        request_obj = RequestService.get_request_by_id(request_id=pk)
        self.check_object_permissions(self.request, request_obj)
        try:
            return request_obj.inspection_report
        except Exception:
            return None

    @extend_schema(summary="Get Inspection Report", responses={200: InspectionReportSerializer})
    def retrieve(self, request, request_pk=None):
        obj = self.get_object()
        if not obj:
            return error_response("Inspection report not found", status_code=status.HTTP_404_NOT_FOUND)
        serializer = InspectionReportSerializer(obj)
        return success_response("Inspection report retrieved successfully", serializer.data)

    @extend_schema(summary="Update Inspection Report", request=InspectionReportSerializer, responses={200: InspectionReportSerializer})
    def update(self, request, request_pk=None):
        request_obj = RequestService.get_request_by_id(request_id=request_pk)
        self.check_object_permissions(request, request_obj)
        
        report = getattr(request_obj, 'inspection_report', None)
        if report:
            serializer = InspectionReportSerializer(report, data=request.data, partial=True)
        else:
            serializer = InspectionReportSerializer(data=request.data)
            
        if not serializer.is_valid():
            return error_response("Validation failed", serializer.errors)
            
        if report:
            serializer.save()
        else:
            serializer.save(request=request_obj, created_by=request.user)
            
        return success_response("Inspection report updated successfully", serializer.data)

    @extend_schema(summary="Upload Inspection Photo", responses={201: InspectionPhotoSerializer})
    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_photo(self, request, request_pk=None):
        request_obj = RequestService.get_request_by_id(request_id=request_pk)
        self.check_object_permissions(request, request_obj)
        
        report = getattr(request_obj, 'inspection_report', None)
        if not report:
            report = InspectionReport.objects.create(request=request_obj, created_by=request.user)
            
        file_obj = request.FILES.get('file')
        if not file_obj:
            return error_response("No file provided", status_code=status.HTTP_400_BAD_REQUEST)
            
        description = request.data.get('description', '')
        
        photo = InspectionPhoto.objects.create(
            report=report,
            file=file_obj,
            description=description
        )
        serializer = InspectionPhotoSerializer(photo)
        return success_response("Photo uploaded successfully", serializer.data, status_code=status.HTTP_201_CREATED)
