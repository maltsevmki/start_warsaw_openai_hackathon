from app.modules import MockCheckoutModule
from app.orchestrator import WorkflowOrchestrator
from app.payments import MockPaymentGateway, PaymentResult, default_gateway


HAPPY_PROMPT = (
    "Find me the best monitor under 1000 PLN that works with my MacBook, "
    "arrives tomorrow, and has good return terms. Buy it if you are confident."
)


class _StubGateway:
    def __init__(self, result: PaymentResult):
        self.result = result
        self.calls: list[tuple] = []

    def authorize(self, amount, currency, description, idempotency_key):
        self.calls.append((amount, currency, idempotency_key))
        return self.result


def _approved_proposal():
    orch = WorkflowOrchestrator()
    view = orch.start_workflow(HAPPY_PROMPT)
    approved = orch.approve_proposal(
        view.workflow.id, view.proposal.id, view.proposal.version, view.proposal.hash
    )
    return orch, approved


def test_successful_payment_uses_gateway_authorization_id():
    orch, view = _approved_proposal()
    gateway = _StubGateway(PaymentResult("succeeded", authorization_id="pi_test_123"))
    module = MockCheckoutModule(orch.catalog, gateway=gateway)

    result = module.execute(view.workflow.id, view.proposal, view.approval, "pm_demo_card")

    assert result.status == "succeeded"
    assert result.attempt.payment_authorization_id == "pi_test_123"
    # The real charged amount is the exact approved total, in the approved currency.
    assert gateway.calls and gateway.calls[0][0] == view.proposal.total.amount
    assert gateway.calls[0][1] == "PLN"


def test_declined_payment_becomes_checkout_failure():
    orch, view = _approved_proposal()
    gateway = _StubGateway(PaymentResult("failed", failure_reason="payment_failed"))
    module = MockCheckoutModule(orch.catalog, gateway=gateway)

    result = module.execute(view.workflow.id, view.proposal, view.approval, "pm_demo_card")

    assert result.status == "failed"
    assert result.attempt.failure_reason == "payment_failed"


def test_default_gateway_is_mock_without_stripe_provider(monkeypatch):
    monkeypatch.delenv("PAYMENTS_PROVIDER", raising=False)
    assert isinstance(default_gateway(), MockPaymentGateway)


def test_stripe_provider_without_key_falls_back_to_mock(monkeypatch):
    monkeypatch.setenv("PAYMENTS_PROVIDER", "stripe")
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    assert isinstance(default_gateway(), MockPaymentGateway)
