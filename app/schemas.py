from datetime import datetime

from pydantic import BaseModel


class ItemCreate(BaseModel):
    name: str
    description: str | None = None


class Item(ItemCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
