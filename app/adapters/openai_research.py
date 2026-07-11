from __future__ import annotations

from typing import TYPE_CHECKING, NoReturn

from openai import OpenAI
from pydantic import BaseModel, ConfigDict

from app import schemas
from app.domain.catalog import CatalogSearchResult

if TYPE_CHECKING:
    from app.modules import MockCatalogModule


class OfferDraft(schemas.Offer):
    """Structured web-research result before it becomes a catalog offer."""


class OfferList(BaseModel):
    """Strict text-format response requested from the research model."""

    model_config = ConfigDict(extra="forbid")

    offers: list[OfferDraft]


RESEARCH_SYSTEM_PROMPT = """
You research purchasable products for a trustworthy Polish agent-commerce workflow.
Use web search to find current offers, then return only the requested structured data.

The requested product category is authoritative: every offer.category must exactly equal it.
Return no offers if you cannot substantiate a purchasable offer that is relevant to the request.
All prices are PLN and every money object must be {"amount": number, "currency": "PLN"}.
Set total.amount exactly to price.amount + taxesAndFees.amount.

Use stable, unique ids prefixed with "web_". Include merchantId, merchantName, title, brand, and
model when known. stockStatus must be exactly in_stock, low_stock, or out_of_stock.
delivery.earliest must be exactly today, tomorrow, or this_week; delivery.latest must use the
same vocabulary; delivery.label should explain the estimate. compatibility.macbook must be yes,
no, or unknown. Set delivery.meetsDeadline truthfully for the requested deadline.

Each offer needs returns {returnable, days, label}, warranty {months, label}, and rating
{value from 0 to 5, count}. If a detail is unknown, use conservative sane defaults and record
what is unknown in riskFlags rather than inventing evidence. Use demoBehavior "normal" or omit it.
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
        deterministic: MockCatalogModule | None = None,
    ):
        if not api_key and client is None:
            raise ValueError("OPENAI_API_KEY is required when CATALOG_PROVIDER=openai")
        if deterministic is None:
            raise ValueError("A deterministic catalog fallback is required")
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
                tools=[{"type": "web_search"}],
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
                    include_fixture_alternatives=False,
                )
            offers = [schemas.Offer.model_validate(offer.model_dump(by_alias=True)) for offer in output.offers]
            self._validate_offers(offers, constraints)
            return self.deterministic.evaluate_offers(
                constraints,
                offers,
                cache=True,
                include_fixture_alternatives=False,
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
    def _validate_offers(
        offers: list[schemas.Offer], constraints: schemas.ShoppingConstraints) -> None:
        if len({offer.id for offer in offers}) != len(offers):
            raise ValueError("OpenAI research returned duplicate offer ids")
        for offer in offers:
            if offer.category != constraints.product_category:
                raise ValueError("OpenAI research returned an offer from the wrong category")
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
