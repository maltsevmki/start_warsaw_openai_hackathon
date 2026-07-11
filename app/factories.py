from __future__ import annotations

from app.adapters.openai_intent import OpenAIIntentAgent
from app.adapters.openai_comparison import OpenAIComparisonRationale
from app.adapters.openai_research import OpenAIResearchAgent
from app.modules import IntentGuardrailModule
from app.ports.catalog import CatalogModule
from app.ports.comparison import ComparisonRationaleModule
from app.ports.intent import IntentModule
from app.settings import Settings


def build_intent_module(settings: Settings | None = None) -> IntentModule:
    settings = settings or Settings.from_env()
    if settings.intent_provider == "mock":
        return IntentGuardrailModule()
    if settings.intent_provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when INTENT_PROVIDER=openai")
        return OpenAIIntentAgent(
            api_key=settings.openai_api_key,
            model=settings.openai_intent_model,
            timeout_seconds=settings.openai_timeout_seconds,
            fallback_to_mock=settings.openai_fallback_to_mock,
        )
    raise RuntimeError(
        f"Unknown INTENT_PROVIDER '{settings.intent_provider}'. Expected 'mock' or 'openai'."
    )


def build_catalog_research_module(
    settings: Settings, deterministic: CatalogModule
) -> CatalogModule | None:
    """Select an optional live research adapter while preserving fixture fallback."""

    if settings.catalog_provider == "mock":
        return None
    if settings.catalog_provider == "openai":
        # A missing key keeps the deterministic catalog active so enabling the
        # demo switch can never prevent startup or offline use.
        if not settings.openai_api_key:
            return None
        return OpenAIResearchAgent(
            api_key=settings.openai_api_key,
            model=settings.openai_research_model,
            timeout_seconds=settings.openai_timeout_seconds,
            deterministic=deterministic,
        )
    raise RuntimeError(
        f"Unknown CATALOG_PROVIDER '{settings.catalog_provider}'. Expected 'mock' or 'openai'."
    )


def build_comparison_rationale(
    settings: Settings | None = None,
) -> ComparisonRationaleModule | None:
    """Select an optional narrator without affecting deterministic comparison."""

    settings = settings or Settings.from_env()
    if settings.comparison_provider == "mock":
        return None
    if settings.comparison_provider == "openai":
        if not settings.openai_api_key:
            return None
        return OpenAIComparisonRationale(
            api_key=settings.openai_api_key,
            model=settings.openai_comparison_model,
            timeout_seconds=settings.openai_timeout_seconds,
        )
    raise RuntimeError(
        f"Unknown COMPARISON_PROVIDER '{settings.comparison_provider}'. Expected 'mock' or 'openai'."
    )
