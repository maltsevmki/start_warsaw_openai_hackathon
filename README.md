# start_warsaw_openai_hackathon

Minimal FastAPI backend with a SQLite database (via SQLAlchemy).

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload
```

- API: http://127.0.0.1:8000
- Interactive docs (Swagger): http://127.0.0.1:8000/docs

## Endpoints

| Method | Path      | Description                     |
|--------|-----------|---------------------------------|
| GET    | `/`       | Service status                  |
| GET    | `/health` | Health check                    |
| POST   | `/items`  | Create an item                  |
| GET    | `/items`  | List items                      |

## Structure

```
app/
  database.py   # SQLite engine + session (SQLAlchemy)
  models.py     # ORM models
  schemas.py    # Pydantic request/response models
  main.py       # FastAPI app + routes
```

The SQLite file `app.db` is created automatically on first run.
