from __future__ import annotations

from typing import Protocol

from app import schemas


class ComparisonRationaleModule(Protocol):
    """Optional natural-language explanation for a deterministic winner."""

    def explain(
        self,
        constraints: schemas.ShoppingConstraints,
        winner: schemas.RankedOffer,
    ) -> str:
        ...
