from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app import schemas


@dataclass
class CatalogSearchResult:
    """Normalized catalog result consumed by the workflow orchestrator."""

    search_id: str
    status: Literal["offers_found", "alternatives_found", "no_results"]
    offers: list[schemas.Offer]
    alternatives: list[schemas.Alternative]
