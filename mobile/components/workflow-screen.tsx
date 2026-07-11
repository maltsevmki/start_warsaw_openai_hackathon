import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ClarificationReply, OrderStatus, WorkflowView } from '@/api/types';
import { addMessage, approveProposal, cancelWorkflow, checkout, getWorkflow, rejectProposal, respondAlternative, rollbackWorkflow, selectOffer, simulateStatus } from '@/api/workflows';
import { DecisionPanel } from '@/components/decision-panel';
import { AppButton, AppHeader, Card, Chip, Divider, Eyebrow, Notice, Page, SectionTitle } from '@/components/ui';
import { useClearCartTheme, type ThemeColors } from '@/providers/theme-provider';
import { dateTime, money, stateLabel, titleCase } from '@/utils/format';

const phases = ['Request', 'Research', 'Review', 'Approval', 'Checkout', 'Tracking', 'Complete'];
const statePhase = {
  created: 0, needs_clarification: 0, blocked_by_policy: 0, cancelled: 0,
  researching: 1, no_exact_match: 2, awaiting_alternative_acceptance: 2, comparing: 2, proposal_ready: 2,
  awaiting_approval: 3, rejected: 3, checkout_in_progress: 4, checkout_failed: 4, ordered: 4,
  tracking: 5, completed: 6,
} as const;

type Run = (name: string, operation: () => Promise<WorkflowView>) => void;

export function WorkflowScreen() {
  const { workflowId } = useLocalSearchParams<{ workflowId: string }>();
  const { colors } = useClearCartTheme();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const [view, setView] = useState<WorkflowView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!workflowId) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try { setView(await getWorkflow(workflowId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this workflow.'); }
    finally {
      if (refresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { void load(); }, [load]);

  const run: Run = (name, operation) => {
    setBusy(name); setError('');
    operation().then(setView).catch((caught) => setError(caught instanceof Error ? caught.message : 'The action failed.')).finally(() => setBusy(null));
  };

  if (loading) return <Centered title="Restoring workflow…" copy="Fetching canonical state and audit record." />;
  if (!view) return <Centered title="Couldn’t load this workflow" copy={error} retry={() => load()} />;

  const id = view.workflow.id;
  const handlers = {
    onClarify: (reply: ClarificationReply) => run('clarify', () => addMessage(id, reply)),
    onAlternative: (accepted: boolean, alternativeId?: string) => run('alternative', () => respondAlternative(id, accepted, alternativeId)),
    onApprove: () => run('approve', () => approveProposal(id, view)),
    onReject: (reason?: string) => {
      if (view.proposal) run('reject', () => rejectProposal(id, view.proposal!.id, reason));
    },
    onCheckout: () => {
      if (view.approval) run('checkout', () => checkout(id, view.approval!.id));
    },
    onCancel: () => run('cancel', () => cancelWorkflow(id)),
    onSimulate: (status: OrderStatus) => {
      if (view.order) run(`tracking-${status}`, () => simulateStatus(view.order!.id, status));
    },
  };
  const showComparison = view.workflow.state === 'awaiting_approval' && !view.approval;
  const wide = width >= 900;
  const maxWidth = Math.min(width, 1180);

  return (
    <Page>
      <AppHeader back />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.green} />} contentContainerStyle={styles.scroll}>
        <View style={[styles.shell, { maxWidth }]}>
          <WorkflowHero view={view} />
          <History view={view} busy={busy} run={run} />
          {error ? <Notice>{error}</Notice> : null}
          <View style={[styles.layout, wide && styles.layoutWide]}>
            <View style={styles.mainColumn}>
              <DecisionPanel view={view} busy={busy} error={error} {...handlers} />
              <RequestSummary view={view} />
              {showComparison ? <Comparison view={view} busy={busy} run={run} /> : null}
              <EventTrail view={view} />
            </View>
            <View style={[styles.sideColumn, wide && styles.sideColumnWide]}><PurchaseControl view={view} /></View>
          </View>
        </View>
      </ScrollView>
    </Page>
  );
}

function WorkflowHero({ view }: { view: WorkflowView }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  const current = statePhase[view.workflow.state];
  return (
    <Card style={styles.hero}>
      <View style={styles.heroAccent} />
      <View style={styles.heroTop}><View style={styles.flex}><Eyebrow>Active buying agent</Eyebrow><Text style={styles.heroTitle}>{view.workflow.summary}</Text></View><Chip selected>{stateLabel(view.workflow.state)}</Chip></View>
      <View style={styles.meta}><View style={styles.metaItem}><Ionicons name="time-outline" size={14} color={colors.textFaint} /><Text style={styles.metaText}>Started {dateTime(view.workflow.createdAt)}</Text></View><Text style={styles.metaText}>#{view.workflow.id.slice(-8)}</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progress}>
        {phases.map((phase, index) => <View key={phase} style={styles.phase}><View style={[styles.phaseDot, index <= current && styles.phaseDotActive]}>{index < current ? <Ionicons name="checkmark" size={12} color={colors.white} /> : <Text style={[styles.phaseNumber, index <= current && { color: colors.white }]}>{index + 1}</Text>}</View><Text style={[styles.phaseLabel, index === current && { color: colors.green, fontWeight: '800' }]}>{phase}</Text>{index < phases.length - 1 ? <View style={[styles.phaseLine, index < current && { backgroundColor: colors.green }]} /> : null}</View>)}
      </ScrollView>
    </Card>
  );
}

function History({ view, busy, run }: { view: WorkflowView; busy: string | null; run: Run }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  const current = view.history.revisions.find((revision) => revision.isCurrent);
  const previous = [...view.history.revisions]
    .filter((revision) => !revision.isCurrent)
    .reverse();
  const isImportant = (action: string) => ['approve', 'checkout', 'rollback', 'reject', 'alternative', 'clarif'].some((part) => action.toLowerCase().includes(part));
  if (!current) return null;
  return (
    <Card>
      <SectionTitle icon="git-branch-outline" eyebrow="Decision history" title="Workflow revisions" trailing={<Chip>{view.history.revisions.length} steps</Chip>} />
      <View style={styles.revisionSpotlight}>
        <View style={styles.revisionSpotlightTop}>
          <View style={styles.revisionSpotlightIcon}><Ionicons name="navigate-circle-outline" size={24} color={colors.green} /></View>
          <View style={styles.flex}><Eyebrow>Current snapshot</Eyebrow><Text style={styles.revisionSpotlightTitle}>{current.label}</Text></View>
          <Chip selected>Current</Chip>
        </View>
        <Text style={styles.revisionSpotlightSummary}>{current.summary}</Text>
        <View style={styles.revisionMetaRow}>
          <Chip>{stateLabel(current.state)}</Chip>
          <Chip>Step {current.sequence}</Chip>
          {isImportant(current.action) ? <Chip tone={colors.amber}>Key decision</Chip> : null}
          {current.rollbackFromRevisionId ? <Chip tone={colors.violet}>Rollback branch</Chip> : null}
        </View>
        <Text style={styles.revisionTime}>{dateTime(current.createdAt)}</Text>
      </View>
      {previous.length ? (
        <View style={styles.revisionHistory}>
          <View style={styles.revisionHistoryHeading}><Text style={styles.revisionHistoryTitle}>Earlier decisions</Text><Text style={styles.revisionHistoryHint}>Full history · newest first</Text></View>
          {previous.map((revision, index) => (
            <View key={revision.id} style={styles.revisionRow}>
              <View style={styles.revisionRail}>
                <View style={[styles.revisionDot, isImportant(revision.action) && styles.revisionDotImportant]} />
                {index < previous.length - 1 ? <View style={styles.revisionLine} /> : null}
              </View>
              <View style={[styles.revisionBody, isImportant(revision.action) && styles.revisionBodyImportant]}>
                <View style={styles.revisionTop}>
                  <View style={styles.flex}><Text style={styles.revisionLabel}>{revision.label}</Text><Text style={styles.revisionAction}>{titleCase(revision.action)}</Text></View>
                  <Text style={styles.revisionSequence}>#{revision.sequence}</Text>
                </View>
                <Text style={styles.revisionSummary}>{revision.summary}</Text>
                <View style={styles.revisionMetaRow}>
                  <Chip>{stateLabel(revision.state)}</Chip>
                  {isImportant(revision.action) ? <Chip tone={colors.amber}>Key decision</Chip> : null}
                  {revision.rollbackFromRevisionId ? <Chip tone={colors.violet}>Rollback</Chip> : null}
                </View>
                <Text style={styles.revisionTime}>{dateTime(revision.createdAt)}</Text>
                {view.workflow.availableActions.includes('rollback') && revision.canRollback ? (
                  <AppButton compact tone="secondary" label="Restore this version" icon="arrow-undo-outline" busy={busy === `rollback-${revision.id}`} disabled={Boolean(busy)} onPress={() => run(`rollback-${revision.id}`, () => rollbackWorkflow(view.workflow.id, revision.id))} />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function RequestSummary({ view }: { view: WorkflowView }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  const c = view.constraints;
  const rows = c ? [
    ['Category', c.productCategory], ['Budget', c.budgetMax ? money(c.budgetMax) : null],
    ['Delivery', c.deliveryDeadline ? titleCase(c.deliveryDeadline) : null], ['Compatibility', c.compatibility?.join(', ') || null],
    ['Must have', c.mustHave?.join(', ') || null], ['Returns', c.requiredReturnDays ? `${c.requiredReturnDays}+ days` : null],
  ].filter((row): row is string[] => Boolean(row[1])) : [];
  return <Card><SectionTitle icon="sparkles-outline" eyebrow="Your request" title="What the agent understood" /><Text style={styles.quote}>“{view.workflow.prompt}”</Text>{rows.length ? <View style={styles.factGrid}>{rows.map(([label, value]) => <View key={label} style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>)}</View> : null}</Card>;
}

function Comparison({ view, busy, run }: { view: WorkflowView; busy: string | null; run: Run }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors); const comparison = view.comparison;
  if (!comparison) return null;
  return (
    <Card><SectionTitle icon="options-outline" eyebrow="Evidence & tradeoffs" title="Offer comparison" trailing={<Chip selected>{Math.round(comparison.confidence * 100)}%</Chip>} /><Text style={styles.body}>{comparison.summary}</Text><Text style={styles.caption}>Confidence summarizes available catalog evidence; it is not a guarantee.</Text>
      <View style={styles.offerList}>{comparison.rankedOffers.slice(0, 3).map((offer) => {
        const best = offer.offerId === comparison.bestOfferId; const selected = offer.offerId === view.proposal?.offerId;
        return <View key={offer.offerId} style={[styles.offer, best && styles.offerBest, selected && { borderColor: colors.green }]}><View style={styles.offerTop}><View style={styles.rank}><Text style={styles.rankText}>#{offer.rank}</Text></View><View style={styles.flex}><Text style={styles.offerTitle}>{offer.title}</Text><View style={styles.tags}>{best ? <Chip>AI pick</Chip> : null}{selected ? <Chip selected>Your choice</Chip> : null}</View></View><Text style={styles.offerPrice}>{money(offer.total)}</Text></View>{offer.reasons.map((reason) => <Text key={reason} style={styles.positive}>✓ {reason}</Text>)}{offer.tradeoffs.map((reason) => <Text key={reason} style={styles.tradeoff}>△ {reason}</Text>)}{view.workflow.availableActions.includes('select_offer') ? <AppButton compact tone={selected ? 'quiet' : 'secondary'} label={selected ? 'Selected' : 'Choose offer'} busy={busy === `select-${offer.offerId}`} disabled={Boolean(busy) || selected} onPress={() => run(`select-${offer.offerId}`, () => selectOffer(view.workflow.id, offer.offerId))} /> : null}</View>;
      })}</View>
    </Card>
  );
}

function PurchaseControl({ view }: { view: WorkflowView }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  const checks = [
    ['Current state', stateLabel(view.workflow.state)],
    ['Selected offer', view.proposal?.title ?? view.comparison?.rankedOffers.find((o) => o.offerId === view.comparison?.bestOfferId)?.title ?? 'Not selected'],
    ['Consent', view.approval ? 'Recorded and hash-bound' : view.proposal ? 'Waiting for your approval' : 'Not requested yet'],
    ['Checkout', view.order ? 'Order created' : view.checkout?.status ? titleCase(view.checkout.status) : 'Not executed'],
  ];
  return <Card><SectionTitle icon="shield-checkmark-outline" eyebrow="Purchase control" title="You stay in control" /><View style={styles.controlNow}><View style={styles.controlIcon}><Ionicons name="hand-left-outline" size={20} color={colors.green} /></View><View style={styles.flex}><Eyebrow>Now</Eyebrow><Text style={styles.controlTitle}>{view.workflow.availableActions.length ? 'Waiting at a safe checkpoint' : 'No action required'}</Text><Text style={styles.controlCopy}>{view.workflow.summary}</Text></View></View><Divider /><View style={styles.checks}>{checks.map(([label, value]) => <View key={label} style={styles.check}><Ionicons name="checkmark-circle-outline" size={17} color={colors.green} /><View style={styles.flex}><Text style={styles.checkLabel}>{label}</Text><Text style={styles.checkValue}>{value}</Text></View></View>)}</View><View style={styles.boundary}><Ionicons name="lock-closed-outline" size={18} color={colors.green} /><View style={styles.flex}><Text style={styles.boundaryTitle}>Consent boundary</Text><Text style={styles.boundaryText}>Approval records your decision. Checkout remains a separate, revalidated action.</Text></View></View><Text style={styles.updated}>Updated {dateTime(view.workflow.updatedAt)}</Text></Card>;
}

function EventTrail({ view }: { view: WorkflowView }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  return <Card><SectionTitle icon="list-outline" eyebrow="Trust trail" title="What happened" trailing={<Chip>{view.events.length} events</Chip>} /><View>{[...view.events].reverse().slice(0, 12).map((event, index) => <View key={event.id} style={styles.event}><View style={styles.eventRail}><View style={styles.eventDot} />{index < Math.min(view.events.length, 12) - 1 ? <View style={styles.eventLine} /> : null}</View><View style={styles.eventCopy}><View style={styles.eventMeta}><Text style={styles.eventModule}>{event.module}</Text><Text style={styles.eventDate}>{dateTime(event.createdAt)}</Text></View><Text style={styles.eventSummary}>{event.summary}</Text></View></View>)}</View></Card>;
}

function Centered({ title, copy, retry }: { title: string; copy: string; retry?: () => void }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  return <Page><AppHeader back /><View style={styles.center}><ActivityIndicator size="large" color={colors.green} /><Text style={styles.centerTitle}>{title}</Text><Text style={styles.centerCopy}>{copy}</Text>{retry ? <AppButton label="Try again" onPress={retry} /> : null}<AppButton label="Back home" tone="quiet" onPress={() => router.replace('/')} /></View></Page>;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 }, scroll: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 48 }, shell: { width: '100%', alignSelf: 'center', gap: 14 }, layout: { gap: 14 }, layoutWide: { flexDirection: 'row', alignItems: 'flex-start' }, mainColumn: { flex: 1.65, gap: 14 }, sideColumn: { flex: 1 }, sideColumnWide: { maxWidth: 380 },
    hero: { position: 'relative', overflow: 'hidden', padding: 22, borderColor: colors.lineStrong }, heroAccent: { position: 'absolute', top: 0, left: 22, right: 22, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.green }, heroTop: { marginTop: 5, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, heroTitle: { marginTop: 6, color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -1 }, meta: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 9 }, metaItem: { flexDirection: 'row', gap: 5 }, metaText: { color: colors.textFaint, fontSize: 9, fontWeight: '600' },
    progress: { marginTop: 22, paddingBottom: 3 }, phase: { width: 78, alignItems: 'center' }, phaseDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, phaseDotActive: { backgroundColor: colors.green, borderColor: colors.green }, phaseNumber: { color: colors.textFaint, fontSize: 9, fontWeight: '800' }, phaseLabel: { marginTop: 7, color: colors.textFaint, fontSize: 8, fontWeight: '700' }, phaseLine: { position: 'absolute', top: 13, left: 53, width: 50, height: 2, backgroundColor: colors.line },
    revisionSpotlight: { borderWidth: 1, borderColor: colors.green, borderRadius: 16, padding: 16, backgroundColor: colors.greenPale, gap: 11 }, revisionSpotlightTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, revisionSpotlightIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, revisionSpotlightTitle: { marginTop: 3, color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '800' }, revisionSpotlightSummary: { color: colors.text, fontSize: 12, lineHeight: 19, fontWeight: '600' }, revisionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, revisionTime: { color: colors.textFaint, fontSize: 8, fontWeight: '600' },
    revisionHistory: { marginTop: 20 }, revisionHistoryHeading: { marginBottom: 13, paddingTop: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, revisionHistoryTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, revisionHistoryHint: { color: colors.textFaint, fontSize: 8, fontWeight: '700' }, revisionRow: { flexDirection: 'row', minHeight: 96 }, revisionRail: { width: 22, alignItems: 'center' }, revisionDot: { width: 10, height: 10, marginTop: 18, borderRadius: 5, backgroundColor: colors.lineStrong }, revisionDotImportant: { backgroundColor: colors.amber }, revisionLine: { flex: 1, width: 1, marginVertical: 4, backgroundColor: colors.line }, revisionBody: { flex: 1, marginBottom: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, backgroundColor: colors.surface, gap: 8 }, revisionBodyImportant: { borderColor: colors.lineStrong, backgroundColor: colors.paper }, revisionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }, revisionSequence: { color: colors.textFaint, fontSize: 9, fontWeight: '800' }, revisionLabel: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800' }, revisionAction: { marginTop: 2, color: colors.green, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }, revisionSummary: { color: colors.textSoft, fontSize: 11, lineHeight: 17 },
    quote: { color: colors.textSoft, fontSize: 14, lineHeight: 22, fontStyle: 'italic' }, factGrid: { marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, fact: { minWidth: 130, flexGrow: 1, flexBasis: '45%', padding: 11, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, factLabel: { color: colors.textFaint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }, factValue: { marginTop: 4, color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: '700' },
    body: { color: colors.text, fontSize: 13, lineHeight: 21 }, caption: { marginTop: 5, color: colors.textFaint, fontSize: 9, lineHeight: 14 }, offerList: { marginTop: 14, gap: 9 }, offer: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 7 }, offerBest: { borderColor: colors.lineStrong, backgroundColor: colors.greenPale }, offerTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, rank: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, rankText: { color: colors.textSoft, fontSize: 9, fontWeight: '800' }, offerTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800' }, offerPrice: { color: colors.text, fontSize: 14, fontWeight: '800' }, tags: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, positive: { color: colors.green, fontSize: 10, lineHeight: 15 }, tradeoff: { color: colors.amber, fontSize: 10, lineHeight: 15 },
    controlNow: { flexDirection: 'row', gap: 10, padding: 13, borderRadius: 13, backgroundColor: colors.greenPale, marginBottom: 16 }, controlIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }, controlTitle: { marginTop: 2, color: colors.text, fontSize: 12, fontWeight: '800' }, controlCopy: { marginTop: 4, color: colors.textSoft, fontSize: 9, lineHeight: 14 }, checks: { marginVertical: 15, gap: 7 }, check: { flexDirection: 'row', gap: 7, padding: 9, borderRadius: 9, backgroundColor: colors.background }, checkLabel: { color: colors.textFaint, fontSize: 8, fontWeight: '700' }, checkValue: { marginTop: 2, color: colors.text, fontSize: 10, lineHeight: 14, fontWeight: '700' }, boundary: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: 11, backgroundColor: colors.greenPale }, boundaryTitle: { color: colors.text, fontSize: 10, fontWeight: '800' }, boundaryText: { marginTop: 3, color: colors.textSoft, fontSize: 9, lineHeight: 14 }, updated: { marginTop: 10, color: colors.textFaint, fontSize: 8, textAlign: 'right' },
    event: { minHeight: 56, flexDirection: 'row' }, eventRail: { width: 20, alignItems: 'center' }, eventDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4, backgroundColor: colors.green }, eventLine: { flex: 1, width: 1, marginVertical: 4, backgroundColor: colors.line }, eventCopy: { flex: 1, paddingBottom: 15 }, eventMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, eventModule: { color: colors.green, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }, eventDate: { color: colors.textFaint, fontSize: 8 }, eventSummary: { marginTop: 3, color: colors.text, fontSize: 11, lineHeight: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 13 }, centerTitle: { color: colors.text, fontSize: 25, fontWeight: '800', textAlign: 'center' }, centerCopy: { maxWidth: 480, color: colors.textSoft, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  });
}
