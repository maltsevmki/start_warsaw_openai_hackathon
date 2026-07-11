from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app import schemas


@dataclass
class ClassificationResult:
    status: Literal["valid_request", "need_clarification", "policy_violation"]
    constraints: schemas.ShoppingConstraints | None = None
    summary: str | None = None
    confidence: float = 0.95
    question: schemas.ClarificationQuestion | None = None
    block: schemas.PolicyBlock | None = None
    source: Literal["deterministic", "openai", "fallback"] = "deterministic"
