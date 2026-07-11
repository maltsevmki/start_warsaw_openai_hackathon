from __future__ import annotations

from typing import TYPE_CHECKING, Any, NoReturn
from urllib.parse import urlsplit, urlunsplit

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app import schemas
from app.domain.catalog import CatalogSearchResult

if TYPE_CHECKING:
    from app.modules import ProductCatalogModule


class OfferDraft(schemas.Offer):
    """Structured web-research result before it becomes a catalog offer."""

    product_url: str = Field(alias="productUrl")
    evidence_sources: list[schemas.EvidenceSource] = Field(
        alias="evidenceSources", min_length=1, max_length=5
    )


class OfferList(BaseModel):
    """Strict text-format response requested from the research model."""

    model_config = ConfigDict(extra="forbid")

    offers: list[OfferDraft] = Field(max_length=8)


RESEARCH_SYSTEM_PROMPT = """
You research purchasable products for a trustworthy Polish agent-commerce workflow.
Use live web search to find current, real offers from merchants that sell in Poland, then return
only the requested structured data. Search before answering. Prefer direct merchant product pages
over category pages, snippets, reviews, or marketplaces with unclear sellers.

The requested product category is authoritative: every offer.category must exactly equal it.
Return no offers if you cannot substantiate a purchasable offer that is relevant to the request.
All prices are PLN and every money object must be {"amount": number, "currency": "PLN"}.
Set total.amount exactly to price.amount + taxesAndFees.amount.

Return at most eight offers. Use stable, unique ids prefixed with "web_". Include merchantId,
merchantName, title, brand, model when known, and productUrl pointing to the exact purchasable
merchant page. Return only in_stock or low_stock products; never return an unavailable listing.
Every offer must include evidenceSources with the exact product-page URL and title used to verify
its price and availability. Only cite pages actually opened by web search during this response.
delivery.earliest must be exactly today, tomorrow, or this_week; delivery.latest must use the
same vocabulary; delivery.label should explain the estimate. compatibility.macbook must be yes,
no, or unknown. Set delivery.meetsDeadline truthfully for the requested deadline.

Each offer needs returns {returnable, days, label}, warranty {months, label}, and rating
{value from 0 to 5, count}. If a detail is unknown, use conservative sane defaults and record
what is unknown in riskFlags rather than inventing evidence. Omit demoBehavior; it is test-only.
Do not claim checkout is complete, and do not return citations or prose outside the schema.
""".strip()


class OpenAIResearchAgent:
    """Web-search catalog adapter for live product research."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-5.4-mini",
        timeout_seconds: float = 90,
        client: OpenAI | None = None,
        deterministic: ProductCatalogModule | None = None,
    ):
        if not api_key and client is None:
            raise ValueError("OPENAI_API_KEY is required when CATALOG_PROVIDER=openai")
        if deterministic is None:
            raise ValueError("A catalog evaluator and offer cache are required")
        self.model = model
        # A web-search response can take longer than a plain model call. One
        # bounded attempt is clearer and faster than retrying an agentic search.
        self.client = client or OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=0)
        self.deterministic = deterministic

    def search(
        self, constraints: schemas.ShoppingConstraints, profile: schemas.DemoUserProfile
    ) -> CatalogSearchResult:
        try:
            response = self.client.responses.parse(
                model=self.model,
                tools=[
                    {
                        "type": "web_search",
                        "search_context_size": "medium",
                        "external_web_access": True,
                        "user_location": {
                            "type": "approximate",
                            "country": "PL",
                            "city": "Warsaw",
                            "region": "Mazowieckie",
                            "timezone": "Europe/Warsaw",
                        },
                    }
                ],
                tool_choice="required",
                include=["web_search_call.action.sources"],
                instructions=RESEARCH_SYSTEM_PROMPT,
                input=self._input_for(constraints, profile),
                text_format=OfferList,
            )
            output = response.output_parsed
            if output is None:
                raise ValueError("OpenAI research returned no structured offers")
            if not output.offers:
                return self.deterministic.evaluate_offers(
                    constraints,
                    [],
                    cache=True,
                )
            offers = [schemas.Offer.model_validate(offer.model_dump(by_alias=True)) for offer in output.offers]
            sources = self._extract_sources(response)
            offers = self._validated_offers(offers, constraints, sources)
            for offer in offers:
                offer.demo_behavior = None
            return self.deterministic.evaluate_offers(
                constraints,
                offers,
                cache=True,
            )
        except Exception as exc:
            _raise_research_unavailable(
                "Live product research is temporarily unavailable. Please try again.", exc
            )

    def _input_for(
        self, constraints: schemas.ShoppingConstraints, profile: schemas.DemoUserProfile
    ) -> str:
        return "\n".join(
            [
                f"Find purchasable products for: {constraints.query}",
                f"Required category: {constraints.product_category}",
                f"Maximum budget: {constraints.budget_max.amount if constraints.budget_max else 'not specified'} PLN",
                f"Delivery deadline: {constraints.delivery_deadline or 'not specified'}",
                f"Compatibility requirements: {', '.join(constraints.compatibility) or 'none'}",
                f"Must-have requirements: {', '.join(constraints.must_have) or 'none'}",
                f"Minimum return days: {constraints.required_return_days or 'not specified'}",
                f"Known user/device facts: {', '.join(profile.device_facts)}",
            ]
        )

    @staticmethod
    def _validated_offers(
        offers: list[schemas.Offer],
        constraints: schemas.ShoppingConstraints,
        consulted_sources: dict[str, schemas.EvidenceSource],
    ) -> list[schemas.Offer]:
        if not consulted_sources:
            raise ValueError("OpenAI research returned no verifiable web sources")
        if len({offer.id for offer in offers}) != len(offers):
            raise ValueError("OpenAI research returned duplicate offer ids")
        validated: list[schemas.Offer] = []
        for offer in offers:
            try:
                OpenAIResearchAgent._validate_offer(offer, constraints, consulted_sources)
            except ValueError:
                # Keep valid, verifiable offers rather than failing a whole search because
                # one model candidate was not grounded in the tool response.
                continue
            validated.append(offer)
        if not validated:
            raise ValueError("OpenAI research returned no offers grounded in consulted sources")
        return validated

    @staticmethod
    def _validate_offer(
        offer: schemas.Offer,
        constraints: schemas.ShoppingConstraints,
        consulted_sources: dict[str, schemas.EvidenceSource],
    ) -> None:
        try:
            if not offer.id.startswith("web_"):
                raise ValueError("OpenAI research returned an invalid offer id")
            if offer.category != constraints.product_category:
                raise ValueError("OpenAI research returned an offer from the wrong category")
            if offer.stock_status == "out_of_stock":
                raise ValueError("OpenAI research returned an unavailable offer")
            if offer.delivery.earliest not in {"today", "tomorrow", "this_week"}:
                raise ValueError("OpenAI research returned an invalid delivery estimate")
            if offer.delivery.latest not in {"today", "tomorrow", "this_week"}:
                raise ValueError("OpenAI research returned an invalid delivery estimate")
            if abs(offer.total.amount - (offer.price.amount + offer.taxes_and_fees.amount)) > 0.01:
                raise ValueError("OpenAI research returned an invalid total")
            if not 0 <= offer.rating.value <= 5 or offer.rating.count < 0:
                raise ValueError("OpenAI research returned an invalid rating")
            if offer.returns.days < 0 or offer.warranty.months < 0:
                raise ValueError("OpenAI research returned invalid terms")
            product_url = _normalized_url(offer.product_url)
            evidence_urls = {_normalized_url(source.url) for source in offer.evidence_sources}
            if not product_url or product_url not in evidence_urls:
                raise ValueError("OpenAI research returned an ungrounded product URL")
            if any(url not in consulted_sources for url in evidence_urls):
                raise ValueError("OpenAI research cited a source it did not consult")
        except (AttributeError, TypeError):
            raise ValueError("OpenAI research returned an invalid offer") from None

    @staticmethod
    def _extract_sources(response: Any) -> dict[str, schemas.EvidenceSource]:
        sources: dict[str, schemas.EvidenceSource] = {}
        for item in getattr(response, "output", []) or []:
            item_data = _mapping(item)
            if item_data.get("type") != "web_search_call":
                continue
            action = _mapping(item_data.get("action"))
            for raw_source in action.get("sources", []) or []:
                source = _mapping(raw_source)
                url = source.get("url")
                normalized = _normalized_url(url)
                if not normalized:
                    continue
                sources[normalized] = schemas.EvidenceSource(
                    url=str(url), title=str(source.get("title") or url)
                )
        return sources


class UnavailableCatalogResearch:
    """Returns a user-visible error when live research is selected but unavailable."""

    def __init__(self, message: str):
        self.message = message

    def search(
        self, constraints: schemas.ShoppingConstraints, profile: schemas.DemoUserProfile
    ) -> CatalogSearchResult:
        _raise_research_unavailable(self.message)


def _raise_research_unavailable(message: str, cause: Exception | None = None) -> NoReturn:
    # Importing at call time avoids a modules/adapters import cycle while using
    # the application's standard FastAPI error shape.
    from app.modules import DomainError

    error = DomainError(message, 503)
    if cause:
        raise error from cause
    raise error


def _mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    keys = ("type", "action", "sources", "url", "title")
    return {key: getattr(value, key) for key in keys if hasattr(value, key)}


def _normalized_url(value: str | None) -> str:
    if not value:
        return ""
    parsed = urlsplit(str(value).strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    path = parsed.path.rstrip("/") or "/"
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, "", ""))
