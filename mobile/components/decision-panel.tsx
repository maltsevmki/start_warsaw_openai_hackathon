import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ClarificationReply, OrderStatus, WorkflowAction, WorkflowView } from '@/api/types';
import { AppButton, Card, Chip, Divider, Eyebrow, Field, Notice } from '@/components/ui';
import { useClearCartTheme, type ThemeColors } from '@/providers/theme-provider';
import { dateTime, money, titleCase } from '@/utils/format';

type Props = {
  view: WorkflowView;
  busy: string | null;
  error: string;
  onClarify: (reply: ClarificationReply) => void;
  onAlternative: (accepted: boolean, alternativeId?: string) => void;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onCheckout: () => void;
  onCancel: () => void;
  onSimulate: (status: OrderStatus) => void;
};

const trackingStatuses: OrderStatus[] = ['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'exception'];
const failureCopy: Record<string, string> = {
  missing_approval: 'The approval could not be validated. No payment or order was created.',
  proposal_mismatch: 'The submitted terms did not match the proposal you saw. No payment was made.',
  proposal_expired: 'The approved terms expired before checkout. No payment was made.',
  price_changed: 'The price changed after approval, so checkout stopped and no payment was made.',
  out_of_stock: 'The item became unavailable, so checkout stopped and no payment was made.',
  delivery_changed: 'The delivery commitment changed, so checkout stopped before payment.',
  return_policy_changed: 'The return terms changed, so checkout stopped before payment.',
  payment_failed: 'Payment authorization failed and no order was created.',
};

export function DecisionPanel(props: Props) {
  const { view } = props;
  const actions = new Set<WorkflowAction>(view.workflow.availableActions);
  if (view.workflow.state === 'needs_clarification' && view.clarification) return <Clarification {...props} actions={actions} />;
  if (view.workflow.state === 'blocked_by_policy') return <Guardrail view={view} />;
  if (view.workflow.state === 'no_exact_match') return <NoMatch {...props} actions={actions} />;
  if (view.workflow.state === 'awaiting_alternative_acceptance') return <Alternatives {...props} actions={actions} />;
  if (view.workflow.state === 'awaiting_approval' && view.approval) return <ApprovalReceipt {...props} actions={actions} />;
  if (view.workflow.state === 'awaiting_approval' && view.proposal) return <Proposal {...props} actions={actions} />;
  if (view.workflow.state === 'checkout_failed') return <CheckoutFailure {...props} actions={actions} />;
  if ((view.workflow.state === 'tracking' || view.workflow.state === 'completed') && view.order) return <Tracking {...props} actions={actions} />;
  if (view.workflow.state === 'rejected' || view.workflow.state === 'cancelled') return <Terminal view={view} />;
  return <Progress {...props} actions={actions} />;
}

type Common = Props & { actions: Set<WorkflowAction> };

function DecisionShell({ icon, eyebrow, title, lead, children, success = false }: React.PropsWithChildren<{ icon: keyof typeof Ionicons.glyphMap; eyebrow: string; title: string; lead?: string; success?: boolean }>) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  return <Card style={styles.decision}><View style={[styles.decisionIcon, success && styles.decisionIconSuccess]}><Ionicons name={icon} size={25} color={colors.green} /></View><Eyebrow>{eyebrow}</Eyebrow><Text style={styles.title}>{title}</Text>{lead ? <Text style={styles.lead}>{lead}</Text> : null}{children}</Card>;
}

function ErrorNotice({ error }: { error: string }) { return error ? <Notice>{error}</Notice> : null; }

function Cancel({ actions, busy, onCancel }: Pick<Common, 'actions' | 'busy' | 'onCancel'>) {
  return actions.has('cancel') ? <AppButton label="Cancel workflow" icon="close-outline" tone="quiet" disabled={Boolean(busy)} onPress={onCancel} /> : null;
}

function Clarification({ view, actions, busy, error, onClarify, onCancel }: Common) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  const question = view.clarification!;
  const [message, setMessage] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldError, setFieldError] = useState('');
  const submit = () => {
    if (question.fields.length) {
      const missing = question.fields.find((field) => field.required && !values[field.name]?.trim());
      if (missing) { setFieldError(`Add ${missing.label.toLowerCase()} before continuing.`); return; }
      onClarify({ questionId: question.id, answers: question.fields.filter((field) => values[field.name]?.trim()).map((field) => ({ field: field.name, value: values[field.name].trim() })) });
    } else {
      if (!message.trim()) { setFieldError('Add a short answer before continuing.'); return; }
      onClarify({ message: message.trim() });
    }
    setFieldError('');
  };
  return <DecisionShell icon="refresh-outline" eyebrow="One detail needed" title={question.text} lead="The agent paused research until you clarify this constraint.">
    {question.fields.length ? <View style={styles.fields}>{question.fields.map((field) => <View key={field.name} style={styles.fieldGroup}><Text style={styles.label}>{field.label}{field.required ? '' : ' · Optional'}</Text>{field.options.length ? <View style={styles.chips}>{field.options.map((option) => <Chip key={option} selected={values[field.name] === option} onPress={() => { setValues({ ...values, [field.name]: option }); setFieldError(''); }}>{option}</Chip>)}</View> : null}{field.inputType !== 'single_select' || field.allowCustom ? <Field keyboardType={field.inputType === 'number' ? 'numeric' : 'default'} value={values[field.name] ?? ''} onChangeText={(value) => { setValues({ ...values, [field.name]: value }); setFieldError(''); }} placeholder={field.placeholder ?? undefined} /> : null}</View>)}</View> : <><View style={styles.chips}>{question.examples.map((example) => <Chip key={example} selected={message === example} onPress={() => { setMessage(example); setFieldError(''); }}>{example}</Chip>)}</View><Text style={styles.label}>Your answer</Text><Field multiline value={message} onChangeText={(value) => { setMessage(value); setFieldError(''); }} placeholder="Type your answer…" /></>}
    {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}<ErrorNotice error={error} /><View style={styles.actions}>{actions.has('reply_to_clarification') ? <AppButton label="Continue research" icon="arrow-forward" busy={busy === 'clarify'} disabled={Boolean(busy)} onPress={submit} /> : null}<Cancel actions={actions} busy={busy} onCancel={onCancel} /></View>
  </DecisionShell>;
}

function Guardrail({ view }: { view: WorkflowView }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  return <DecisionShell icon="shield-outline" eyebrow="Safety boundary" title="This request can’t be purchased by the agent" lead={view.guardrail?.message ?? 'The request is outside the supported purchasing policy.'}><View style={styles.policy}><Ionicons name="ban-outline" size={17} color={colors.red} /><Text style={styles.policyText}>Policy: {titleCase(view.guardrail?.code ?? 'unsupported_request')}</Text></View>{view.guardrail?.canSuggestSaferAlternative ? <Text style={styles.reassurance}>A qualified professional or regulated service may be able to help safely.</Text> : null}<AppButton label="Start a different request" icon="arrow-back" onPress={() => router.replace('/')} /></DecisionShell>;
}

function NoMatch({ actions, busy, error, onCancel }: Common) {
  return <DecisionShell icon="search-outline" eyebrow="Search complete" title="No exact match was found" lead="The agent kept your constraints intact and stopped instead of silently choosing a worse fit."><ErrorNotice error={error} /><View style={makeStyles(useClearCartTheme().colors).actions}><AppButton label="Revise request" icon="create-outline" onPress={() => router.replace('/')} /><Cancel actions={actions} busy={busy} onCancel={onCancel} /></View></DecisionShell>;
}

function Alternatives({ view, actions, busy, error, onAlternative, onCancel }: Common) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  const [selection, setSelection] = useState(''); const [fieldError, setFieldError] = useState('');
  return <DecisionShell icon="swap-horizontal-outline" eyebrow="Your constraints, your choice" title="Would either adjustment work?" lead="Nothing changes unless you explicitly accept one alternative."><View style={styles.alternatives}>{(view.alternatives ?? []).map((alternative) => { const selected = selection === alternative.id; const adjusted = alternative.adjustedConstraints; const change = adjusted.budgetMax ? `Budget ${money(adjusted.budgetMax)}` : adjusted.deliveryDeadline ? `Delivery ${titleCase(adjusted.deliveryDeadline)}` : 'Adjusted terms'; return <View key={alternative.id} style={[styles.alternative, selected && styles.alternativeSelected]}><View style={styles.alternativeTop}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View><View style={styles.flex}><Text style={styles.alternativeTitle}>{alternative.message}</Text><Text style={styles.alternativeReason}>{titleCase(alternative.reason)}</Text></View></View><View style={styles.chips}><Chip selected={selected} onPress={() => { setSelection(alternative.id); setFieldError(''); }}>{selected ? 'Selected' : 'Choose'}</Chip><Chip>{change}</Chip></View></View>; })}</View>{fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}<ErrorNotice error={error} /><View style={styles.actions}>{actions.has('accept_alternative') ? <AppButton label="Accept selected change" icon="arrow-forward" busy={busy === 'alternative'} disabled={Boolean(busy)} onPress={() => { if (!selection) { setFieldError('Select one alternative to continue.'); return; } onAlternative(true, selection); }} /> : null}{actions.has('reject_alternative') ? <AppButton label="Keep original terms" tone="secondary" disabled={Boolean(busy)} onPress={() => onAlternative(false)} /> : null}<Cancel actions={actions} busy={busy} onCancel={onCancel} /></View></DecisionShell>;
}

function Proposal({ view, actions, busy, error, onApprove, onReject, onCancel }: Common) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors); const proposal = view.proposal!; const [reason, setReason] = useState('');
  const facts = [['Delivery', proposal.delivery.label, `${proposal.delivery.earliest} – ${proposal.delivery.latest}`], ['Returns', proposal.returns.label, proposal.returns.returnable ? `${proposal.returns.days} days` : 'Not returnable'], ['Warranty', proposal.warranty.label, `${proposal.warranty.months} months`], ['Payment', proposal.paymentMethodLabel, 'Protected method']];
  return <Card style={styles.proposal}><View style={styles.proposalBanner}><Ionicons name="shield-checkmark-outline" size={21} color={colors.green} /><View style={styles.flex}><Text style={styles.bannerTitle}>Ready for your approval</Text><Text style={styles.bannerCopy}>The agent cannot purchase until you approve these exact terms.</Text></View></View><View style={styles.proposalTitle}><View style={styles.flex}><Eyebrow>Immutable proposal · v{proposal.version}</Eyebrow><Text style={styles.title}>{proposal.title}</Text><Text style={styles.lead}>{proposal.merchantName} · Quantity {proposal.quantity}</Text></View><Text style={styles.totalBig}>{money(proposal.total)}</Text></View><View style={styles.factGrid}>{facts.map(([label, value, detail]) => <View key={label} style={styles.proposalFact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text><Text style={styles.factDetail}>{detail}</Text></View>)}</View><View style={styles.lineItems}>{proposal.lineItems.map((item) => <View key={item.label} style={styles.lineItem}><Text style={styles.lineLabel}>{item.label}</Text><Text style={styles.lineValue}>{money(item.amount)}</Text></View>)}<Divider /><View style={styles.lineItem}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalLabel}>{money(proposal.total)}</Text></View></View><View style={styles.approvalCopy}><Ionicons name="lock-closed-outline" size={19} color={colors.green} /><View style={styles.flex}><Text style={styles.approvalText}>{proposal.approvalText}</Text><Text style={styles.expiry}>Expires {dateTime(proposal.expiresAt)}</Text></View></View><Text style={styles.label}>Optional reason if you decline</Text><Field value={reason} onChangeText={setReason} placeholder="e.g. I want a different merchant" /><ErrorNotice error={error} /><View style={styles.actions}>{actions.has('approve_proposal') ? <AppButton label="Approve exact terms" icon="checkmark" busy={busy === 'approve'} disabled={Boolean(busy)} onPress={onApprove} /> : null}{actions.has('reject_proposal') ? <AppButton label="Decline proposal" tone="secondary" disabled={Boolean(busy)} onPress={() => onReject(reason.trim() || undefined)} /> : null}<Cancel actions={actions} busy={busy} onCancel={onCancel} /></View></Card>;
}

function ApprovalReceipt({ view, actions, busy, error, onCheckout, onCancel }: Common) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors); const approval = view.approval!;
  return <DecisionShell icon="checkmark-circle-outline" success eyebrow="Consent recorded" title="Approval is saved. Checkout has not run." lead="This separate checkpoint lets the agent revalidate price, stock, delivery, and return terms before payment."><View style={styles.receiptGrid}>{[['Decision', titleCase(approval.decision)], ['Actor', 'You'], ['Recorded', dateTime(approval.decidedAt)], ['Proposal', `Version ${approval.proposalVersion}`]].map(([label, value]) => <View key={label} style={styles.receiptFact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>)}</View><View style={styles.hash}><Text style={styles.hashLabel}>Bound hash</Text><Text style={styles.hashValue}>{approval.proposalHash.slice(0, 14)}…{approval.proposalHash.slice(-8)}</Text></View><Text style={styles.audit}>{approval.auditSummary}</Text><ErrorNotice error={error} /><View style={styles.actions}>{actions.has('execute_checkout') ? <AppButton label="Execute checkout" icon="card-outline" busy={busy === 'checkout'} disabled={Boolean(busy)} onPress={onCheckout} /> : null}<Cancel actions={actions} busy={busy} onCancel={onCancel} /></View></DecisionShell>;
}

function CheckoutFailure({ view, actions, busy, error, onCancel }: Common) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors); const reason = view.checkout?.failureReason ?? 'unknown';
  return <DecisionShell icon="shield-checkmark-outline" eyebrow="Protection worked" title="Checkout stopped safely" lead={failureCopy[reason] ?? 'Checkout could not be completed. No order was created.'}><View style={styles.policy}><Ionicons name="alert-outline" size={17} color={colors.amber} /><Text style={[styles.policyText, { color: colors.amber }]}>Reason: {titleCase(reason)}</Text></View><ErrorNotice error={error} /><View style={styles.actions}><AppButton label="Start another request" onPress={() => router.replace('/')} /><Cancel actions={actions} busy={busy} onCancel={onCancel} /></View></DecisionShell>;
}

function Tracking({ view, actions, busy, error, onSimulate, onCancel }: Common) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors); const order = view.order!; const complete = view.workflow.state === 'completed';
  return <DecisionShell icon={complete ? 'checkmark-circle-outline' : 'car-outline'} success={complete} eyebrow={complete ? 'Delivery complete' : 'Order tracking'} title={complete ? 'Your order was delivered' : titleCase(order.status)} lead={`${order.title} · ${money(order.total)}`}><View style={styles.orderMeta}>{[['Merchant reference', order.merchantOrderRef], ['Tracking number', order.trackingNumber ?? 'Assigned after shipping'], ['Delivery', order.deliveryLabel]].map(([label, value]) => <View key={label} style={styles.orderFact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>)}</View><View style={styles.timeline}>{order.timeline.map((entry, index) => <View key={`${entry.status}-${entry.happenedAt}`} style={styles.timelineEntry}><View style={styles.timelineRail}><View style={styles.timelineDot}><Ionicons name={index === order.timeline.length - 1 ? 'cube-outline' : 'checkmark'} size={13} color={colors.white} /></View>{index < order.timeline.length - 1 ? <View style={styles.timelineLine} /> : null}</View><View style={styles.timelineCopy}><Text style={styles.timelineLabel}>{entry.label}</Text><Text style={styles.timelineDate}>{dateTime(entry.happenedAt)}</Text></View></View>)}</View>{actions.has('simulate_tracking') ? <View style={styles.simulator}><Text style={styles.simTitle}>Tracking controls</Text><Text style={styles.simCopy}>Preview a merchant tracking update.</Text><View style={styles.chips}>{trackingStatuses.map((status) => <Chip key={status} selected={status === order.status} onPress={status === order.status || busy ? undefined : () => onSimulate(status)}>{busy === `tracking-${status}` ? 'Updating…' : titleCase(status)}</Chip>)}</View></View> : null}<ErrorNotice error={error} /><View style={styles.actions}>{complete ? <AppButton label="Start another request" onPress={() => router.replace('/')} /> : null}<Cancel actions={actions} busy={busy} onCancel={onCancel} /></View></DecisionShell>;
}

function Terminal({ view }: { view: WorkflowView }) {
  const cancelled = view.workflow.state === 'cancelled';
  return <DecisionShell icon="close-outline" eyebrow="Workflow closed" title={cancelled ? 'Request cancelled' : 'Proposal declined'} lead="No payment or order was created. You can start again whenever you’re ready."><AppButton label="Start another request" onPress={() => router.replace('/')} /></DecisionShell>;
}

function Progress({ view, actions, busy, error, onCancel }: Common) {
  return <DecisionShell icon="sync-outline" eyebrow="Agent working" title={view.workflow.summary} lead="This workflow is progressing without needing a decision from you right now."><ErrorNotice error={error} /><Cancel actions={actions} busy={busy} onCancel={onCancel} /></DecisionShell>;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 }, decision: { gap: 13 }, decisionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, decisionIconSuccess: { borderWidth: 1, borderColor: colors.green }, title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.9 }, lead: { color: colors.textSoft, fontSize: 12, lineHeight: 20 }, label: { marginTop: 3, color: colors.text, fontSize: 10, fontWeight: '800' }, fieldError: { color: colors.red, fontSize: 10, fontWeight: '700' }, actions: { marginTop: 5, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: 10 },
    fields: { gap: 13 }, fieldGroup: { gap: 7 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    policy: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.surface }, policyText: { color: colors.red, fontSize: 10, fontWeight: '800' }, reassurance: { color: colors.green, fontSize: 11, lineHeight: 17, fontWeight: '600' },
    alternatives: { gap: 8 }, alternative: { padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.line, gap: 11 }, alternativeSelected: { borderColor: colors.green, backgroundColor: colors.greenPale }, alternativeTop: { flexDirection: 'row', gap: 10 }, radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: colors.green }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green }, alternativeTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800' }, alternativeReason: { marginTop: 3, color: colors.textFaint, fontSize: 9 },
    proposal: { paddingTop: 0, paddingHorizontal: 18, paddingBottom: 18, overflow: 'hidden', gap: 10 }, proposalBanner: { marginHorizontal: -18, flexDirection: 'row', gap: 11, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: colors.greenPale }, bannerTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, bannerCopy: { marginTop: 3, color: colors.textSoft, fontSize: 9, lineHeight: 15 }, proposalTitle: { marginHorizontal: -18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingVertical: 19 }, totalBig: { color: colors.green, fontSize: 20, fontWeight: '800' }, factGrid: { marginHorizontal: -18, flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }, proposalFact: { width: '50%', minHeight: 82, padding: 13, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, factLabel: { color: colors.textFaint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }, factValue: { marginTop: 5, color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: '800' }, factDetail: { marginTop: 3, color: colors.textFaint, fontSize: 8 }, lineItems: { marginVertical: 9, padding: 14, gap: 10, borderRadius: 13, backgroundColor: colors.background }, lineItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, lineLabel: { color: colors.textSoft, fontSize: 10 }, lineValue: { color: colors.text, fontSize: 10, fontWeight: '700' }, totalLabel: { color: colors.text, fontSize: 12, fontWeight: '800' }, approvalCopy: { marginBottom: 4, flexDirection: 'row', gap: 10, padding: 13, borderRadius: 12, backgroundColor: colors.greenPale }, approvalText: { color: colors.text, fontSize: 10, lineHeight: 16, fontWeight: '700' }, expiry: { marginTop: 4, color: colors.textFaint, fontSize: 8 }, proposalBannerSpace: { marginHorizontal: 0 },
    receiptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, receiptFact: { flexBasis: '45%', flexGrow: 1, padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface }, hash: { padding: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, hashLabel: { color: colors.textFaint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }, hashValue: { marginTop: 5, color: colors.text, fontSize: 10, fontFamily: 'monospace' }, audit: { color: colors.textSoft, fontSize: 10, lineHeight: 16, fontStyle: 'italic' },
    orderMeta: { gap: 7 }, orderFact: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, timeline: { marginTop: 3 }, timelineEntry: { minHeight: 56, flexDirection: 'row' }, timelineRail: { width: 36, alignItems: 'center' }, timelineDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }, timelineLine: { flex: 1, width: 2, backgroundColor: colors.line }, timelineCopy: { flex: 1, paddingTop: 4 }, timelineLabel: { color: colors.text, fontSize: 11, fontWeight: '800' }, timelineDate: { marginTop: 3, color: colors.textFaint, fontSize: 8 }, simulator: { padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, backgroundColor: colors.surface }, simTitle: { color: colors.text, fontSize: 11, fontWeight: '800' }, simCopy: { marginTop: 2, marginBottom: 9, color: colors.textFaint, fontSize: 8 },
  });
}
