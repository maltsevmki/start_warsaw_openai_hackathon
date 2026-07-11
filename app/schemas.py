from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ItemCreate(BaseModel):
    name: str
    description: Optional[str] = None


class Item(ItemCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
