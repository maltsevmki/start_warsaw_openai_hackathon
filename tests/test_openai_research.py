from types import SimpleNamespace

import pytest

from app import schemas
from app.adapters.openai_research import OfferDraft, OfferList, OpenAIResearchAgent
from app.modules import DemoProfileModule, DomainError, IntentGuardrailModule, ProductCatalogModule
from app.settings import Settings


class FakeResponses:
    def __init__(self, output: OfferList):
        self.output = output
        self.calls: list[dict] = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        source_urls = {
            offer.product_url for offer in self.output.offers if offer.product_url is not None
        }
        return SimpleNamespace(
            output_parsed=self.output,
            output=[
                {
                    "type": "web_search_call",
                    "action": {
                        "sources": [
                            {"type": "url", "url": url, "title": "Web Store product page"}
                            for url in source_urls
                        ]
                    },
                }
            ],
        )


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
    product_url = f"https://shop.example.com/products/{offer_id}"
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
            "productUrl": product_url,
            "evidenceSources": [
                {"url": product_url, "title": "Web Store product page"}
            ],
            "riskFlags": [],
        }
    )


def test_openai_research_returns_schema_valid_offers_and_caches_them():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find me a monitor under 1000 PLN for my MacBook by tomorrow.", [], profile
    ).constraints
    catalog = ProductCatalogModule()
    client = FakeOpenAI(OfferList(offers=[_offer(
        offer_id="web_monitor_1", category="monitor", delivery_earliest="tomorrow", price=899
    )]))
    agent = OpenAIResearchAgent(api_key="", client=client, deterministic=catalog)

    result = agent.search(constraints, profile)

    assert result.status == "offers_found"
    assert result.offers[0].id == "web_monitor_1"
    assert catalog.get_offer("web_monitor_1") is not None
    assert client.responses.calls[0]["text_format"] is OfferList
    request = client.responses.calls[0]
    assert request["tools"][0]["type"] == "web_search"
    assert request["tools"][0]["external_web_access"] is True
    assert request["tool_choice"] == "required"
    assert request["include"] == ["web_search_call.action.sources"]


def test_openai_research_builds_alternatives_only_from_researched_offers():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find noise cancelling headphones under 200 PLN that arrive today.", [], profile
    ).constraints
    catalog = ProductCatalogModule()
    client = FakeOpenAI(OfferList(offers=[_offer(
        offer_id="web_headphones_1", category="headphones", delivery_earliest="tomorrow", price=189
    )]))
    agent = OpenAIResearchAgent(api_key="", client=client, deterministic=catalog)

    result = agent.search(constraints, profile)

    assert result.status == "alternatives_found"
    assert [alternative.id for alternative in result.alternatives] == [
        "alt_delivery_tomorrow"
    ]


def test_openai_research_rejects_product_urls_not_grounded_in_tool_sources():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find me a monitor under 1000 PLN for my MacBook by tomorrow.", [], profile
    ).constraints
    catalog = ProductCatalogModule()
    draft = _offer(
        offer_id="web_monitor_1", category="monitor", delivery_earliest="tomorrow", price=899
    )
    client = FakeOpenAI(OfferList(offers=[draft]))
    client.responses.parse = lambda **kwargs: SimpleNamespace(
        output_parsed=OfferList(offers=[draft]), output=[]
    )
    agent = OpenAIResearchAgent(api_key="", client=client, deterministic=catalog)

    with pytest.raises(DomainError) as error:
        agent.search(constraints, profile)

    assert error.value.status_code == 503


def test_openai_research_failure_returns_a_user_visible_error():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find me a monitor under 1000 PLN for my MacBook by tomorrow.", [], profile
    ).constraints
    catalog = ProductCatalogModule()
    agent = OpenAIResearchAgent(api_key="", client=FailingOpenAI(), deterministic=catalog)

    with pytest.raises(DomainError) as error:
        agent.search(constraints, profile)

    assert error.value.status_code == 503
    assert error.value.message == "Live product research is temporarily unavailable. Please try again."


def test_live_mode_without_an_api_key_is_reported_as_unavailable():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find me a monitor under 1000 PLN for my MacBook by tomorrow.", [], profile
    ).constraints
    settings = Settings(
        intent_provider="mock",
        openai_api_key=None,
        openai_intent_model="gpt-5-mini",
        openai_timeout_seconds=20,
        openai_fallback_to_mock=True,
        catalog_provider="openai",
    )
    catalog = ProductCatalogModule(settings=settings)

    assert catalog.offers == []
    with pytest.raises(DomainError, match="not configured") as error:
        catalog.search(constraints, profile)
    assert error.value.status_code == 503


def test_catalog_without_a_live_provider_never_serves_canned_offers():
    profile = DemoProfileModule().get_profile()
    constraints = IntentGuardrailModule().classify(
        "Find me a monitor under 1000 PLN for my MacBook by tomorrow.", [], profile
    ).constraints

    with pytest.raises(DomainError, match="not configured") as error:
        ProductCatalogModule().search(constraints, profile)

    assert error.value.status_code == 503
