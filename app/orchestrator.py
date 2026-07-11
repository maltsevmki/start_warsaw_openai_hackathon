from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field

from app import schemas
from app.factories import build_intent_module
from app.modules import (
    ComparisonModule,
    ConsentAuditModule,
    DemoProfileModule,
    DomainError,
    IntentGuardrailModule,
    MockCatalogModule,
    MockCheckoutModule,
    MockTrackingModule,
    ProposalModule,
    new_id,
    utcnow,
)
from app.settings import Settings


@dataclass
class WorkflowRecord:
    workflow: schemas.WorkflowSummary
    messages: list[str] = field(default_factory=list)
    clarification: schemas.ClarificationQuestion | None = None
    guardrail: schemas.PolicyBlock | None = None
    constraints: schemas.ShoppingConstraints | None = None
    alternatives: list[schemas.Alternative] | None = None
    comparison: schemas.ComparisonResult | None = None
    proposal: schemas.CheckoutProposal | None = None
    approval: schemas.Approval | None = None
    checkout: schemas.CheckoutAttempt | None = None
    order: schemas.Order | None = None
    events: list[schemas.DomainEvent] = field(default_factory=list)
    revisions: list["WorkflowRevisionRecord"] = field(default_factory=list)
    current_revision_id: str | None = None


@dataclass
class WorkflowSnapshot:
    workflow: schemas.WorkflowSummary
    messages: list[str]
    clarification: schemas.ClarificationQuestion | None
    guardrail: schemas.PolicyBlock | None
    constraints: schemas.ShoppingConstraints | None
    alternatives: list[schemas.Alternative] | None
    comparison: schemas.ComparisonResult | None
    proposal: schemas.CheckoutProposal | None
    approval: schemas.Approval | None
    checkout: schemas.CheckoutAttempt | None
    order: schemas.Order | None


@dataclass
class WorkflowRevisionRecord:
    revision: schemas.WorkflowRevision
    snapshot: WorkflowSnapshot


class WorkflowOrchestrator:
    ACTIONS: dict[str, list[str]] = {
        "created": [],
        "needs_clarification": ["reply_to_clarification", "cancel"],
        "blocked_by_policy": [],
        "researching": [],
        "no_exact_match": ["cancel"],
        "awaiting_alternative_acceptance": ["accept_alternative", "reject_alternative", "cancel"],
        "comparing": [],
        "proposal_ready": [],
        "awaiting_approval": ["select_offer", "approve_proposal", "reject_proposal", "cancel"],
        "rejected": [],
        "checkout_in_progress": [],
        "checkout_failed": ["cancel"],
        "ordered": [],
        "tracking": ["simulate_tracking", "cancel"],
        "completed": [],
        "cancelled": [],
    }

    def __init__(self, intent=None, settings: Settings | None = None):
        self.profile = DemoProfileModule()
        self.intent = intent or (
            build_intent_module(settings) if settings is not None else IntentGuardrailModule()
        )
        self.catalog = MockCatalogModule(settings=settings)
        self.comparison = ComparisonModule(settings=settings)
        self.proposals = ProposalModule()
        self.consent = ConsentAuditModule()
        self.checkout = MockCheckoutModule(self.catalog)
        self.tracking = MockTrackingModule()
        self.records: dict[str, WorkflowRecord] = {}

    def start_workflow(self, prompt: str) -> schemas.WorkflowView:
        now = utcnow()
        workflow_id = new_id("wf")
        record = WorkflowRecord(
            workflow=schemas.WorkflowSummary(
                id=workflow_id,
                userId="demo_user",
                state="created",
                createdAt=now,
                updatedAt=now,
                prompt=prompt,
                summary="Request received.",
                availableActions=[],
            )
        )
        self.records[workflow_id] = record
        self._event(
            record,
            "workflow.state_changed",
            "system",
            "orchestrator",
            "Workflow created.",
            {"from": None, "to": "created"},
        )
        self._classify_and_continue(record)
        self._checkpoint(record, "workflow_started", "Request processed")
        return self._view(record)

    def get_workflow(self, workflow_id: str) -> schemas.WorkflowView:
        return self._view(self._record(workflow_id))

    def get_events(self, workflow_id: str) -> list[schemas.DomainEvent]:
        return [event.model_copy(deep=True) for event in self._record(workflow_id).events]

    def add_user_message(
        self,
        workflow_id: str,
        message: str | None = None,
        question_id: str | None = None,
        answers: list[schemas.ClarificationAnswer] | None = None,
    ) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        self._require_state(record, "needs_clarification")
        if not record.clarification:
            raise DomainError("Workflow has no active clarification question")
        if question_id and question_id != record.clarification.id:
            raise DomainError("Clarification question is stale; refresh the workflow before replying")
        answer_fields: list[str] = []
        if answers is not None:
            message, answer_fields = self._format_clarification_answers(record.clarification, answers)
        if not message or not message.strip():
            raise DomainError("Clarification answer cannot be empty", 422)
        message = message.strip()
        record.messages.append(message)
        self._event(
            record,
            "message.received",
            "user",
            "orchestrator",
            f"User replied: {message}",
            {
                "questionId": record.clarification.id,
                "answerFields": answer_fields,
            },
        )
        self._classify_and_continue(record)
        self._checkpoint(record, "clarification_answered", "Clarification answered")
        return self._view(record)

    def _format_clarification_answers(
        self,
        question: schemas.ClarificationQuestion,
        answers: list[schemas.ClarificationAnswer],
    ) -> tuple[str, list[str]]:
        fields = {field.name: field for field in question.fields}
        provided: dict[str, str] = {}
        for answer in answers:
            if answer.field in provided:
                raise DomainError(f"Duplicate clarification field: {answer.field}", 422)
            field = fields.get(answer.field)
            if not field:
                raise DomainError(f"Unknown clarification field: {answer.field}", 422)
            value = answer.value.strip()
            if not value:
                raise DomainError(f"Clarification field '{answer.field}' cannot be empty", 422)
            if field.input_type == "number":
                try:
                    float(value.replace(",", "."))
                except ValueError as exc:
                    raise DomainError(
                        f"Clarification field '{answer.field}' must be a number", 422
                    ) from exc
            if field.input_type == "single_select" and not field.allow_custom:
                if value not in field.options:
                    raise DomainError(
                        f"Clarification field '{answer.field}' must use one of its options", 422
                    )
            provided[answer.field] = value

        missing = [field.name for field in question.fields if field.required and field.name not in provided]
        if missing:
            raise DomainError(f"Missing required clarification fields: {', '.join(missing)}", 422)

        rendered = ", ".join(
            f"{fields[name].label}: {value}" for name, value in provided.items()
        )
        return rendered, list(provided)

    def accept_alternative(
        self, workflow_id: str, accepted: bool, alternative_id: str | None
    ) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        self._require_state(record, "awaiting_alternative_acceptance")
        if not accepted:
            self._event(
                record,
                "alternative.rejected",
                "user",
                "catalog",
                "User rejected the suggested alternatives.",
                {},
            )
            self._transition(record, "cancelled", "Workflow cancelled after alternatives were rejected.")
            self._checkpoint(record, "alternative_rejected", "Alternative rejected")
            return self._view(record)
        if not alternative_id:
            raise DomainError("alternativeId is required when accepted is true", 422)
        alternative = next(
            (item for item in record.alternatives or [] if item.id == alternative_id), None
        )
        if not alternative:
            raise DomainError("Alternative does not belong to this workflow", 404)
        record.constraints = alternative.adjusted_constraints.model_copy(deep=True)
        self._event(
            record,
            "alternative.accepted",
            "user",
            "catalog",
            f"User accepted alternative: {alternative.message}",
            {"alternativeId": alternative.id},
        )
        self._research_and_continue(record)
        self._checkpoint(record, "alternative_accepted", "Alternative accepted")
        return self._view(record)

    def approve_proposal(
        self,
        workflow_id: str,
        proposal_id: str,
        proposal_version: int,
        proposal_hash: str,
    ) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        self._require_state(record, "awaiting_approval")
        if not record.proposal:
            raise DomainError("Workflow has no current proposal")
        approval = self.consent.approve(
            workflow_id,
            record.proposal,
            proposal_id,
            proposal_version,
            proposal_hash,
        )
        record.approval = approval
        record.proposal.status = "approved"
        self._event(
            record,
            "approval.granted",
            "user",
            "consent",
            approval.audit_summary,
            {"approvalId": approval.id, "proposalHash": approval.proposal_hash},
        )
        self._event(
            record,
            "audit.recorded",
            "module",
            "consent",
            "Approval was cryptographically bound to the displayed proposal terms.",
            {"proposalId": record.proposal.id, "version": record.proposal.version},
        )
        record.workflow.summary = "Proposal approved. Checkout is ready when you are."
        self._refresh_actions(record)
        self._checkpoint(record, "proposal_approved", "Proposal approved")
        return self._view(record)

    def reject_proposal(
        self, workflow_id: str, proposal_id: str, reason: str | None
    ) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        self._require_state(record, "awaiting_approval")
        if not record.proposal or record.proposal.id != proposal_id:
            raise DomainError("Proposal does not match the current workflow")
        record.approval = self.consent.reject(workflow_id, record.proposal, reason)
        record.proposal.status = "rejected"
        self._event(
            record,
            "approval.rejected",
            "user",
            "consent",
            record.approval.audit_summary,
            {"reason": reason},
        )
        self._transition(record, "rejected", "Proposal rejected. No purchase was made.")
        self._checkpoint(record, "proposal_rejected", "Proposal rejected")
        return self._view(record)

    def select_offer(self, workflow_id: str, offer_id: str) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        self._require_state(record, "awaiting_approval")
        if record.approval:
            raise DomainError("The offer cannot be changed after approval", 409)
        if not record.comparison or not record.proposal:
            raise DomainError("Workflow has no comparison or current proposal")
        top_offer_ids = [item.offer_id for item in record.comparison.ranked_offers[:3]]
        if offer_id not in top_offer_ids:
            raise DomainError("Offer must belong to the current top three", 422)
        if record.proposal.offer_id == offer_id:
            return self._view(record)
        offer = self.catalog.get_offer(offer_id)
        if not offer:
            raise DomainError("Selected offer is no longer available", 404)

        previous_offer_id = record.proposal.offer_id
        record.proposal.status = "expired"
        record.proposal = self.proposals.create_proposal(
            record.workflow.id,
            offer,
            record.comparison,
            self.profile.get_profile(),
        )
        self._event(
            record,
            "proposal.offer_changed",
            "user",
            "proposal",
            f"User changed the selected offer to {offer.title}.",
            {
                "previousOfferId": previous_offer_id,
                "offerId": offer_id,
                "proposalId": record.proposal.id,
                "hash": record.proposal.hash,
            },
        )
        record.workflow.summary = "Selection updated. Review the new exact proposal terms."
        self._refresh_actions(record)
        return self._view(record)

    def execute_checkout(self, workflow_id: str, approval_id: str) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        self._require_state(record, "awaiting_approval")
        if not record.proposal:
            raise DomainError("Workflow has no proposal")
        if not record.approval or record.approval.id != approval_id:
            raise DomainError("Checkout requires the valid approval for the current proposal")
        self._transition(record, "checkout_in_progress", "Checkout is in progress.")
        self._event(
            record,
            "checkout.started",
            "module",
            "checkout",
            "Checkout started after validating explicit approval.",
            {"approvalId": approval_id},
        )
        result = self.checkout.execute(
            workflow_id,
            record.proposal,
            record.approval,
            self.profile.get_payment_method().token,
        )
        record.checkout = result.attempt
        self._event(
            record,
            "catalog.offer_revalidated",
            "module",
            "catalog",
            "Offer terms were revalidated immediately before payment.",
            {"offerId": record.proposal.offer_id, "result": result.status},
        )
        if result.status == "failed":
            reason = result.attempt.failure_reason or "unknown"
            self._event(
                record,
                "checkout.failed",
                "module",
                "checkout",
                f"Checkout stopped before purchase: {reason.replace('_', ' ')}.",
                {"reason": reason},
            )
            self._transition(record, "checkout_failed", f"Checkout failed: {reason.replace('_', ' ')}.")
            self._checkpoint(record, "checkout_failed", "Checkout failed")
            return self._view(record)

        record.proposal.status = "checked_out"
        self._event(
            record,
            "checkout.succeeded",
            "module",
            "checkout",
            "Mock payment and merchant checkout succeeded.",
            {"receiptId": result.attempt.receipt.receipt_id if result.attempt.receipt else None},
        )
        self._transition(record, "ordered", "Order created successfully.")
        record.order = self.tracking.create_order(workflow_id, result.order_seed or {})
        self._event(
            record,
            "order.created",
            "module",
            "tracking",
            f"Order {record.order.merchant_order_ref} was created.",
            {"orderId": record.order.id},
        )
        self._transition(record, "tracking", "Order placed and ready for tracking simulation.")
        self._checkpoint(record, "checkout_completed", "Order placed")
        return self._view(record)

    def simulate_order_status(self, order_id: str, status: schemas.OrderStatus) -> schemas.WorkflowView:
        record = next((item for item in self.records.values() if item.order and item.order.id == order_id), None)
        if not record:
            raise DomainError("Order not found", 404)
        if record.workflow.state not in {"tracking", "completed"}:
            raise DomainError("Order tracking is not active for this workflow")
        record.order = self.tracking.simulate_status(record.order, status)
        self._event(
            record,
            "order.status_updated",
            "module",
            "tracking",
            f"Order status changed to {status.replace('_', ' ')}.",
            {"orderId": order_id, "status": status},
        )
        if status == "exception":
            self._event(
                record,
                "order.exception_detected",
                "module",
                "tracking",
                "A delivery exception needs attention.",
                {"orderId": order_id},
            )
            if record.workflow.state == "completed":
                self._transition(record, "tracking", "Delivery exception needs attention.")
            else:
                record.workflow.summary = "Delivery exception needs attention."
                self._refresh_actions(record)
        elif status == "delivered":
            self._transition(record, "completed", "Order delivered. Workflow complete.")
            self._event(
                record,
                "workflow.completed",
                "system",
                "orchestrator",
                "The commerce workflow completed after delivery.",
                {},
            )
        elif status == "cancelled":
            self._transition(record, "cancelled", "Order cancelled.")
        elif record.workflow.state == "completed":
            self._transition(record, "tracking", f"Order is {status.replace('_', ' ')}.")
        else:
            record.workflow.summary = f"Order is {status.replace('_', ' ')}."
            self._refresh_actions(record)
        self._checkpoint(record, "tracking_updated", f"Order {status.replace('_', ' ')}")
        return self._view(record)

    def cancel_workflow(self, workflow_id: str) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        if "cancel" not in record.workflow.available_actions:
            raise DomainError("Workflow cannot be cancelled in its current state")
        self._event(record, "workflow.cancelled", "user", "orchestrator", "User cancelled the workflow.", {})
        self._transition(record, "cancelled", "Workflow cancelled. No further action will be taken.")
        self._checkpoint(record, "workflow_cancelled", "Workflow cancelled")
        return self._view(record)

    def rollback_workflow(self, workflow_id: str, revision_id: str) -> schemas.WorkflowView:
        record = self._record(workflow_id)
        target = next((item for item in record.revisions if item.revision.id == revision_id), None)
        if not target:
            raise DomainError("Revision does not belong to this workflow", 404)
        if record.current_revision_id == revision_id:
            raise DomainError("Workflow is already at the selected revision", 422)

        source_revision_id = record.current_revision_id
        source_state = record.workflow.state
        source_order = record.order.model_copy(deep=True) if record.order else None
        target_has_same_order = bool(
            source_order and target.snapshot.order and source_order.id == target.snapshot.order.id
        )
        if source_order and not target_has_same_order and source_order.status != "cancelled":
            self._event(
                record,
                "rollback.compensation_recorded",
                "system",
                "orchestrator",
                f"Mock order {source_order.merchant_order_ref} was cancelled before restoring earlier workflow data.",
                {"orderId": source_order.id, "previousStatus": source_order.status},
            )

        self._restore_snapshot(record, target.snapshot)
        record.workflow.updated_at = utcnow()
        if source_state != record.workflow.state:
            self._event(
                record,
                "workflow.state_changed",
                "system",
                "orchestrator",
                f"Workflow moved from {source_state} to {record.workflow.state} during rollback.",
                {"from": source_state, "to": record.workflow.state, "reason": "rollback"},
            )
        self._event(
            record,
            "workflow.rollback_performed",
            "user",
            "orchestrator",
            f"Workflow restored to revision {target.revision.sequence}: {target.revision.label}.",
            {
                "fromRevisionId": source_revision_id,
                "targetRevisionId": revision_id,
                "restoredState": record.workflow.state,
            },
        )
        record.workflow.summary = f"Restored: {target.revision.summary}"
        self._checkpoint(
            record,
            "rollback",
            f"Restored revision {target.revision.sequence}",
            parent_revision_id=revision_id,
            rollback_from_revision_id=source_revision_id,
        )
        return self._view(record)

    def reset(self) -> None:
        self.records.clear()

    def _classify_and_continue(self, record: WorkflowRecord) -> None:
        profile = self.profile.get_profile()
        result = self.intent.classify(record.workflow.prompt, record.messages, profile)
        self._event(
            record,
            "prompt.classified",
            "module",
            "intent",
            f"Prompt classified as {result.status.replace('_', ' ')}.",
            {
                "status": result.status,
                "confidence": result.confidence,
                "source": result.source,
                "productCategory": (
                    result.constraints.product_category if result.constraints else None
                ),
            },
        )
        record.constraints = result.constraints
        if result.status == "policy_violation":
            record.clarification = None
            record.guardrail = result.block
            self._event(
                record,
                "policy.blocked",
                "module",
                "intent",
                result.block.message if result.block else "Request blocked by policy.",
                {"code": result.block.code if result.block else "unsupported_request"},
            )
            self._transition(record, "blocked_by_policy", "Request blocked by the safety policy.")
            return
        if result.status == "need_clarification":
            record.guardrail = None
            record.clarification = result.question
            self._event(
                record,
                "clarification.requested",
                "module",
                "intent",
                result.question.text if result.question else "More information is required.",
                {
                    "questionId": result.question.id if result.question else None,
                    "expectedField": result.question.expected_field if result.question else None,
                    "fields": (
                        [field.name for field in result.question.fields]
                        if result.question
                        else []
                    ),
                },
            )
            self._transition(record, "needs_clarification", "I need one detail before I can search.")
            return
        record.clarification = None
        record.guardrail = None
        record.workflow.summary = result.summary or "Request understood."
        self._research_and_continue(record)

    def _research_and_continue(self, record: WorkflowRecord) -> None:
        if not record.constraints:
            raise DomainError("Cannot research without shopping constraints")
        self._transition(record, "researching", "Searching for products.")
        search = self.catalog.search(record.constraints, self.profile.get_profile())
        self._event(
            record,
            "catalog.search_completed",
            "module",
            "catalog",
            f"Catalog search returned {len(search.offers)} candidate offers ({search.status}).",
            {"searchId": search.search_id, "status": search.status, "offerCount": len(search.offers)},
        )
        if search.status == "alternatives_found":
            record.alternatives = search.alternatives
            self._transition(
                record,
                "awaiting_alternative_acceptance",
                "No exact match. Choose whether to accept one of the transparent alternatives.",
            )
            return
        if search.status == "no_results":
            record.alternatives = []
            self._transition(record, "no_exact_match", "No offer matches this request.")
            return

        record.alternatives = None
        self._transition(record, "comparing", "Comparing eligible offers.")
        comparison = self.comparison.compare(
            record.workflow.id,
            record.constraints,
            self.profile.get_profile(),
            search.offers,
        )
        record.comparison = comparison
        self._event(
            record,
            "comparison.completed",
            "module",
            "comparison",
            comparison.summary,
            {
                "comparisonId": comparison.id,
                "bestOfferId": comparison.best_offer_id,
                "confidence": comparison.confidence,
            },
        )
        if not comparison.best_offer_id:
            self._transition(record, "no_exact_match", "Comparison found no viable offer.")
            return
        offer = self.catalog.get_offer(comparison.best_offer_id)
        if not offer:
            raise DomainError("Selected catalog offer disappeared")
        self._transition(record, "proposal_ready", "Creating exact checkout terms for review.")
        record.proposal = self.proposals.create_proposal(
            record.workflow.id,
            offer,
            comparison,
            self.profile.get_profile(),
        )
        self._event(
            record,
            "proposal.created",
            "module",
            "proposal",
            f"Proposal created for {record.proposal.total.amount:g} PLN; explicit approval is required.",
            {
                "proposalId": record.proposal.id,
                "version": record.proposal.version,
                "hash": record.proposal.hash,
            },
        )
        self._transition(record, "awaiting_approval", "Review the exact proposal and approve or reject it.")

    def _transition(self, record: WorkflowRecord, state: str, summary: str) -> None:
        previous = record.workflow.state
        if previous != state:
            record.workflow.state = state
            record.workflow.summary = summary
            record.workflow.updated_at = utcnow()
            self._refresh_actions(record)
            self._event(
                record,
                "workflow.state_changed",
                "system",
                "orchestrator",
                f"Workflow moved from {previous} to {state}.",
                {"from": previous, "to": state},
            )
        else:
            record.workflow.summary = summary
            self._refresh_actions(record)

    def _refresh_actions(self, record: WorkflowRecord) -> None:
        actions = list(self.ACTIONS[record.workflow.state])
        if record.workflow.state == "awaiting_approval" and record.approval:
            actions = ["execute_checkout", "cancel"]
        if len(record.revisions) > 1 and "rollback" not in actions:
            actions.append("rollback")
        record.workflow.available_actions = actions
        record.workflow.updated_at = utcnow()

    def _snapshot(self, record: WorkflowRecord) -> WorkflowSnapshot:
        return WorkflowSnapshot(
            workflow=deepcopy(record.workflow),
            messages=list(record.messages),
            clarification=deepcopy(record.clarification),
            guardrail=deepcopy(record.guardrail),
            constraints=deepcopy(record.constraints),
            alternatives=deepcopy(record.alternatives),
            comparison=deepcopy(record.comparison),
            proposal=deepcopy(record.proposal),
            approval=deepcopy(record.approval),
            checkout=deepcopy(record.checkout),
            order=deepcopy(record.order),
        )

    def _restore_snapshot(self, record: WorkflowRecord, snapshot: WorkflowSnapshot) -> None:
        record.workflow = deepcopy(snapshot.workflow)
        record.messages = list(snapshot.messages)
        record.clarification = deepcopy(snapshot.clarification)
        record.guardrail = deepcopy(snapshot.guardrail)
        record.constraints = deepcopy(snapshot.constraints)
        record.alternatives = deepcopy(snapshot.alternatives)
        record.comparison = deepcopy(snapshot.comparison)
        record.proposal = deepcopy(snapshot.proposal)
        record.approval = deepcopy(snapshot.approval)
        record.checkout = deepcopy(snapshot.checkout)
        record.order = deepcopy(snapshot.order)

    def _checkpoint(
        self,
        record: WorkflowRecord,
        action: str,
        label: str,
        *,
        parent_revision_id: str | None = None,
        rollback_from_revision_id: str | None = None,
    ) -> None:
        revision_id = new_id("rev")
        revision = schemas.WorkflowRevision(
            id=revision_id,
            workflowId=record.workflow.id,
            parentRevisionId=(
                parent_revision_id if parent_revision_id is not None else record.current_revision_id
            ),
            rollbackFromRevisionId=rollback_from_revision_id,
            sequence=len(record.revisions) + 1,
            state=record.workflow.state,
            action=action,
            label=label,
            summary=record.workflow.summary,
            createdAt=utcnow(),
            isCurrent=True,
            canRollback=False,
        )
        record.revisions.append(WorkflowRevisionRecord(revision=revision, snapshot=self._snapshot(record)))
        record.current_revision_id = revision_id
        self._refresh_actions(record)
        record.revisions[-1].snapshot = self._snapshot(record)

    def _history(self, record: WorkflowRecord) -> schemas.WorkflowHistory:
        if not record.current_revision_id:
            raise DomainError("Workflow has no current revision")
        revisions = []
        for item in record.revisions:
            revision = item.revision.model_copy(deep=True)
            revision.is_current = revision.id == record.current_revision_id
            revision.can_rollback = revision.id != record.current_revision_id
            revisions.append(revision)
        return schemas.WorkflowHistory(
            currentRevisionId=record.current_revision_id,
            revisions=revisions,
        )

    def _event(
        self,
        record: WorkflowRecord,
        event_type: str,
        actor: str,
        module: str,
        summary: str,
        data: dict,
    ) -> None:
        record.events.append(
            schemas.DomainEvent(
                id=new_id("evt"),
                workflowId=record.workflow.id,
                type=event_type,
                actor=actor,
                module=module,
                summary=summary,
                data=data,
                createdAt=utcnow(),
            )
        )

    def _record(self, workflow_id: str) -> WorkflowRecord:
        record = self.records.get(workflow_id)
        if not record:
            raise DomainError("Workflow not found", 404)
        return record

    def _require_state(self, record: WorkflowRecord, expected: str) -> None:
        if record.workflow.state != expected:
            raise DomainError(
                f"Action requires workflow state '{expected}', current state is '{record.workflow.state}'"
            )

    def _view(self, record: WorkflowRecord) -> schemas.WorkflowView:
        return schemas.WorkflowView(
            workflow=record.workflow,
            clarification=record.clarification,
            guardrail=record.guardrail,
            constraints=record.constraints,
            alternatives=record.alternatives,
            comparison=record.comparison,
            proposal=record.proposal,
            approval=record.approval,
            checkout=record.checkout,
            order=record.order,
            events=record.events,
            history=self._history(record),
        ).model_copy(deep=True)
