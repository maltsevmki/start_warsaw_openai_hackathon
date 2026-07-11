from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.settings import Settings


@dataclass
class PaymentResult:
    """Outcome of a payment authorization, transport-agnostic."""

    status: str  # "succeeded" | "failed"
    authorization_id: str | None = None
    failure_reason: str | None = None  # maps to CheckoutAttempt.failure_reason


class PaymentGateway:
    """Contract the checkout module depends on. Swap the implementation freely."""

    def authorize(
        self, amount: float, currency: str, description: str, idempotency_key: str
    ) -> PaymentResult:  # pragma: no cover - interface
        raise NotImplementedError


class MockPaymentGateway(PaymentGateway):
    """Deterministic, offline gateway. Keeps the demo and tests network-free."""

    def authorize(self, amount, currency, description, idempotency_key):
        return PaymentResult("succeeded", authorization_id=f"pay_mock_{uuid.uuid4().hex[:12]}")


class StripePaymentGateway(PaymentGateway):
    """Real Stripe test-mode payments. Only built when PAYMENTS_PROVIDER=stripe."""

    def __init__(self, secret_key: str, payment_method: str):
        import stripe  # imported lazily so the package stays optional

        self._stripe = stripe
        self._stripe.api_key = secret_key
        self._payment_method = payment_method

    def authorize(self, amount, currency, description, idempotency_key):
        try:
            intent = self._stripe.PaymentIntent.create(
                amount=int(round(amount * 100)),  # PLN -> grosze (minor units)
                currency=currency.lower(),
                payment_method=self._payment_method,
                payment_method_types=["card"],
                confirm=True,
                description=description,
                idempotency_key=idempotency_key,
            )
        except Exception:
            # A declined test card or any Stripe error becomes a clean checkout failure,
            # never a 500. The two-step approval/hash guarantee is untouched.
            return PaymentResult("failed", failure_reason="payment_failed")
        if intent.status in {"succeeded", "requires_capture"}:
            return PaymentResult("succeeded", authorization_id=intent.id)
        return PaymentResult("failed", failure_reason="payment_failed")


def default_gateway(settings: Settings | None = None) -> PaymentGateway:
    """Real Stripe when PAYMENTS_PROVIDER=stripe and a key is present; mock otherwise.

    Any misconfiguration or missing package falls back to the deterministic mock
    so a live demo never crashes at checkout.
    """
    settings = settings or Settings.from_env()
    if settings.payments_provider == "stripe" and settings.stripe_secret_key:
        try:
            return StripePaymentGateway(settings.stripe_secret_key, settings.stripe_test_payment_method)
        except Exception:
            return MockPaymentGateway()
    return MockPaymentGateway()
