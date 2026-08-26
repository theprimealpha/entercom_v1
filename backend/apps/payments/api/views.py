from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
import uuid

from apps.payments.services.payment_service import PaymentService
from apps.payments.services.webhook_service import WebhookService
from apps.payments.models import Payment
from apps.payments.permissions import PaymentPermissionChecker, WebhookPermissions
from apps.orders.models import Order
from apps.common.permissions import Actor, Role
from .serializers import (
    PaymentSerializer, PaymentInitializeSerializer, PaymentCancelSerializer,
    PaymentRefundSerializer, PaymentEscalateSerializer
)

from rest_framework.permissions import IsAuthenticated

def get_actor(request):
    role_val = getattr(request.user, 'role', 'customer')
    if hasattr(role_val, 'value'):
        role_val = role_val.value
    
    try:
        role = Role(str(role_val).lower())
    except ValueError:
        role = Role.CUSTOMER
        
    return Actor(id=request.user.id, role=role)

class PaymentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        actor = get_actor(request)
        if actor.role == Role.CUSTOMER:
            PaymentPermissionChecker.check(actor, 'payment.view_own')
            payments = Payment.objects.filter(customer_id=actor.id)
        else:
            PaymentPermissionChecker.check(actor, 'payment.view')
            payments = Payment.objects.all()
            
        return Response(PaymentSerializer(payments, many=True).data)

class PaymentInitializeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = get_actor(request)
        PaymentPermissionChecker.check(actor, 'payment.initialize')
        serializer = PaymentInitializeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        order_id = serializer.validated_data['order_id']
        callback_url = serializer.validated_data.get('callback_url')
        order = get_object_or_404(Order, pk=order_id)
        
        if actor.role == Role.CUSTOMER and str(order.customer_id) != str(actor.id):
            from django.core.exceptions import PermissionDenied
            raise PermissionDenied("Cannot initialize another customer's payment.")

        payment = PaymentService.initialize_payment(
            actor=actor,
            correlation_id=str(uuid.uuid4()),
            order_id=order.id,
            request_id=order.request_id,
            customer_id=order.customer_id,
            amount=order.total_amount,
            currency='NGN',
            provider_reference=str(uuid.uuid4()),
            callback_url=callback_url
        )
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

class PaymentQuoteInitializeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = get_actor(request)
        PaymentPermissionChecker.check(actor, 'payment.initialize')
        
        quote_id = request.data.get('quote_id')
        payment_plan = request.data.get('payment_plan')
        callback_url = request.data.get('callback_url')
        
        if not quote_id or not payment_plan:
            return Response({"detail": "quote_id and payment_plan are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.requests.models import Quote
        quote = get_object_or_404(Quote, pk=quote_id)
        
        if actor.role == Role.CUSTOMER and str(quote.request.customer_id) != str(actor.id):
            from django.core.exceptions import PermissionDenied
            raise PermissionDenied("Cannot initialize another customer's payment.")

        payment = PaymentService.initialize_quote_payment(
            actor=actor,
            correlation_id=str(uuid.uuid4()),
            quote_id=quote.id,
            payment_plan=payment_plan,
            provider_reference=str(uuid.uuid4()),
            callback_url=callback_url
        )
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

class PaymentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        actor = get_actor(request)
        payment = get_object_or_404(Payment, pk=pk)
        if actor.role == Role.CUSTOMER:
            PaymentPermissionChecker.check(actor, 'payment.view_own', payment=payment)
        else:
            PaymentPermissionChecker.check(actor, 'payment.view')
            
        return Response(PaymentSerializer(payment).data)

class PaymentCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor = get_actor(request)
        payment = get_object_or_404(Payment, pk=pk)
        PaymentPermissionChecker.check(actor, 'payment.cancel', payment=payment)
        
        serializer = PaymentCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        payment = PaymentService.cancel_payment(
            actor=actor,
            correlation_id=str(uuid.uuid4()),
            payment_id=pk
        )
        return Response(PaymentSerializer(payment).data)

class PaymentRefundView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor = get_actor(request)
        payment = get_object_or_404(Payment, pk=pk)
        PaymentPermissionChecker.check(actor, 'payment.refund', payment=payment)
        
        serializer = PaymentRefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        payment = PaymentService.refund_payment(
            actor=actor,
            correlation_id=str(uuid.uuid4()),
            payment_id=pk
        )
        return Response(PaymentSerializer(payment).data)

class PaymentEscalateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor = get_actor(request)
        payment = get_object_or_404(Payment, pk=pk)
        PaymentPermissionChecker.check(actor, 'payment.escalate', payment=payment)
        
        serializer = PaymentEscalateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        payment = PaymentService.escalate_payment(
            actor=actor,
            correlation_id=str(uuid.uuid4()),
            payment_id=pk,
            reason=serializer.validated_data['reason']
        )
        return Response(PaymentSerializer(payment).data)

class PaystackWebhookView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        import json
        actor = Actor(id='SYSTEM', role=Role.SYSTEM)
        PaymentPermissionChecker.check(actor, WebhookPermissions.PROCESS)
        
        signature = request.headers.get('x-paystack-signature', '')
        
        raw_body = request.body
        try:
            payload = json.loads(raw_body.decode('utf-8'))
        except Exception:
            payload = {}
        
        from django.core.exceptions import ValidationError
        try:
            WebhookService.process_webhook(
                actor=actor,
                correlation_id=str(uuid.uuid4()),
                payload=payload,
                signature=signature,
                secret_key= getattr(settings, 'PAYSTACK_SECRET_KEY', ''),
                raw_body=raw_body
            )
        except ValidationError as e:
            print("Webhook ValidationError:", e)
            return Response(status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_200_OK)
