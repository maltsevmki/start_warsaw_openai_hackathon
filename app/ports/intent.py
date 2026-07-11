from __future__ import annotations

from typing import Protocol

from app import schemas
from app.domain.intent import ClassificationResult


class IntentModule(Protocol):
    """Provider-neutral contract used by the workflow orchestrator."""

    def classify(
        self,
        prompt: str,
        prior_messages: list[str],
        profile: schemas.DemoUserProfile,
    ) -> ClassificationResult:
        ...
