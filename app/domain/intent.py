from __future__ import annotations

from dataclasses import dataclass

from app import schemas


@dataclass
class ClassificationResult:
    status: str
    constraints: schemas.ShoppingConstraints | None = None
    summary: str | None = None
    confidence: float = 0.95
    question: schemas.ClarificationQuestion | None = None
    block: schemas.PolicyBlock | None = None
