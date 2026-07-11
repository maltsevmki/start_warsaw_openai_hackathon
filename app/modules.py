from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

from app import schemas
from app.domain.catalog import CatalogSearchResult
from app.domain.intent import ClassificationResult
from app.ports.catalog import CatalogModule
from app.ports.comparison import ComparisonRationaleModule

if TYPE_CHECKING:
    from app.settings import Settings

if TYPE_CHECKING:
    from app.payments import PaymentGateway


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


class DomainError(Exception):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class DemoProfileModule:
    _profile = schemas.DemoUserProfile.model_validate(
        {
            "userId": "demo_user",
            "locale": "en-PL",
            "addressLabel": "Home, Warsaw",
            "deviceFacts": [
                "MacBook with USB-C",
                "Prefers external displays with USB-C or HDMI",
            ],
            "spendingPolicy": {
                "explicitApprovalRequired": True,
                "autonomousLimit": {"amount": 0, "currency": "PLN"},
            },
            "paymentMethod": {
                "token": "pm_demo_card",
                "label": "Demo Visa ending 4242",
            },
        }
    )

    def get_profile(self, user_id: str = "demo_user") -> schemas.DemoUserProfile:
        if user_id != "demo_user":
            raise DomainError("Only demo_user is available in this demo", 404)
        return self._profile.model_copy(deep=True)

    def get_payment_method(self, user_id: str = "demo_user") -> schemas.PaymentMethod:
        return self.get_profile(user_id).payment_method

    def requires_approval(self, user_id: str, total: schemas.Money) -> bool:
        return self.get_profile(user_id).spending_policy.explicit_approval_required


class IntentGuardrailModule:
    CATEGORY_KEYWORDS = {
        "monitor": ("monitor", "display", "screen"),
        "headphones": ("headphone", "headphones", "headset"),
        "shoes": ("shoe", "shoes", "sneaker", "sneakers"),
        "clothing": ("shirt", "jacket", "trousers", "dress", "clothing", "clothes"),
        "usb_c_hub": ("usb-c hub", "usb c hub", "hub", "dongle"),
    }

    def classify(
        self,
        prompt: str,
        prior_messages: list[str],
        profile: schemas.DemoUserProfile,
    ) -> ClassificationResult:
        combined = " ".join([prompt, *prior_messages]).strip()
        lower = combined.lower()
        constraints = self._extract_constraints(combined)

        guardrail = self.check_guardrails(combined)
        if guardrail:
            return guardrail

        category = constraints.product_category
        if category == "shoes" and not re.search(r"\b(?:size\s*)?(3[5-9]|4[0-9]|5[0-2])\b", lower):
            return self.clarification_result(
                constraints,
                "shoe_size",
                "What shoe size should I look for? You can also add a color or intended use.",
                ["Size 42, black", "EU 39, for running"],
            )
        if category == "clothing" and not re.search(r"\b(?:size\s*)?(xs|s|m|l|xl|xxl|\d{2})\b", lower):
            return self.clarification_result(
                constraints,
                "clothing_size",
                "What clothing size should I use?",
                ["Size M", "EU 40"],
            )
        if category is None:
            return self.clarification_result(
                constraints,
                "product_category_and_budget",
                "What kind of product would you like, and what is your maximum budget?",
                ["Headphones under 300 PLN", "A desk lamp under 150 PLN"],
            )

        summary_bits = [f"Looking for {category.replace('_', ' ')}"]
        if constraints.budget_max:
            summary_bits.append(f"up to {constraints.budget_max.amount:g} PLN")
        if constraints.delivery_deadline:
            summary_bits.append(f"for delivery {constraints.delivery_deadline.replace('_', ' ')}")
        return ClassificationResult(
            status="valid_request",
            constraints=constraints,
            summary=", ".join(summary_bits) + ".",
            confidence=0.97,
        )

    def check_guardrails(self, text: str) -> ClassificationResult | None:
        """Apply only hard application policy checks, without classifying safe intent."""
        lower = text.lower()
        if any(
            phrase in lower
            for phrase in (
                "prescription medicine",
                "prescription drug",
                "controlled substance",
                "lek na receptę",
                "leki na receptę",
            )
        ):
            return ClassificationResult(
                status="policy_violation",
                confidence=0.99,
                block=schemas.PolicyBlock(
                    code="requires_professional_verification",
                    message="Prescription medicine requires verification by a licensed clinician or pharmacist and cannot be purchased autonomously.",
                    canSuggestSaferAlternative=True,
                ),
            )
        if re.search(r"\b(?:weapon|weapons|firearm|firearms|gun|guns|illegal)\b", lower):
            return ClassificationResult(
                status="policy_violation",
                confidence=0.99,
                block=schemas.PolicyBlock(
                    code="unsafe_or_illegal",
                    message="This request involves restricted, unsafe, or illegal goods and cannot be completed.",
                    canSuggestSaferAlternative=False,
                ),
            )

        return None

    def clarification_result(
        self,
        constraints: schemas.ShoppingConstraints,
        expected_field: str,
        text: str,
        examples: list[str],
    ) -> ClassificationResult:
        return ClassificationResult(
            status="need_clarification",
            constraints=constraints,
            confidence=0.93,
            question=schemas.ClarificationQuestion(
                id=new_id("clar"),
                text=text,
                expectedField=expected_field,
                examples=examples,
                fields=self._clarification_fields(expected_field),
            ),
        )

    def _clarification_fields(self, expected_field: str) -> list[schemas.ClarificationField]:
        if expected_field == "shoe_size":
            return [
                schemas.ClarificationField(
                    name="shoe_size",
                    label="EU shoe size",
                    inputType="number",
                    placeholder="42",
                ),
                schemas.ClarificationField(
                    name="color",
                    label="Preferred color",
                    inputType="text",
                    required=False,
                    placeholder="Black",
                ),
                schemas.ClarificationField(
                    name="intended_use",
                    label="Intended use",
                    inputType="text",
                    required=False,
                    placeholder="Comfortable walking",
                ),
            ]
        if expected_field == "clothing_size":
            return [
                schemas.ClarificationField(
                    name="clothing_size",
                    label="Clothing size",
                    inputType="single_select",
                    options=["XS", "S", "M", "L", "XL", "XXL"],
                    allowCustom=True,
                    placeholder="M or EU 40",
                )
            ]
        if expected_field == "product_category_and_budget":
            return [
                schemas.ClarificationField(
                    name="product_category",
                    label="Product",
                    inputType="text",
                    placeholder="Headphones",
                ),
                schemas.ClarificationField(
                    name="budget_max",
                    label="Maximum budget (PLN)",
                    inputType="number",
                    placeholder="300",
                ),
            ]
        return [
            schemas.ClarificationField(
                name=expected_field,
                label=expected_field.replace("_", " ").capitalize(),
                inputType="text",
            )
        ]

    def _extract_constraints(self, text: str) -> schemas.ShoppingConstraints:
        lower = text.lower()
        category = next(
            (category for category, words in self.CATEGORY_KEYWORDS.items() if any(word in lower for word in words)),
            None,
        )
        budget_match = re.search(
            r"(?:under|below|up to|max(?:imum)?(?: of)?)\s*(?:pln\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:pln|zł|zl)?",
            lower,
        )
        budget = (
            schemas.Money(amount=float(budget_match.group(1).replace(",", ".")))
            if budget_match
            else None
        )
        deadline = None
        if "today" in lower:
            deadline = "today"
        elif "tomorrow" in lower:
            deadline = "tomorrow"
        elif "this week" in lower:
            deadline = "this_week"
        compatibility = ["MacBook"] if "macbook" in lower or "usb-c" in lower or "usb c" in lower else []
        must_have: list[str] = []
        nice_to_have: list[str] = []
        if "noise cancelling" in lower or "noise-cancelling" in lower:
            must_have.append("noise cancelling")
        if "cheapest" in lower:
            must_have.append("cheapest")
        size = re.search(r"\b(?:size\s*)?(3[5-9]|4[0-9]|5[0-2])\b", lower)
        if size and category == "shoes":
            must_have.append(f"size {size.group(1)}")
        if "black" in lower:
            nice_to_have.append("black")
        required_return_days = 30 if "good return" in lower else None
        return schemas.ShoppingConstraints(
            productCategory=category,
            query=text,
            budgetMax=budget,
            deliveryDeadline=deadline,
            compatibility=compatibility,
            mustHave=must_have,
            niceToHave=nice_to_have,
            requiredReturnDays=required_return_days,
            forbidden=[],
        )


@dataclass
class RevalidateResult:
    status: str
    offer: schemas.Offer | None = None
    reason: str | None = None


class MockCatalogModule:
    def __init__(
        self,
        fixture_path: Path | None = None,
        settings: Settings | None = None,
        research_agent: CatalogModule | None = None,
    ):
        self.offers: list[schemas.Offer] = []
        self.by_id: dict[str, schemas.Offer] = {}
        self._research_agent = research_agent
        # The fixture catalog is an explicit mock-provider dependency only.
        # Live research caches its own offers for checkout revalidation.
        if settings is None or settings.catalog_provider == "mock":
            path = fixture_path or Path(__file__).parent / "fixtures" / "catalog.json"
            raw = json.loads(path.read_text())
            self.offers = [
                schemas.Offer.model_validate(item) for group in raw.values() for item in group
            ]
            self.by_id = {offer.id: offer for offer in self.offers}
        if self._research_agent is None and settings is not None:
            self._research_agent = self._build_research_agent(settings)

    def search(
        self, constraints: schemas.ShoppingConstraints, profile: schemas.DemoUserProfile
    ) -> CatalogSearchResult:
        if self._research_agent:
            return self._research_agent.search(constraints, profile)
        return self.search_fixtures(constraints, profile)

    def search_fixtures(
        self, constraints: schemas.ShoppingConstraints, profile: schemas.DemoUserProfile
    ) -> CatalogSearchResult:
        candidates = [
            self._for_deadline(offer, constraints.delivery_deadline)
            for offer in self.offers
            if offer.category == constraints.product_category
        ]
        return self.evaluate_offers(constraints, candidates)

    def evaluate_offers(
        self,
        constraints: schemas.ShoppingConstraints,
        offers: list[schemas.Offer],
        *,
        cache: bool = False,
        include_fixture_alternatives: bool = True,
    ) -> CatalogSearchResult:
        candidates = [self._for_deadline(offer, constraints.delivery_deadline) for offer in offers]
        if cache:
            self.by_id.update({offer.id: offer.model_copy(deep=True) for offer in candidates})
        exact = [offer for offer in candidates if self._is_exact(offer, constraints)]
        if exact:
            return CatalogSearchResult(new_id("search"), "offers_found", candidates, [])
        alternatives = self._alternatives(constraints, candidates) if include_fixture_alternatives else []
        return CatalogSearchResult(
            new_id("search"),
            "alternatives_found" if alternatives else "no_results",
            candidates,
            alternatives,
        )

    def _build_research_agent(self, settings: Settings) -> CatalogModule | None:
        from app.factories import build_catalog_research_module

        return build_catalog_research_module(settings, self)

    def get_offer(self, offer_id: str) -> schemas.Offer | None:
        offer = self.by_id.get(offer_id)
        return offer.model_copy(deep=True) if offer else None

    def revalidate_offer(
        self,
        offer_id: str,
        approved_total: schemas.Money,
        approved_delivery_label: str,
        approved_return_days: int,
    ) -> RevalidateResult:
        offer = self.get_offer(offer_id)
        if not offer:
            return RevalidateResult("changed", reason="out_of_stock")
        if offer.demo_behavior == "out_of_stock_at_checkout":
            return RevalidateResult("changed", reason="out_of_stock")
        if offer.demo_behavior == "price_changes_at_checkout":
            return RevalidateResult("changed", reason="price_changed")
        if offer.stock_status == "out_of_stock":
            return RevalidateResult("changed", reason="out_of_stock")
        if offer.total.amount != approved_total.amount:
            return RevalidateResult("changed", reason="price_changed")
        if offer.delivery.label != approved_delivery_label:
            return RevalidateResult("changed", reason="delivery_changed")
        if offer.returns.days != approved_return_days:
            return RevalidateResult("changed", reason="return_policy_changed")
        return RevalidateResult("valid", offer=offer)

    def _for_deadline(self, offer: schemas.Offer, deadline: str | None) -> schemas.Offer:
        copied = offer.model_copy(deep=True)
        earliest = copied.delivery.earliest
        meets = (
            deadline is None
            or (deadline == "today" and earliest == "today")
            or (deadline == "tomorrow" and earliest in {"today", "tomorrow"})
            or (deadline == "this_week" and earliest in {"today", "tomorrow", "this_week"})
        )
        copied.delivery.meets_deadline = meets and copied.stock_status != "out_of_stock"
        return copied

    def _is_exact(self, offer: schemas.Offer, constraints: schemas.ShoppingConstraints) -> bool:
        if offer.stock_status == "out_of_stock" or not offer.delivery.meets_deadline:
            return False
        if constraints.budget_max and offer.total.amount > constraints.budget_max.amount:
            return False
        if constraints.compatibility and offer.compatibility.macbook != "yes":
            return False
        if constraints.required_return_days and offer.returns.days < constraints.required_return_days:
            return False
        size = next((item for item in constraints.must_have if item.startswith("size ")), None)
        if size and size not in offer.title.lower():
            return False
        return True

    def _alternatives(
        self, constraints: schemas.ShoppingConstraints, offers: list[schemas.Offer]
    ) -> list[schemas.Alternative]:
        alternatives: list[schemas.Alternative] = []
        if constraints.product_category == "headphones" and constraints.delivery_deadline == "today":
            later = constraints.model_copy(deep=True)
            later.delivery_deadline = "tomorrow"
            alternatives.append(
                schemas.Alternative(
                    id="alt_delivery_tomorrow",
                    reason="later_delivery",
                    message="No exact option meets both 200 PLN and today. The Soundcore Q20i is 189 PLN and arrives tomorrow.",
                    adjustedConstraints=later,
                )
            )
            higher = constraints.model_copy(deep=True)
            higher.budget_max = schemas.Money(amount=300)
            alternatives.append(
                schemas.Alternative(
                    id="alt_budget_300",
                    reason="higher_budget",
                    message="Raise the budget to 300 PLN for the JBL Tune 770NC with delivery today.",
                    adjustedConstraints=higher,
                )
            )
        return alternatives


class ComparisonModule:
    def __init__(
        self,
        rationale: ComparisonRationaleModule | None = None,
        settings: Settings | None = None,
    ):
        self._rationale = rationale
        if self._rationale is None and settings is not None:
            try:
                self._rationale = self._build_rationale(settings)
            except Exception:
                # The optional narrator can never prevent deterministic
                # comparison from starting.
                self._rationale = None

    def compare(
        self,
        workflow_id: str,
        constraints: schemas.ShoppingConstraints,
        profile: schemas.DemoUserProfile,
        offers: list[schemas.Offer],
    ) -> schemas.ComparisonResult:
        lowest = min((o.total.amount for o in offers if o.stock_status != "out_of_stock"), default=0)
        ranked: list[schemas.RankedOffer] = []
        for offer in offers:
            score = 0.0
            reasons: list[str] = []
            tradeoffs: list[str] = []
            disqualifiers: list[str] = []

            if offer.stock_status == "out_of_stock":
                disqualifiers.append("Out of stock")
            if constraints.compatibility and offer.compatibility.macbook == "no":
                disqualifiers.append("Incompatible with MacBook")

            if "cheapest" in constraints.must_have:
                budget_score = 30 if offer.total.amount == lowest else max(0, 30 - (offer.total.amount - lowest) / 8)
            else:
                budget_score = 30 if not constraints.budget_max or offer.total.amount <= constraints.budget_max.amount else 0
            score += budget_score
            if budget_score == 30:
                reasons.append("Meets the budget target")
            else:
                tradeoffs.append("Costs more than the requested budget or lowest option")

            if offer.delivery.meets_deadline:
                score += 25
                reasons.append("Meets the delivery deadline")
            else:
                tradeoffs.append("Misses the requested delivery deadline")

            if not constraints.compatibility or offer.compatibility.macbook == "yes":
                score += 20
                reasons.append("Compatibility requirements are satisfied")
            elif offer.compatibility.macbook == "unknown":
                tradeoffs.append("MacBook compatibility is not verified")

            if not constraints.required_return_days or offer.returns.days >= constraints.required_return_days:
                score += 15
                reasons.append(f"Includes {offer.returns.days}-day returns")
            else:
                tradeoffs.append("Return window is shorter than requested")

            rating_score = min(10, offer.rating.value / 5 * 8 + min(2, offer.rating.count / 500))
            score += rating_score
            reasons.append(f"Rated {offer.rating.value:g}/5 from {offer.rating.count} reviews")
            if disqualifiers:
                score = 0
            ranked.append(
                schemas.RankedOffer(
                    offerId=offer.id,
                    rank=0,
                    score=round(score, 1),
                    title=offer.title,
                    total=offer.total,
                    reasons=reasons,
                    tradeoffs=tradeoffs,
                    disqualifiers=disqualifiers,
                )
            )

        ranked.sort(key=lambda item: item.score, reverse=True)
        for index, item in enumerate(ranked, start=1):
            item.rank = index
        viable = [item for item in ranked if not item.disqualifiers and item.score >= 50]
        best = viable[0] if viable else None
        confidence = min(0.99, (best.score / 100) if best else 0.0)
        recommendation = "proceed" if best and confidence >= 0.75 else "ask_user" if best else "stop"
        summary = (
            f"{best.title} is the strongest match with a score of {best.score}/100."
            if best
            else "No viable offer satisfies the hard requirements."
        )
        if best and self._rationale:
            try:
                summary = self._rationale.explain(constraints, best)
            except Exception:
                # The deterministic rationale is deliberately retained if the
                # optional narrator is unavailable or returns invalid output.
                pass
        return schemas.ComparisonResult(
            id=new_id("cmp"),
            bestOfferId=best.offer_id if best else None,
            confidence=round(confidence, 2),
            recommendation=recommendation,
            summary=summary,
            rankedOffers=ranked,
            missingEvidence=[] if best else ["No offer satisfies all hard requirements"],
        )

    @staticmethod
    def _build_rationale(settings: Settings | None) -> ComparisonRationaleModule | None:
        from app.factories import build_comparison_rationale

        return build_comparison_rationale(settings)


class ProposalModule:
    HASH_FIELDS = (
        "offerId",
        "merchantName",
        "title",
        "quantity",
        "total",
        "delivery",
        "returns",
        "warranty",
        "paymentMethodLabel",
        "version",
    )

    def create_proposal(
        self,
        workflow_id: str,
        offer: schemas.Offer,
        comparison: schemas.ComparisonResult,
        profile: schemas.DemoUserProfile,
    ) -> schemas.CheckoutProposal:
        data = {
            "id": new_id("prop"),
            "workflowId": workflow_id,
            "version": 1,
            "status": "created",
            "offerId": offer.id,
            "merchantName": offer.merchant_name,
            "title": offer.title,
            "quantity": 1,
            "lineItems": [
                {"label": "Item", "amount": offer.price.model_dump(by_alias=True)},
                {"label": "Taxes and fees", "amount": offer.taxes_and_fees.model_dump(by_alias=True)},
            ],
            "subtotal": offer.price.model_dump(by_alias=True),
            "taxesAndFees": offer.taxes_and_fees.model_dump(by_alias=True),
            "total": offer.total.model_dump(by_alias=True),
            "delivery": {
                "label": offer.delivery.label,
                "earliest": offer.delivery.earliest,
                "latest": offer.delivery.latest,
            },
            "returns": offer.returns.model_dump(by_alias=True),
            "warranty": offer.warranty.model_dump(by_alias=True),
            "paymentMethodLabel": profile.payment_method.label,
            "approvalText": f"Approve a payment of {offer.total.amount:g} PLN to {offer.merchant_name} for {offer.title}.",
            "expiresAt": utcnow() + timedelta(minutes=10),
            "hash": "",
        }
        proposal = schemas.CheckoutProposal.model_validate(data)
        proposal.hash = self.hash_proposal(proposal)
        return proposal

    def hash_proposal(self, proposal: schemas.CheckoutProposal) -> str:
        dumped = proposal.model_dump(by_alias=True, mode="json")
        approved_fields = {field: dumped[field] for field in self.HASH_FIELDS}
        canonical = json.dumps(approved_fields, sort_keys=True, separators=(",", ":"))
        return "sha256:" + hashlib.sha256(canonical.encode()).hexdigest()


class ConsentAuditModule:
    def approve(
        self,
        workflow_id: str,
        proposal: schemas.CheckoutProposal,
        proposal_id: str,
        proposal_version: int,
        proposal_hash: str,
    ) -> schemas.Approval:
        if proposal.id != proposal_id:
            raise DomainError("Proposal id does not match the current proposal")
        if proposal.version != proposal_version:
            raise DomainError("Proposal version does not match the current proposal")
        if proposal.hash != proposal_hash:
            raise DomainError("Proposal hash does not match the exact terms shown to the user")
        if proposal.expires_at <= utcnow():
            raise DomainError("Proposal has expired")
        return schemas.Approval(
            id=new_id("appr"),
            workflowId=workflow_id,
            proposalId=proposal.id,
            proposalVersion=proposal.version,
            proposalHash=proposal.hash,
            decision="approved",
            actor="demo_user",
            decidedAt=utcnow(),
            spendingPolicyResult="approval_required_and_granted",
            auditSummary=f"demo_user approved proposal v{proposal.version} for {proposal.total.amount:g} PLN.",
        )

    def reject(
        self, workflow_id: str, proposal: schemas.CheckoutProposal, reason: str | None = None
    ) -> schemas.Approval:
        return schemas.Approval(
            id=new_id("appr"),
            workflowId=workflow_id,
            proposalId=proposal.id,
            proposalVersion=proposal.version,
            proposalHash=proposal.hash,
            decision="rejected",
            actor="demo_user",
            decidedAt=utcnow(),
            spendingPolicyResult="rejected_by_user",
            auditSummary=f"demo_user rejected the proposal{f': {reason}' if reason else '.'}",
        )


@dataclass
class CheckoutResult:
    status: str
    attempt: schemas.CheckoutAttempt
    order_seed: dict | None = None


class MockCheckoutModule:
    def __init__(self, catalog: MockCatalogModule, gateway: "PaymentGateway | None" = None):
        self.catalog = catalog
        if gateway is None:
            from app.payments import default_gateway

            gateway = default_gateway()
        self.gateway = gateway

    def execute(
        self,
        workflow_id: str,
        proposal: schemas.CheckoutProposal,
        approval: schemas.Approval | None,
        payment_method_token: str,
    ) -> CheckoutResult:
        attempt_id = new_id("chk")
        if not approval or approval.decision != "approved":
            return self._failure(attempt_id, workflow_id, proposal.id, approval, "missing_approval")
        if approval.proposal_hash != proposal.hash or approval.proposal_id != proposal.id:
            return self._failure(attempt_id, workflow_id, proposal.id, approval, "proposal_mismatch")
        if proposal.expires_at <= utcnow():
            return self._failure(attempt_id, workflow_id, proposal.id, approval, "proposal_expired")
        revalidated = self.catalog.revalidate_offer(
            proposal.offer_id,
            proposal.total,
            proposal.delivery.label,
            proposal.returns.days,
        )
        if revalidated.status == "changed":
            return self._failure(attempt_id, workflow_id, proposal.id, approval, revalidated.reason or "out_of_stock")
        if revalidated.offer and revalidated.offer.demo_behavior == "payment_failed":
            return self._failure(attempt_id, workflow_id, proposal.id, approval, "payment_failed")

        payment = self.gateway.authorize(
            amount=proposal.total.amount,
            currency=proposal.total.currency,
            description=f"{proposal.title} ({proposal.id})",
            idempotency_key=f"{workflow_id}:{proposal.id}:{approval.id}",
        )
        if payment.status != "succeeded":
            return self._failure(
                attempt_id, workflow_id, proposal.id, approval, payment.failure_reason or "payment_failed"
            )

        merchant_ref = f"DEMO-{uuid4().hex[:8].upper()}"
        attempt = schemas.CheckoutAttempt(
            id=attempt_id,
            workflowId=workflow_id,
            proposalId=proposal.id,
            approvalId=approval.id,
            status="succeeded",
            paymentAuthorizationId=payment.authorization_id or new_id("pay"),
            merchantOrderRef=merchant_ref,
            receipt={"receiptId": new_id("receipt"), "total": proposal.total, "paidAt": utcnow()},
        )
        seed = {
            "merchantOrderRef": merchant_ref,
            "proposalId": proposal.id,
            "title": proposal.title,
            "total": proposal.total,
            "deliveryLabel": proposal.delivery.label,
        }
        return CheckoutResult("succeeded", attempt, seed)

    def _failure(
        self,
        attempt_id: str,
        workflow_id: str,
        proposal_id: str,
        approval: schemas.Approval | None,
        reason: str,
    ) -> CheckoutResult:
        attempt = schemas.CheckoutAttempt(
            id=attempt_id,
            workflowId=workflow_id,
            proposalId=proposal_id,
            approvalId=approval.id if approval else "missing",
            status="failed",
            failureReason=reason,
        )
        return CheckoutResult("failed", attempt)


class MockTrackingModule:
    STATUS_LABELS = {
        "order_created": "Order created",
        "confirmed": "Merchant confirmed the order",
        "packed": "Order packed",
        "shipped": "Parcel shipped",
        "out_for_delivery": "Out for delivery",
        "delivered": "Delivered",
        "exception": "Delivery exception - attention needed",
        "cancelled": "Order cancelled",
        "return_requested": "Return requested",
        "returned": "Returned",
    }

    def create_order(self, workflow_id: str, seed: dict) -> schemas.Order:
        now = utcnow()
        return schemas.Order(
            id=new_id("order"),
            workflowId=workflow_id,
            merchantOrderRef=seed["merchantOrderRef"],
            status="order_created",
            title=seed["title"],
            total=seed["total"],
            deliveryLabel=seed["deliveryLabel"],
            trackingNumber=f"DEMO{uuid4().hex[:10].upper()}",
            timeline=[{"status": "order_created", "label": "Order created", "happenedAt": now}],
        )

    def simulate_status(self, order: schemas.Order, status: schemas.OrderStatus) -> schemas.Order:
        updated = order.model_copy(deep=True)
        updated.status = status
        updated.timeline.append(
            schemas.OrderTimelineEntry(
                status=status,
                label=self.STATUS_LABELS[status],
                happenedAt=utcnow(),
            )
        )
        return updated
