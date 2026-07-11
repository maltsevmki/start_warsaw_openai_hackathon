from types import SimpleNamespace

import pytest

from app.adapters.openai_intent import IntentAgentOutput, OpenAIIntentAgent, SourcedConstraint
from app.modules import DemoProfileModule
from app.settings import Settings
from app.factories import build_intent_module


HAPPY_PROMPT = "Find me a monitor under 1000 PLN for my MacBook by tomorrow."


def sourced(value: str, evidence: str) -> SourcedConstraint:
    return SourcedConstraint(value=value, evidence=evidence)


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
        product_category_evidence="monitor",
        budget_max_amount=1000,
        budget_max_evidence="1000 PLN",
        delivery_deadline="tomorrow",
        delivery_deadline_evidence="tomorrow",
        compatibility=[sourced("MacBook", "MacBook")],
        must_have=[],
        nice_to_have=[],
        required_return_days=None,
        required_return_days_evidence=None,
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


def shoe_clarification_output():
    return IntentAgentOutput(
        status="need_clarification",
        product_category="shoes",
        product_category_evidence="shoes",
        budget_max_amount=None,
        budget_max_evidence=None,
        delivery_deadline="tomorrow",
        delivery_deadline_evidence="tomorrow",
        compatibility=[],
        must_have=[],
        nice_to_have=[],
        required_return_days=None,
        required_return_days_evidence=None,
        forbidden=[],
        missing_fields=["shoe_size"],
        question_text="What EU shoe size should I search for?",
        expected_field="size",
        examples=["Size 42, black"],
        policy_code=None,
        policy_message=None,
        can_suggest_safer_alternative=False,
        confidence=0.94,
        extracted_summary=None,
    )


def test_openai_intent_agent_uses_structured_output():
    client = FakeOpenAI(output=valid_monitor_output())
    agent = OpenAIIntentAgent(api_key="", client=client)

    result = agent.classify(HAPPY_PROMPT, [], DemoProfileModule().get_profile())

    assert result.status == "valid_request"
    assert result.constraints.product_category == "monitor"
    assert result.constraints.budget_max.amount == 1000
    assert client.responses.calls[0]["text_format"] is IntentAgentOutput


def test_openai_intent_discards_profile_leakage_and_ungrounded_requirements():
    output = IntentAgentOutput(
        status="valid_request",
        product_category="MacBook",
        product_category_evidence="MacBook",
        budget_max_amount=200,
        budget_max_evidence="200 PLN",
        delivery_deadline="tomorrow",
        delivery_deadline_evidence="tomorrow",
        compatibility=[
            sourced("MacBook", "MacBook"),
            sourced("USB-C", "USB-C"),
            sourced("external displays via USB-C or HDMI", "USB-C or HDMI"),
        ],
        must_have=[
            sourced("M4 chip", "M4"),
            sourced("USB-C port", "USB-C"),
        ],
        nice_to_have=[],
        required_return_days=None,
        required_return_days_evidence=None,
        forbidden=[],
        missing_fields=[],
        question_text=None,
        expected_field=None,
        examples=[],
        policy_code=None,
        policy_message=None,
        can_suggest_safer_alternative=False,
        confidence=0.9,
        extracted_summary="Looking for an M4 MacBook under 200 PLN by tomorrow.",
    )
    client = FakeOpenAI(output=output)
    agent = OpenAIIntentAgent(api_key="", client=client)

    result = agent.classify(
        "I want to buy a MacBook under 200 PLN, shipped tomorrow.",
        ["It has to be on M4."],
        DemoProfileModule().get_profile(),
    )

    assert result.constraints.budget_max.amount == 200
    assert result.constraints.delivery_deadline == "tomorrow"
    assert result.constraints.must_have == ["M4 chip"]
    assert result.constraints.compatibility == ["MacBook"]
    assert "USB-C port" not in result.constraints.must_have
    request_input = client.responses.calls[0]["input"]
    assert "Known user/device facts" not in request_input
    assert "Prefers external displays with USB-C or HDMI" not in request_input


def test_openai_intent_keeps_explicit_usb_c_and_macbook_compatibility():
    output = IntentAgentOutput(
        status="valid_request",
        product_category="monitor",
        product_category_evidence="monitor",
        budget_max_amount=None,
        budget_max_evidence=None,
        delivery_deadline=None,
        delivery_deadline_evidence=None,
        compatibility=[
            sourced("USB-C", "USB-C"),
            sourced("MacBook", "MacBook"),
        ],
        must_have=[sourced("USB-C", "USB-C")],
        nice_to_have=[],
        required_return_days=None,
        required_return_days_evidence=None,
        forbidden=[],
        missing_fields=[],
        question_text=None,
        expected_field=None,
        examples=[],
        policy_code=None,
        policy_message=None,
        can_suggest_safer_alternative=False,
        confidence=0.95,
        extracted_summary="Looking for a USB-C monitor for a MacBook.",
    )
    client = FakeOpenAI(output=output)
    agent = OpenAIIntentAgent(api_key="", client=client)

    result = agent.classify(
        "Find a USB-C monitor for my MacBook.",
        [],
        DemoProfileModule().get_profile(),
    )

    assert result.constraints.compatibility == ["USB-C", "MacBook"]
    assert result.constraints.must_have == ["USB-C"]


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


def test_safe_incomplete_request_uses_openai_and_returns_question_form():
    client = FakeOpenAI(output=shoe_clarification_output())
    agent = OpenAIIntentAgent(api_key="", client=client)

    result = agent.classify(
        "Buy me shoes for tomorrow.",
        [],
        DemoProfileModule().get_profile(),
    )

    assert len(client.responses.calls) == 1
    assert result.status == "need_clarification"
    assert result.source == "openai"
    assert [field.name for field in result.question.fields] == [
        "shoe_size",
        "color",
        "intended_use",
    ]
    assert result.question.fields[0].input_type == "number"


def test_openai_failure_falls_back_to_offline_intent():
    client = FakeOpenAI(error=ValueError("invalid structured result"))
    agent = OpenAIIntentAgent(api_key="", client=client, fallback_to_mock=True)

    result = agent.classify(HAPPY_PROMPT, [], DemoProfileModule().get_profile())

    assert result.status == "valid_request"
    assert result.source == "fallback"
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
