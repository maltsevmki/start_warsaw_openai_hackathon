from types import SimpleNamespace

from app.adapters.openai_comparison import (
    ComparisonRationaleOutput,
    OpenAIComparisonRationale,
)
from app.modules import ComparisonModule, DemoProfileModule, IntentGuardrailModule
from tests.fakes import TestCatalog


PROMPT = "Find me a monitor under 1000 PLN for my MacBook by tomorrow."


class FakeResponses:
    def __init__(self, sentence: str):
        self.sentence = sentence
        self.calls: list[dict] = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_parsed=ComparisonRationaleOutput(sentence=self.sentence))


class FakeOpenAI:
    def __init__(self, sentence: str):
        self.responses = FakeResponses(sentence)


class FailingRationale:
    def explain(self, constraints, winner):
        raise RuntimeError("narration unavailable")


def _comparison_inputs():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(PROMPT, [], profile).constraints
    offers = TestCatalog().search(constraints, profile).offers
    return constraints, profile, offers


def test_comparison_uses_stubbed_llm_only_for_the_winner_explanation():
    constraints, profile, offers = _comparison_inputs()
    client = FakeOpenAI(
        "The Dell S2722QC 27-inch 4K USB-C Monitor is the best fit because it meets your MacBook, budget, and tomorrow-delivery requirements."
    )
    rationale = OpenAIComparisonRationale(api_key="", client=client)

    result = ComparisonModule(rationale=rationale).compare("wf_test", constraints, profile, offers)
    baseline = ComparisonModule(rationale=FailingRationale()).compare(
        "wf_test", constraints, profile, offers
    )

    assert result.best_offer_id == "offer_monitor_happy"
    assert result.summary == client.responses.sentence
    assert result.ranked_offers == baseline.ranked_offers
    assert client.responses.calls[0]["text_format"] is ComparisonRationaleOutput


def test_comparison_retains_templated_summary_when_narration_fails():
    constraints, profile, offers = _comparison_inputs()

    result = ComparisonModule(rationale=FailingRationale()).compare(
        "wf_test", constraints, profile, offers
    )

    assert result.summary == "Dell S2722QC 27-inch 4K USB-C Monitor is the strongest match with a score of 99.0/100."
