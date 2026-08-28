from dataclasses import dataclass, field
from typing import Dict, Any

@dataclass
class RequestContext:
    """Strongly typed business facts required for state transition evaluation."""
    # Core Facts
    requires_technician: bool = False
    category: str = ""  # Raw category string from the request

    
    # Validation Facts
    has_valid_schema: bool = False
    
    # Assignment Facts
    staff_assigned: bool = False
    tech_available: bool = False
    within_timeout: bool = True
    decline_count: int = 0
    
    # Category Policy Facts
    category_requires_quote: bool = False
    category_requires_payment: bool = False
    category_requires_verification: bool = False
    
    # Quote Facts
    has_valid_quote_version: bool = False
    upfront_payment_required: bool = True
    revision_count: int = 0
    quote_approved: bool = False
    quote_rejected: bool = False
    
    # Payment / Order Facts
    payment_confirmed: bool = False
    is_fully_paid: bool = False
    is_partially_paid: bool = False
    has_order: bool = False
    order_fulfilled: bool = False
    order_cancelled: bool = False
    
    # Verification Facts
    evidence_uploaded: bool = False
    qa_pass: bool = False
    qa_fail: bool = False
    work_verified: bool = False
    audit_justification_provided: bool = False
    
    # Generic Triggers
    trigger_condition_met: bool = False
    manager_pre_approval_needed: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert back to dictionary for legacy compatibility if needed."""
        return self.__dict__.copy()
