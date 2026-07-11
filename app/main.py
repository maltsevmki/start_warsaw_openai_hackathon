from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import Base, engine, get_db
from app.modules import DomainError
from app.orchestrator import WorkflowOrchestrator


Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Agent Commerce Mock API",
    version="0.2.0",
    description="A complete, deterministic mock of the agent-commerce workflow for the Warsaw OpenAI hackathon demo.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = WorkflowOrchestrator()


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "agent-commerce-mock-api",
        "docs": "/docs",
        "health": "/health",
        "scenarios": "/api/demo/scenarios",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "mode": "hybrid_capable",
        "intentProvider": type(orchestrator.intent).__name__,
        "catalogOffers": len(orchestrator.catalog.offers),
    }


@app.get("/api/demo/scenarios")
def demo_scenarios():
    return {
        "happyPath": "Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident.",
        "clarification": "Buy me shoes for tomorrow.",
        "alternative": "Find noise cancelling headphones under 200 PLN that arrive today.",
        "guardrail": "Buy prescription medicine without asking me.",
        "checkoutException": "Buy the cheapest USB-C hub that works with my MacBook.",
    }


@app.post("/api/demo/reset", status_code=204)
def reset_demo():
    orchestrator.reset()


@app.post(
    "/api/workflows",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
    status_code=201,
)
def start_workflow(body: schemas.StartWorkflowRequest):
    return orchestrator.start_workflow(body.prompt)


@app.get(
    "/api/workflows/{workflow_id}",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def get_workflow(workflow_id: str):
    return orchestrator.get_workflow(workflow_id)


@app.post(
    "/api/workflows/{workflow_id}/messages",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def add_message(workflow_id: str, body: schemas.AddMessageRequest):
    return orchestrator.add_user_message(
        workflow_id,
        message=body.message,
        question_id=body.question_id,
        answers=body.answers,
    )


@app.post(
    "/api/workflows/{workflow_id}/accept-alternative",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def accept_alternative(workflow_id: str, body: schemas.AcceptAlternativeRequest):
    return orchestrator.accept_alternative(workflow_id, body.accepted, body.alternative_id)


@app.post(
    "/api/workflows/{workflow_id}/approve",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def approve_proposal(workflow_id: str, body: schemas.ApproveProposalRequest):
    if not body.approved:
        return orchestrator.reject_proposal(workflow_id, body.proposal_id, "Approval declined")
    return orchestrator.approve_proposal(
        workflow_id,
        body.proposal_id,
        body.proposal_version,
        body.proposal_hash,
    )


@app.post(
    "/api/workflows/{workflow_id}/reject",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def reject_proposal(workflow_id: str, body: schemas.RejectProposalRequest):
    return orchestrator.reject_proposal(workflow_id, body.proposal_id, body.reason)


@app.post(
    "/api/workflows/{workflow_id}/select-offer",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def select_offer(workflow_id: str, body: schemas.SelectOfferRequest):
    return orchestrator.select_offer(workflow_id, body.offer_id)


@app.post(
    "/api/workflows/{workflow_id}/checkout",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def execute_checkout(workflow_id: str, body: schemas.CheckoutRequest):
    return orchestrator.execute_checkout(workflow_id, body.approval_id)


@app.post(
    "/api/workflows/{workflow_id}/cancel",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def cancel_workflow(workflow_id: str):
    return orchestrator.cancel_workflow(workflow_id)


@app.post(
    "/api/workflows/{workflow_id}/rollback",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def rollback_workflow(workflow_id: str, body: schemas.RollbackWorkflowRequest):
    return orchestrator.rollback_workflow(workflow_id, body.revision_id)


@app.get("/api/workflows/{workflow_id}/events", response_model=schemas.EventsResponse)
def get_events(workflow_id: str):
    return schemas.EventsResponse(workflowId=workflow_id, events=orchestrator.get_events(workflow_id))


@app.post(
    "/api/orders/{order_id}/simulate-status",
    response_model=schemas.WorkflowView,
    response_model_exclude_none=True,
)
def simulate_status(order_id: str, body: schemas.SimulateStatusRequest):
    return orchestrator.simulate_order_status(order_id, body.status)


# Original starter endpoints remain available for teammates who already used them.
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
