from __future__ import annotations

from app.adapters.openai_intent import OpenAIIntentAgent
from app.modules import IntentGuardrailModule
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
