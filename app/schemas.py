from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


Currency = Literal["PLN"]
WorkflowState = Literal[
    "created",
    "needs_clarification",
    "blocked_by_policy",
    "researching",
    "no_exact_match",
    "awaiting_alternative_acceptance",
    "comparing",
    "proposal_ready",
    "awaiting_approval",
    "rejected",
    "checkout_in_progress",
    "checkout_failed",
    "ordered",
    "tracking",
    "completed",
    "cancelled",
]
WorkflowAction = Literal[
    "reply_to_clarification",
    "accept_alternative",
    "reject_alternative",
    "approve_proposal",
    "reject_proposal",
    "execute_checkout",
    "simulate_tracking",
    "cancel",
]
OrderStatus = Literal[
    "order_created",
    "confirmed",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "exception",
    "cancelled",
    "return_requested",
    "returned",
]


class APIModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class Money(APIModel):
    amount: float
    currency: Currency = "PLN"


class ShoppingConstraints(APIModel):
    product_category: str | None = Field(alias="productCategory")
    query: str
    budget_max: Money | None = Field(default=None, alias="budgetMax")
    delivery_deadline: Literal["today", "tomorrow", "this_week"] | None = Field(
        default=None, alias="deliveryDeadline"
    )
    compatibility: list[str] = Field(default_factory=list)
    must_have: list[str] = Field(default_factory=list, alias="mustHave")
    nice_to_have: list[str] = Field(default_factory=list, alias="niceToHave")
    required_return_days: int | None = Field(default=None, alias="requiredReturnDays")
    forbidden: list[str] = Field(default_factory=list)


class SpendingPolicy(APIModel):
    explicit_approval_required: bool = Field(alias="explicitApprovalRequired")
    autonomous_limit: Money = Field(alias="autonomousLimit")


class PaymentMethod(APIModel):
    token: Literal["pm_demo_card"]
    label: str


class DemoUserProfile(APIModel):
    user_id: Literal["demo_user"] = Field(alias="userId")
    locale: Literal["en-PL"]
    address_label: str = Field(alias="addressLabel")
    device_facts: list[str] = Field(alias="deviceFacts")
    spending_policy: SpendingPolicy = Field(alias="spendingPolicy")
    payment_method: PaymentMethod = Field(alias="paymentMethod")


class ClarificationQuestion(APIModel):
    id: str
    text: str
    expected_field: str = Field(alias="expectedField")
    examples: list[str]


class PolicyBlock(APIModel):
    code: Literal[
        "restricted_product",
        "requires_professional_verification",
        "unsafe_or_illegal",
        "unsupported_request",
    ]
    message: str
    can_suggest_safer_alternative: bool = Field(alias="canSuggestSaferAlternative")


class Delivery(APIModel):
    earliest: str
    latest: str
    label: str
    meets_deadline: bool = Field(default=True, alias="meetsDeadline")


class Compatibility(APIModel):
    macbook: Literal["yes", "no", "unknown"]
    notes: list[str]


class Returns(APIModel):
    returnable: bool
    days: int
    label: str


class Warranty(APIModel):
    months: int
    label: str


class Rating(APIModel):
    value: float
    count: int


class Offer(APIModel):
    id: str
    merchant_id: str = Field(alias="merchantId")
    merchant_name: str = Field(alias="merchantName")
    title: str
    category: str
    brand: str
    model: str | None = None
    price: Money
    taxes_and_fees: Money = Field(alias="taxesAndFees")
    total: Money
    stock_status: Literal["in_stock", "low_stock", "out_of_stock"] = Field(alias="stockStatus")
    delivery: Delivery
    compatibility: Compatibility
    returns: Returns
    warranty: Warranty
    rating: Rating
    risk_flags: list[str] = Field(default_factory=list, alias="riskFlags")
    demo_behavior: Literal[
        "normal", "price_changes_at_checkout", "out_of_stock_at_checkout", "payment_failed"
    ] | None = Field(default=None, alias="demoBehavior")


class Alternative(APIModel):
    id: str
    reason: Literal["higher_budget", "later_delivery", "different_category", "weaker_return_terms"]
    message: str
    adjusted_constraints: ShoppingConstraints = Field(alias="adjustedConstraints")


class RankedOffer(APIModel):
    offer_id: str = Field(alias="offerId")
    rank: int
    score: float
    title: str
    total: Money
    reasons: list[str]
    tradeoffs: list[str]
    disqualifiers: list[str]


class ComparisonResult(APIModel):
    id: str
    best_offer_id: str | None = Field(alias="bestOfferId")
    confidence: float
    recommendation: Literal["proceed", "ask_user", "stop"]
    summary: str
    ranked_offers: list[RankedOffer] = Field(alias="rankedOffers")
    missing_evidence: list[str] = Field(default_factory=list, alias="missingEvidence")


class ProposalLineItem(APIModel):
    label: str
    amount: Money


class ProposalDelivery(APIModel):
    label: str
    earliest: str
    latest: str


class CheckoutProposal(APIModel):
    id: str
    workflow_id: str = Field(alias="workflowId")
    version: int
    status: Literal["created", "approved", "rejected", "expired", "checked_out"]
    offer_id: str = Field(alias="offerId")
    merchant_name: str = Field(alias="merchantName")
    title: str
    quantity: Literal[1] = 1
    line_items: list[ProposalLineItem] = Field(alias="lineItems")
    subtotal: Money
    taxes_and_fees: Money = Field(alias="taxesAndFees")
    total: Money
    delivery: ProposalDelivery
    returns: Returns
    warranty: Warranty
    payment_method_label: str = Field(alias="paymentMethodLabel")
    approval_text: str = Field(alias="approvalText")
    expires_at: datetime = Field(alias="expiresAt")
    hash: str


class Approval(APIModel):
    id: str
    workflow_id: str = Field(alias="workflowId")
    proposal_id: str = Field(alias="proposalId")
    proposal_version: int = Field(alias="proposalVersion")
    proposal_hash: str = Field(alias="proposalHash")
    decision: Literal["approved", "rejected"]
    actor: Literal["demo_user"] = "demo_user"
    decided_at: datetime = Field(alias="decidedAt")
    spending_policy_result: Literal["approval_required_and_granted", "rejected_by_user"] = Field(
        alias="spendingPolicyResult"
    )
    audit_summary: str = Field(alias="auditSummary")


class Receipt(APIModel):
    receipt_id: str = Field(alias="receiptId")
    total: Money
    paid_at: datetime = Field(alias="paidAt")


class CheckoutAttempt(APIModel):
    id: str
    workflow_id: str = Field(alias="workflowId")
    proposal_id: str = Field(alias="proposalId")
    approval_id: str = Field(alias="approvalId")
    status: Literal["started", "succeeded", "failed"]
    failure_reason: Literal[
        "missing_approval",
        "proposal_mismatch",
        "proposal_expired",
        "price_changed",
        "out_of_stock",
        "delivery_changed",
        "return_policy_changed",
        "payment_failed",
    ] | None = Field(default=None, alias="failureReason")
    payment_authorization_id: str | None = Field(default=None, alias="paymentAuthorizationId")
    merchant_order_ref: str | None = Field(default=None, alias="merchantOrderRef")
    receipt: Receipt | None = None


class OrderTimelineEntry(APIModel):
    status: OrderStatus
    label: str
    happened_at: datetime = Field(alias="happenedAt")


class Order(APIModel):
    id: str
    workflow_id: str = Field(alias="workflowId")
    merchant_order_ref: str = Field(alias="merchantOrderRef")
    status: OrderStatus
    title: str
    total: Money
    delivery_label: str = Field(alias="deliveryLabel")
    tracking_number: str | None = Field(default=None, alias="trackingNumber")
    timeline: list[OrderTimelineEntry]


class DomainEvent(APIModel):
    id: str
    workflow_id: str = Field(alias="workflowId")
    type: str
    actor: Literal["user", "system", "module"]
    module: Literal[
        "orchestrator", "intent", "profile", "catalog", "comparison", "proposal", "consent", "checkout", "tracking"
    ]
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")


class WorkflowSummary(APIModel):
    id: str
    user_id: Literal["demo_user"] = Field(alias="userId")
    state: WorkflowState
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    prompt: str
    summary: str
    available_actions: list[WorkflowAction] = Field(alias="availableActions")


class WorkflowView(APIModel):
    workflow: WorkflowSummary
    clarification: ClarificationQuestion | None = None
    guardrail: PolicyBlock | None = None
    constraints: ShoppingConstraints | None = None
    alternatives: list[Alternative] | None = None
    comparison: ComparisonResult | None = None
    proposal: CheckoutProposal | None = None
    approval: Approval | None = None
    checkout: CheckoutAttempt | None = None
    order: Order | None = None
    events: list[DomainEvent]


class StartWorkflowRequest(APIModel):
    prompt: str = Field(min_length=1, max_length=2000)


class AddMessageRequest(APIModel):
    message: str = Field(min_length=1, max_length=1000)


class AcceptAlternativeRequest(APIModel):
    accepted: bool
    alternative_id: str | None = Field(default=None, alias="alternativeId")


class ApproveProposalRequest(APIModel):
    proposal_id: str = Field(alias="proposalId")
    proposal_version: int = Field(alias="proposalVersion")
    proposal_hash: str = Field(alias="proposalHash")
    approved: bool = True


class RejectProposalRequest(APIModel):
    proposal_id: str = Field(alias="proposalId")
    reason: str | None = None


class CheckoutRequest(APIModel):
    approval_id: str = Field(alias="approvalId")


class SimulateStatusRequest(APIModel):
    status: OrderStatus


class EventsResponse(APIModel):
    workflow_id: str = Field(alias="workflowId")
    events: list[DomainEvent]


# Kept for compatibility with the starter endpoint.
class ItemCreate(APIModel):
    name: str
    description: str | None = None


class Item(ItemCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
