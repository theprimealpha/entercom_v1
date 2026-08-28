from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RequestViewSet, RequestQuoteViewSet, RequestVerificationViewSet

router = DefaultRouter()
router.register(r"", RequestViewSet, basename='request')

quote_list_create = RequestQuoteViewSet.as_view({
    'get': 'list',
    'post': 'create'
})
quote_approve = RequestQuoteViewSet.as_view({
    'post': 'approve'
})
quote_reject = RequestQuoteViewSet.as_view({
    'post': 'reject'
})
quote_revise = RequestQuoteViewSet.as_view({
    'post': 'revise'
})
quote_customer_action = RequestQuoteViewSet.as_view({
    'post': 'customer_action'
})

verification_submit = RequestVerificationViewSet.as_view({
    'post': 'submit_verification'
})
verification_review = RequestVerificationViewSet.as_view({
    'post': 'review_verification'
})

urlpatterns = [
    # Quotes Sub-resource
    path('<str:request_pk>/quotes/', quote_list_create, name='request-quotes'),
    path('<str:request_pk>/quote/approve/', quote_approve, name='request-quote-approve'),
    path('<str:request_pk>/quote/reject/', quote_reject, name='request-quote-reject'),
    path('<str:request_pk>/quote/revise/', quote_revise, name='request-quote-revise'),
    path('<str:request_pk>/quote/customer-action/', quote_customer_action, name='request-quote-customer-action'),
    
    # Verification Sub-resource
    path('<str:request_pk>/verify/', verification_submit, name='request-verify-submit'),
    path('<str:request_pk>/review/', verification_review, name='request-verify-review'),

    path('', include(router.urls)),
]

from .views import RequestInspectionViewSet

inspection_retrieve_update = RequestInspectionViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'update'
})
inspection_upload_photo = RequestInspectionViewSet.as_view({
    'post': 'upload_photo'
})

urlpatterns.extend([
    path('<str:request_pk>/inspection/', inspection_retrieve_update, name='request-inspection'),
    path('<str:request_pk>/inspection/photo/', inspection_upload_photo, name='request-inspection-photo'),
])
from .views import RequestInspectionViewSet

inspection_retrieve_update = RequestInspectionViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'update'
})
inspection_upload_photo = RequestInspectionViewSet.as_view({
    'post': 'upload_photo'
})

urlpatterns.extend([
    path('<str:request_pk>/inspection/', inspection_retrieve_update, name='request-inspection'),
    path('<str:request_pk>/inspection/photo/', inspection_upload_photo, name='request-inspection-photo'),
])
