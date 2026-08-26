from django.urls import path
from .views import (
    PaymentListView, PaymentInitializeView, PaymentDetailView, PaymentCancelView, PaystackWebhookView,
    PaymentRefundView, PaymentEscalateView, PaymentQuoteInitializeView
)

urlpatterns = [
    path('payments/', PaymentListView.as_view()),
    path('payments/initialize/', PaymentInitializeView.as_view()),
    path('payments/quote/initialize/', PaymentQuoteInitializeView.as_view()),
    path('payments/<uuid:pk>/', PaymentDetailView.as_view()),
    path('payments/<uuid:pk>/cancel/', PaymentCancelView.as_view()),
    path('payments/<uuid:pk>/refund/', PaymentRefundView.as_view()),
    path('payments/<uuid:pk>/escalate/', PaymentEscalateView.as_view()),
    path('payments/webhooks/paystack/', PaystackWebhookView.as_view()),
]
