from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import Base, engine, get_db

# Create the SQLite tables on startup (fine for a hackathon; swap for
# Alembic migrations if this grows into something real).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="start_warsaw_openai_hackathon")


@app.get("/")
def root():
    return {"status": "ok", "service": "start_warsaw_openai_hackathon"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/items", response_model=schemas.Item)
def create_item(item: schemas.ItemCreate, db: Session = Depends(get_db)):
    db_item = models.Item(name=item.name, description=item.description)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get("/items", response_model=list[schemas.Item])
def list_items(db: Session = Depends(get_db)):
    return db.query(models.Item).order_by(models.Item.id).all()
