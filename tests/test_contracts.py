from copy import deepcopy

import pytest

from app import schemas
from app.modules import (
    ComparisonModule,
    ConsentAuditModule,
    DemoProfileModule,
    DomainError,
    IntentGuardrailModule,
    MockCatalogModule,
    MockCheckoutModule,
    MockTrackingModule,
    ProposalModule,
)
from app.orchestrator import WorkflowOrchestrator


HAPPY_PROMPT = "Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident."
CLARIFICATION_PROMPT = "Buy me shoes for tomorrow."
ALTERNATIVE_PROMPT = "Find noise cancelling headphones under 200 PLN that arrive today."
GUARDRAIL_PROMPT = "Buy prescription medicine without asking me."
FAILURE_PROMPT = "Buy the cheapest USB-C hub that works with my MacBook."


@pytest.fixture
def profile():
    return DemoProfileModule().get_profile()


@pytest.mark.parametrize(
    ("prompt", "status"),
    [
        (HAPPY_PROMPT, "valid_request"),
        (CLARIFICATION_PROMPT, "need_clarification"),
        (ALTERNATIVE_PROMPT, "valid_request"),
        (GUARDRAIL_PROMPT, "policy_violation"),
        (FAILURE_PROMPT, "valid_request"),
    ],
)
def test_intent_classifies_required_scenarios(profile, prompt, status):
    assert IntentGuardrailModule().classify(prompt, [], profile).status == status


def test_intent_classifies_iphone_for_live_research(profile):
    result = IntentGuardrailModule().classify("Buy iPhone 12 please", [], profile)

    assert result.status == "valid_request"
    assert result.constraints.product_category == "smartphone"


def test_deterministic_guardrail_handles_localized_prescription_request(profile):
    result = IntentGuardrailModule().classify("Kup mi leki na receptę", [], profile)
    assert result.status == "policy_violation"
    assert result.block.code == "requires_professional_verification"


def test_shoe_clarification_exposes_renderable_form(profile):
    result = IntentGuardrailModule().classify(CLARIFICATION_PROMPT, [], profile)
    assert result.question.expected_field == "shoe_size"
    assert result.question.fields[0].name == "shoe_size"
    assert result.question.fields[0].required is True


def test_catalog_and_comparison_choose_happy_monitor(profile):
    classification = IntentGuardrailModule().classify(HAPPY_PROMPT, [], profile)
    search = MockCatalogModule().search(classification.constraints, profile)
    assert search.status == "offers_found"
    assert len(search.offers) >= 4
    comparison = ComparisonModule().compare("wf_test", classification.constraints, profile, search.offers)
    assert comparison.best_offer_id == "offer_monitor_happy"
    assert comparison.recommendation == "proceed"


def test_catalog_offers_transparent_headphone_alternatives(profile):
    constraints = IntentGuardrailModule().classify(ALTERNATIVE_PROMPT, [], profile).constraints
    result = MockCatalogModule().search(constraints, profile)
    assert result.status == "alternatives_found"
    assert {item.id for item in result.alternatives} == {"alt_delivery_tomorrow", "alt_budget_300"}


def test_proposal_hash_changes_with_approved_total(profile):
    catalog = MockCatalogModule()
    offer = catalog.get_offer("offer_monitor_happy")
    comparison = schemas.ComparisonResult(
        id="cmp", bestOfferId=offer.id, confidence=0.99, recommendation="proceed",
        summary="Best", rankedOffers=[], missingEvidence=[]
    )
    module = ProposalModule()
    proposal = module.create_proposal("wf_test", offer, comparison, profile)
    changed = proposal.model_copy(deep=True)
    changed.total.amount += 1
    assert module.hash_proposal(changed) != proposal.hash


def test_consent_rejects_wrong_hash(profile):
    orchestrator = WorkflowOrchestrator()
    view = orchestrator.start_workflow(HAPPY_PROMPT)
    with pytest.raises(DomainError, match="hash"):
        ConsentAuditModule().approve(
            view.workflow.id, view.proposal, view.proposal.id, view.proposal.version, "sha256:wrong"
        )


def test_checkout_refuses_without_approval(profile):
    orchestrator = WorkflowOrchestrator()
    view = orchestrator.start_workflow(HAPPY_PROMPT)
    result = MockCheckoutModule(orchestrator.catalog).execute(
        view.workflow.id, view.proposal, None, profile.payment_method.token
    )
    assert result.status == "failed"
    assert result.attempt.failure_reason == "missing_approval"


def test_checkout_fails_on_fixture_stock_drift():
    orchestrator = WorkflowOrchestrator()
    view = orchestrator.start_workflow(FAILURE_PROMPT)
    approved = orchestrator.approve_proposal(
        view.workflow.id, view.proposal.id, view.proposal.version, view.proposal.hash
    )
    failed = orchestrator.execute_checkout(view.workflow.id, approved.approval.id)
    assert failed.workflow.state == "checkout_failed"
    assert failed.checkout.failure_reason == "out_of_stock"


def test_tracking_moves_order_to_delivered():
    orchestrator = WorkflowOrchestrator()
    view = orchestrator.start_workflow(HAPPY_PROMPT)
    approved = orchestrator.approve_proposal(
        view.workflow.id, view.proposal.id, view.proposal.version, view.proposal.hash
    )
    tracking = orchestrator.execute_checkout(view.workflow.id, approved.approval.id)
    delivered = orchestrator.simulate_order_status(tracking.order.id, "delivered")
    assert delivered.order.status == "delivered"
    assert delivered.workflow.state == "completed"


def test_orchestrator_happy_path_stops_for_human_approval():
    view = WorkflowOrchestrator().start_workflow(HAPPY_PROMPT)
    assert view.workflow.state == "awaiting_approval"
    assert view.proposal.offer_id == "offer_monitor_happy"
    assert "approve_proposal" in view.workflow.available_actions
    assert any(event.type == "proposal.created" for event in view.events)
    decision = view.history.revisions[0].decision
    assert decision.kind == "proposal"
    assert decision.title == view.proposal.approval_text
    assert {fact.label for fact in decision.facts} >= {"Product", "Merchant", "Total"}


def test_rollback_restores_snapshot_and_preserves_abandoned_branch():
    orchestrator = WorkflowOrchestrator()
    initial = orchestrator.start_workflow(CLARIFICATION_PROMPT)
    initial_revision_id = initial.history.current_revision_id
    assert initial.history.revisions[0].decision.kind == "clarification"
    assert initial.history.revisions[0].decision.title == initial.clarification.text

    answered = orchestrator.add_user_message(
        initial.workflow.id,
        message="Size 42, black, comfortable for walking.",
    )
    abandoned_revision_id = answered.history.current_revision_id
    assert answered.workflow.state == "awaiting_approval"

    restored = orchestrator.rollback_workflow(initial.workflow.id, initial_revision_id)

    assert restored.workflow.state == "needs_clarification"
    assert restored.clarification is not None
    assert restored.proposal is None
    assert restored.comparison is None
    assert "rollback" in restored.workflow.available_actions
    assert {item.id for item in restored.history.revisions} >= {
        initial_revision_id,
        abandoned_revision_id,
    }
    current = next(item for item in restored.history.revisions if item.is_current)
    assert current.parent_revision_id == initial_revision_id
    assert current.rollback_from_revision_id == abandoned_revision_id
    assert any(event.type == "workflow.rollback_performed" for event in restored.events)
    assert any(
        event.type == "workflow.state_changed" and event.data.get("reason") == "rollback"
        for event in restored.events
    )


def test_rollback_after_checkout_records_mock_compensation():
    orchestrator = WorkflowOrchestrator()
    proposed = orchestrator.start_workflow(HAPPY_PROMPT)
    proposal_revision_id = proposed.history.current_revision_id
    approved = orchestrator.approve_proposal(
        proposed.workflow.id,
        proposed.proposal.id,
        proposed.proposal.version,
        proposed.proposal.hash,
    )
    tracking = orchestrator.execute_checkout(proposed.workflow.id, approved.approval.id)

    restored = orchestrator.rollback_workflow(proposed.workflow.id, proposal_revision_id)

    assert tracking.order is not None
    assert restored.workflow.state == "awaiting_approval"
    assert restored.order is None
    assert restored.checkout is None
    assert restored.approval is None
    assert any(event.type == "rollback.compensation_recorded" for event in restored.events)
