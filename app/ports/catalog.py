from __future__ import annotations

from typing import Protocol

from app import schemas
from app.domain.catalog import CatalogSearchResult


class CatalogModule(Protocol):
    """Provider-neutral contract for product research."""

    def search(
        self, constraints: schemas.ShoppingConstraints, profile: schemas.DemoUserProfile
    ) -> CatalogSearchResult:
        ...
