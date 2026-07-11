from __future__ import annotations

from dataclasses import dataclass

from app import schemas


@dataclass
class CatalogSearchResult:
    """Normalized catalog result consumed by the workflow orchestrator."""

    search_id: str
    status: str
    offers: list[schemas.Offer]
    alternatives: list[schemas.Alternative]
