from types import SimpleNamespace

import pytest

from app.adapters.openai_intent import IntentAgentOutput, OpenAIIntentAgent
from app.modules import DemoProfileModule
from app.settings import Settings
from app.factories import build_intent_module


HAPPY_PROMPT = "Find me a monitor under 1000 PLN for my MacBook by tomorrow."


class FakeResponses:
    def __init__(self, output=None, error=None):
        self.output = output
        self.error = error
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(output_parsed=self.output)


class FakeOpenAI:
    def __init__(self, output=None, error=None):
        self.responses = FakeResponses(output=output, error=error)


def valid_monitor_output():
    return IntentAgentOutput(
        status="valid_request",
        product_category="monitor",
        budget_max_amount=1000,
        delivery_deadline="tomorrow",
        compatibility=["MacBook"],
        must_have=[],
        nice_to_have=[],
        required_return_days=None,
        forbidden=[],
        missing_fields=[],
        question_text=None,
        expected_field=None,
        examples=[],
        policy_code=None,
        policy_message=None,
        can_suggest_safer_alternative=False,
        confidence=0.96,
        extracted_summary="Looking for a MacBook-compatible monitor under 1000 PLN by tomorrow.",
    )


def test_openai_intent_agent_uses_structured_output():
    client = FakeOpenAI(output=valid_monitor_output())
    agent = OpenAIIntentAgent(api_key="", client=client)

    result = agent.classify(HAPPY_PROMPT, [], DemoProfileModule().get_profile())

    assert result.status == "valid_request"
    assert result.constraints.product_category == "monitor"
    assert result.constraints.budget_max.amount == 1000
    assert client.responses.calls[0]["text_format"] is IntentAgentOutput


def test_deterministic_guardrail_runs_before_openai():
    client = FakeOpenAI(output=valid_monitor_output())
    agent = OpenAIIntentAgent(api_key="", client=client)

    result = agent.classify(
        "Buy prescription medicine without asking me.",
        [],
        DemoProfileModule().get_profile(),
    )

    assert result.status == "policy_violation"
    assert client.responses.calls == []


def test_openai_failure_falls_back_to_offline_intent():
    client = FakeOpenAI(error=ValueError("invalid structured result"))
    agent = OpenAIIntentAgent(api_key="", client=client, fallback_to_mock=True)

    result = agent.classify(HAPPY_PROMPT, [], DemoProfileModule().get_profile())

    assert result.status == "valid_request"
    assert result.constraints.product_category == "monitor"


def test_factory_requires_key_for_openai_provider():
    settings = Settings(
        intent_provider="openai",
        openai_api_key=None,
        openai_intent_model="gpt-5-mini",
        openai_timeout_seconds=20,
        openai_fallback_to_mock=True,
    )
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        build_intent_module(settings)
