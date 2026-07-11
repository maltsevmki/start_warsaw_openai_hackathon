from __future__ import annotations

import json
import re

from openai import OpenAI
from pydantic import BaseModel, ConfigDict

from app import schemas


class ComparisonRationaleOutput(BaseModel):
    """The single sentence returned by the optional comparison narrator."""

    model_config = ConfigDict(extra="forbid")

    sentence: str


COMPARISON_INSTRUCTIONS = """
Write exactly one short, natural sentence explaining why the deterministic shopping comparison
selected the provided winner. Use only the supplied facts, do not change the winner, score,
rank, recommendation, price, delivery, or return terms, and do not imply that checkout has
already happened. Name the provided winner exactly. Do not use citations, markdown, semicolons,
or more than one sentence.
""".strip()


class OpenAIComparisonRationale:
    """Structured-output narrator for a deterministic comparison result."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-5-mini",
        timeout_seconds: float = 20,
        client: OpenAI | None = None,
    ):
        if not api_key and client is None:
            raise ValueError("OPENAI_API_KEY is required when COMPARISON_PROVIDER=openai")
        self.client = client or OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=1)
        self.model = model

    def explain(
        self,
        constraints: schemas.ShoppingConstraints,
        winner: schemas.RankedOffer,
    ) -> str:
        response = self.client.responses.parse(
            model=self.model,
            instructions=COMPARISON_INSTRUCTIONS,
            input=json.dumps(
                {
                    "requestedConstraints": constraints.model_dump(by_alias=True, mode="json"),
                    "deterministicWinner": winner.model_dump(by_alias=True, mode="json"),
                },
                separators=(",", ":"),
            ),
            text_format=ComparisonRationaleOutput,
        )
        output = response.output_parsed
        if output is None:
            raise ValueError("OpenAI comparison narrator returned no structured output")
        return self._one_sentence(output.sentence, winner.title)

    @staticmethod
    def _one_sentence(value: str, winner_title: str) -> str:
        sentence = " ".join(value.split())
        if not 12 <= len(sentence) <= 280:
            raise ValueError("OpenAI comparison narrator returned an invalid sentence length")
        if not sentence.endswith((".", "!", "?")):
            sentence += "."
        sentence_endings = re.findall(r"[.!?](?:\s|$)", sentence)
        if len(sentence_endings) != 1:
            raise ValueError("OpenAI comparison narrator returned more than one sentence")
        if winner_title not in sentence:
            raise ValueError("OpenAI comparison narrator did not identify the selected offer")
        return sentence
