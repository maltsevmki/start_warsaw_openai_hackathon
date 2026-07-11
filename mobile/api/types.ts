export type Money = { amount: number; currency: 'PLN' };

export type WorkflowState =
  | 'created' | 'needs_clarification' | 'blocked_by_policy' | 'researching'
  | 'no_exact_match' | 'awaiting_alternative_acceptance' | 'comparing'
  | 'proposal_ready' | 'awaiting_approval' | 'rejected' | 'checkout_in_progress'
  | 'checkout_failed' | 'ordered' | 'tracking' | 'completed' | 'cancelled';

export type WorkflowAction =
  | 'reply_to_clarification' | 'accept_alternative' | 'reject_alternative'
  | 'approve_proposal' | 'reject_proposal' | 'select_offer' | 'execute_checkout'
  | 'simulate_tracking' | 'cancel' | 'rollback';

export type OrderStatus =
  | 'order_created' | 'confirmed' | 'packed' | 'shipped' | 'out_for_delivery'
  | 'delivered' | 'exception' | 'cancelled' | 'return_requested' | 'returned';

export type ShoppingConstraints = {
  productCategory: string | null;
  query: string;
  budgetMax?: Money | null;
  deliveryDeadline?: 'today' | 'tomorrow' | 'this_week' | null;
  compatibility: string[];
  mustHave: string[];
  niceToHave: string[];
  requiredReturnDays?: number | null;
  forbidden: string[];
};

export type ClarificationField = {
  name: string;
  label: string;
  inputType: 'text' | 'number' | 'single_select';
  required: boolean;
  placeholder?: string | null;
  options: string[];
  allowCustom: boolean;
};

export type ClarificationQuestion = {
  id: string;
  text: string;
  expectedField: string;
  examples: string[];
  fields: ClarificationField[];
};

export type ClarificationReply =
  | { message: string }
  | { questionId: string; answers: { field: string; value: string }[] };

export type Alternative = {
  id: string;
  reason: 'higher_budget' | 'later_delivery' | 'different_category' | 'weaker_return_terms';
  message: string;
  adjustedConstraints: ShoppingConstraints;
};

export type RankedOffer = {
  offerId: string;
  rank: number;
  score: number;
  title: string;
  total: Money;
  reasons: string[];
  tradeoffs: string[];
  disqualifiers: string[];
};

export type ComparisonResult = {
  id: string;
  bestOfferId?: string | null;
  confidence: number;
  recommendation: 'proceed' | 'ask_user' | 'stop';
  summary: string;
  rankedOffers: RankedOffer[];
  missingEvidence: string[];
};

export type CheckoutProposal = {
  id: string;
  workflowId: string;
  version: number;
  status: 'created' | 'approved' | 'rejected' | 'expired' | 'checked_out';
  offerId: string;
  merchantName: string;
  title: string;
  quantity: 1;
  lineItems: { label: string; amount: Money }[];
  subtotal: Money;
  taxesAndFees: Money;
  total: Money;
  delivery: { label: string; earliest: string; latest: string };
  returns: { returnable: boolean; days: number; label: string };
  warranty: { months: number; label: string };
  paymentMethodLabel: string;
  approvalText: string;
  expiresAt: string;
  hash: string;
};

export type Approval = {
  id: string;
  workflowId: string;
  proposalId: string;
  proposalVersion: number;
  proposalHash: string;
  decision: 'approved' | 'rejected';
  actor: 'demo_user';
  decidedAt: string;
  spendingPolicyResult: 'approval_required_and_granted' | 'rejected_by_user';
  auditSummary: string;
};

export type CheckoutAttempt = {
  id: string;
  workflowId: string;
  proposalId: string;
  approvalId: string;
  status: 'started' | 'succeeded' | 'failed';
  failureReason?: string | null;
  merchantOrderRef?: string | null;
};

export type Order = {
  id: string;
  workflowId: string;
  merchantOrderRef: string;
  status: OrderStatus;
  title: string;
  total: Money;
  deliveryLabel: string;
  trackingNumber?: string | null;
  timeline: { status: OrderStatus; label: string; happenedAt: string }[];
};

export type DomainEvent = {
  id: string;
  workflowId: string;
  type: string;
  actor: 'user' | 'system' | 'module';
  module: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type WorkflowSummary = {
  id: string;
  userId: 'demo_user';
  state: WorkflowState;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  summary: string;
  availableActions: WorkflowAction[];
};

export type WorkflowRevision = {
  id: string;
  workflowId: string;
  parentRevisionId?: string | null;
  rollbackFromRevisionId?: string | null;
  sequence: number;
  state: WorkflowState;
  action: string;
  label: string;
  summary: string;
  createdAt: string;
  isCurrent: boolean;
  canRollback: boolean;
};

export type WorkflowView = {
  workflow: WorkflowSummary;
  clarification?: ClarificationQuestion | null;
  guardrail?: { code: string; message: string; canSuggestSaferAlternative: boolean } | null;
  constraints?: ShoppingConstraints | null;
  alternatives?: Alternative[] | null;
  comparison?: ComparisonResult | null;
  proposal?: CheckoutProposal | null;
  approval?: Approval | null;
  checkout?: CheckoutAttempt | null;
  order?: Order | null;
  events: DomainEvent[];
  history: { currentRevisionId: string; revisions: WorkflowRevision[] };
};

export type ScenarioPrompts = {
  happyPath: string;
  clarification: string;
  alternative: string;
  guardrail: string;
  checkoutException: string;
};
