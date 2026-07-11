from __future__ import annotations

import re
from typing import Literal

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ConfigDict

from app import schemas
from app.domain.intent import ClassificationResult
from app.modules import DomainError, IntentGuardrailModule, new_id


class IntentAgentOutput(BaseModel):
    """Strict structured output returned by the OpenAI intent agent."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["valid_request", "need_clarification", "policy_violation"]
    product_category: str | None
    budget_max_amount: float | None
    delivery_deadline: Literal["today", "tomorrow", "this_week"] | None
    compatibility: list[str]
    must_have: list[str]
    nice_to_have: list[str]
    required_return_days: int | None
    forbidden: list[str]
    missing_fields: list[str]
    question_text: str | None
    expected_field: str | None
    examples: list[str]
    policy_code: Literal[
        "restricted_product",
        "requires_professional_verification",
        "unsafe_or_illegal",
        "unsupported_request",
    ] | None
    policy_message: str | None
    can_suggest_safer_alternative: bool
    confidence: float
    extracted_summary: str | None


AGENT_INSTRUCTIONS = """
You extract shopping intent for a trustworthy commerce workflow serving a user in Poland.
Return only the requested structured output.

Rules:
- Currency is PLN. Extract an explicit maximum budget, never invent one.
- Delivery deadline is exactly today, tomorrow, this_week, or null.
- Normalize clear categories to monitor, headphones, shoes, clothing, or usb_c_hub when applicable.
- Include product requirements in must_have and preferences in nice_to_have.
- Treat MacBook, port, size, color, returns, and compatibility details as constraints when present.
- Ask one concise clarification when a required fact is missing. Shoes and clothing need a size.
- Vague requests need a product category and usually a budget.
- Mark illegal, unsafe, restricted, or professionally controlled purchases as policy_violation.
- Never claim that checkout is authorized. Explicit approval is always handled later by the application.
- Confidence must be between 0 and 1.
""".strip()


class OpenAIIntentAgent:
    """Model-backed intent adapter with deterministic safety and offline fallback."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-5-mini",
        timeout_seconds: float = 20,
        fallback_to_mock: bool = True,
        client: OpenAI | None = None,
        deterministic: IntentGuardrailModule | None = None,
    ):
        if not api_key and client is None:
            raise ValueError("OPENAI_API_KEY is required when INTENT_PROVIDER=openai")
        self.model = model
        self.fallback_to_mock = fallback_to_mock
        self.client = client or OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=2)
        self.deterministic = deterministic or IntentGuardrailModule()

    def classify(
        self,
        prompt: str,
        prior_messages: list[str],
        profile: schemas.DemoUserProfile,
    ) -> ClassificationResult:
        # These checks are application policy, not model judgment. They remain
        # deterministic even when the live provider is enabled.
        deterministic_result = self.deterministic.classify(prompt, prior_messages, profile)
        if deterministic_result.status in {"policy_violation", "need_clarification"}:
            return deterministic_result

        combined = "\n".join([f"Original request: {prompt}", *[f"User reply: {m}" for m in prior_messages]])
        profile_context = ", ".join(profile.device_facts)
        input_text = f"{combined}\nKnown user/device facts: {profile_context}"
        try:
            response = self.client.responses.parse(
                model=self.model,
                instructions=AGENT_INSTRUCTIONS,
                input=input_text,
                text_format=IntentAgentOutput,
            )
            output = response.output_parsed
            if output is None:
                raise ValueError("OpenAI intent agent returned no structured output")
            return self._to_result(
                output,
                " ".join([prompt, *prior_messages]).strip(),
                profile,
            )
        except (OpenAIError, ValueError, TypeError) as exc:
            if self.fallback_to_mock:
                return deterministic_result
            raise DomainError("Intent service is temporarily unavailable", 503) from exc

    def _to_result(
        self,
        output: IntentAgentOutput,
        combined_query: str,
        profile: schemas.DemoUserProfile,
    ) -> ClassificationResult:
        confidence = max(0.0, min(1.0, output.confidence))
        if output.status == "policy_violation":
            return ClassificationResult(
                status="policy_violation",
                confidence=confidence,
                block=schemas.PolicyBlock(
                    code=output.policy_code or "unsupported_request",
                    message=output.policy_message or "This request cannot be completed safely.",
                    canSuggestSaferAlternative=output.can_suggest_safer_alternative,
                ),
            )

        constraints = schemas.ShoppingConstraints(
            productCategory=output.product_category,
            query=combined_query,
            budgetMax=(
                schemas.Money(amount=output.budget_max_amount)
                if output.budget_max_amount is not None
                else None
            ),
            deliveryDeadline=output.delivery_deadline,
            compatibility=output.compatibility,
            mustHave=output.must_have,
            niceToHave=output.nice_to_have,
            requiredReturnDays=output.required_return_days,
            forbidden=output.forbidden,
        )
        if output.status == "need_clarification" or not output.product_category:
            expected_field = output.expected_field or (
                output.missing_fields[0] if output.missing_fields else "product_category"
            )
            return ClassificationResult(
                status="need_clarification",
                constraints=constraints,
                confidence=confidence,
                question=schemas.ClarificationQuestion(
                    id=new_id("clar"),
                    text=output.question_text or "What additional detail should I use for this search?",
                    expectedField=expected_field,
                    examples=output.examples,
                ),
            )

        # Enforce the size invariant even if a future prompt/model regression
        # incorrectly marks the request as valid.
        if output.product_category == "shoes" and not re.search(
            r"\b(?:size\s*)?(3[5-9]|4[0-9]|5[0-2])\b", combined_query.lower()
        ):
            return self.deterministic.classify(combined_query, [], profile)
        return ClassificationResult(
            status="valid_request",
            constraints=constraints,
            summary=output.extracted_summary or f"Looking for {output.product_category.replace('_', ' ')}.",
            confidence=confidence,
        )
