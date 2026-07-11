from types import SimpleNamespace

from app import schemas
from app.adapters.openai_research import OfferDraft, OfferList, OpenAIResearchAgent
from app.modules import DemoProfileModule, IntentGuardrailModule, MockCatalogModule


class FakeResponses:
    def __init__(self, output: OfferList):
        self.output = output
        self.calls: list[dict] = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_parsed=self.output)


class FakeOpenAI:
    def __init__(self, output: OfferList):
        self.responses = FakeResponses(output)


class FailingOpenAI:
    class Responses:
        def parse(self, **kwargs):
            raise RuntimeError("web search is unavailable")

    def __init__(self):
        self.responses = self.Responses()


def _offer(
    *,
    offer_id: str,
    category: str,
    delivery_earliest: str,
    price: float,
) -> OfferDraft:
    return OfferDraft.model_validate(
        {
            "id": offer_id,
            "merchantId": "merchant_web",
            "merchantName": "Web Store",
            "title": "Web-researched product",
            "category": category,
            "brand": "Example",
            "model": "Research 1",
            "price": {"amount": price, "currency": "PLN"},
            "taxesAndFees": {"amount": 0, "currency": "PLN"},
            "total": {"amount": price, "currency": "PLN"},
            "stockStatus": "in_stock",
            "delivery": {
                "earliest": delivery_earliest,
                "latest": delivery_earliest,
                "label": f"Arrives {delivery_earliest}",
                "meetsDeadline": True,
            },
            "compatibility": {"macbook": "yes", "notes": ["USB-C confirmed"]},
            "returns": {"returnable": True, "days": 30, "label": "30-day returns"},
            "warranty": {"months": 24, "label": "24-month warranty"},
            "rating": {"value": 4.6, "count": 120},
            "riskFlags": [],
            "demoBehavior": "normal",
        }
    )


def test_openai_research_returns_schema_valid_offers_and_caches_them():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find me a monitor under 1000 PLN for my MacBook by tomorrow.", [], profile
    ).constraints
    catalog = MockCatalogModule()
    client = FakeOpenAI(OfferList(offers=[_offer(
        offer_id="web_monitor_1", category="monitor", delivery_earliest="tomorrow", price=899
    )]))
    agent = OpenAIResearchAgent(api_key="", client=client, deterministic=catalog)

    result = agent.search(constraints, profile)

    assert result.status == "offers_found"
    assert result.offers[0].id == "web_monitor_1"
    assert catalog.get_offer("web_monitor_1") is not None
    assert client.responses.calls[0]["text_format"] is OfferList
    assert client.responses.calls[0]["tools"] == [{"type": "web_search"}]


def test_openai_research_keeps_transparent_alternatives_for_canned_offers():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find noise cancelling headphones under 200 PLN that arrive today.", [], profile
    ).constraints
    catalog = MockCatalogModule()
    client = FakeOpenAI(OfferList(offers=[_offer(
        offer_id="web_headphones_1", category="headphones", delivery_earliest="tomorrow", price=189
    )]))
    agent = OpenAIResearchAgent(api_key="", client=client, deterministic=catalog)

    result = agent.search(constraints, profile)

    assert result.status == "alternatives_found"
    assert {alternative.id for alternative in result.alternatives} == {
        "alt_delivery_tomorrow",
        "alt_budget_300",
    }


def test_openai_research_failure_uses_fixture_catalog():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find me a monitor under 1000 PLN for my MacBook by tomorrow.", [], profile
    ).constraints
    catalog = MockCatalogModule()
    agent = OpenAIResearchAgent(api_key="", client=FailingOpenAI(), deterministic=catalog)

    result = agent.search(constraints, profile)

    assert result.status == "offers_found"
    assert any(offer.id == "offer_monitor_happy" for offer in result.offers)
