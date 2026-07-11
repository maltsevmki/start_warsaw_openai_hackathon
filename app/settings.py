from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    intent_provider: str
    openai_api_key: str | None
    openai_intent_model: str
    openai_timeout_seconds: float
    openai_fallback_to_mock: bool

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            intent_provider=os.getenv("INTENT_PROVIDER", "mock").strip().lower(),
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            openai_intent_model=os.getenv("OPENAI_INTENT_MODEL", "gpt-5-mini"),
            openai_timeout_seconds=float(os.getenv("OPENAI_TIMEOUT_SECONDS", "20")),
            openai_fallback_to_mock=_as_bool(os.getenv("OPENAI_FALLBACK_TO_MOCK"), True),
        )
