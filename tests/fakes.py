from __future__ import annotations

from app import schemas
from app.domain.catalog import CatalogSearchResult
from app.modules import ProductCatalogModule


def _offer(
    offer_id: str,
    category: str,
    title: str,
    total: float,
    *,
    delivery: str = "tomorrow",
    macbook: str = "yes",
    return_days: int = 30,
    rating: float = 4.6,
    rating_count: int = 400,
    stock: str = "in_stock",
    demo_behavior: str | None = None,
) -> schemas.Offer:
    return schemas.Offer.model_validate(
        {
            "id": offer_id,
            "merchantId": f"merchant_{offer_id}",
            "merchantName": "Test Merchant",
            "title": title,
            "category": category,
            "brand": "Test Brand",
            "model": "Test Model",
            "price": {"amount": total, "currency": "PLN"},
            "taxesAndFees": {"amount": 0, "currency": "PLN"},
            "total": {"amount": total, "currency": "PLN"},
            "stockStatus": stock,
            "delivery": {
                "earliest": delivery,
                "latest": delivery,
                "label": f"Delivery {delivery}",
                "meetsDeadline": stock != "out_of_stock",
            },
            "compatibility": {"macbook": macbook, "notes": []},
            "returns": {
                "returnable": return_days > 0,
                "days": return_days,
                "label": f"{return_days}-day returns",
            },
            "warranty": {"months": 24, "label": "24-month warranty"},
            "rating": {"value": rating, "count": rating_count},
            "riskFlags": [],
            "demoBehavior": demo_behavior,
        }
    )


def test_offers() -> list[schemas.Offer]:
    """Small test-only inventory; no application runtime reads these records."""

    return [
        _offer(
            "offer_monitor_happy",
            "monitor",
            "Dell S2722QC 27-inch 4K USB-C Monitor",
            929,
            rating=4.8,
            rating_count=684,
        ),
        _offer("offer_monitor_budget_miss", "monitor", "LG UltraFine 27UP850 27-inch 4K", 1199),
        _offer(
            "offer_monitor_delivery_miss",
            "monitor",
            "Samsung ViewFinity S7 27-inch 4K",
            849,
            delivery="this_week",
        ),
        _offer(
            "offer_monitor_weak_returns",
            "monitor",
            "Philips 278E1A 27-inch 4K",
            814,
            return_days=14,
        ),
        _offer(
            "offer_monitor_oos",
            "monitor",
            "AOC U27V4EA 27-inch 4K",
            739,
            stock="out_of_stock",
        ),
        _offer(
            "offer_headphones_tomorrow",
            "headphones",
            "Soundcore Q20i Noise Cancelling Headphones",
            189,
        ),
        _offer(
            "offer_headphones_today_over",
            "headphones",
            "JBL Tune 770NC Headphones",
            289,
            delivery="today",
        ),
        _offer("offer_headphones_premium", "headphones", "Sony WH-CH720N Headphones", 349),
        _offer("offer_shoes_42", "shoes", "New Balance 574 Black - size 42", 399, macbook="unknown"),
        _offer(
            "offer_shoes_42_alt",
            "shoes",
            "Adidas Runfalcon Black - size 42",
            299,
            macbook="unknown",
        ),
        _offer(
            "offer_shoes_other_size",
            "shoes",
            "Nike Revolution Grey - size 41",
            319,
            macbook="unknown",
            return_days=14,
        ),
        _offer(
            "offer_hub_failure",
            "usb_c_hub",
            "Baseus 6-in-1 USB-C Hub",
            119,
            demo_behavior="out_of_stock_at_checkout",
        ),
        _offer("offer_hub_normal", "usb_c_hub", "Anker 555 8-in-1 USB-C Hub", 279),
    ]


class TestCatalog(ProductCatalogModule):
    """In-memory catalog used only by the automated test suite."""

    __test__ = False

    def __init__(self):
        super().__init__()
        self.offers = test_offers()
        self.by_id = {offer.id: offer for offer in self.offers}

    def search(
        self, constraints: schemas.ShoppingConstraints, profile: schemas.DemoUserProfile
    ) -> CatalogSearchResult:
        candidates = [
            self._for_deadline(offer, constraints.delivery_deadline)
            for offer in self.offers
            if offer.category == constraints.product_category
        ]
        return self.evaluate_offers(constraints, candidates)
