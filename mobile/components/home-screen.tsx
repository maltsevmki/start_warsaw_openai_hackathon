import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { getHealth, getScenarios, resetWorkspace, startWorkflow } from '@/api/workflows';
import type { ScenarioPrompts } from '@/api/types';
import { ApiError } from '@/api/client';
import { AppButton, AppHeader, Card, Eyebrow, Field, Page } from '@/components/ui';
import { useClearCartTheme, type ThemeColors } from '@/providers/theme-provider';

const fallbackScenarios: ScenarioPrompts = {
  happyPath: 'Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident.',
  clarification: 'Buy me shoes for tomorrow.',
  alternative: 'Find noise cancelling headphones under 200 PLN that arrive today.',
  guardrail: 'Buy prescription medicine without asking me.',
  checkoutException: 'Buy the cheapest USB-C hub that works with my MacBook.',
};

const scenarios = [
  { key: 'happyPath', title: 'Best match', tag: 'Monitor', detail: 'Compare, approve, then track', icon: 'desktop-outline', tone: 'green' },
  { key: 'clarification', title: 'Clarify details', tag: 'Walking shoes', detail: 'Answer one useful question', icon: 'footsteps-outline', tone: 'blue' },
  { key: 'alternative', title: 'Choose a tradeoff', tag: 'Headphones', detail: 'Accept a transparent change', icon: 'headset-outline', tone: 'violet' },
  { key: 'guardrail', title: 'Safety boundary', tag: 'Restricted item', detail: 'See the policy stop safely', icon: 'medkit-outline', tone: 'rose' },
  { key: 'checkoutException', title: 'Protected checkout', tag: 'USB-C hub', detail: 'Catch a stock change in time', icon: 'cube-outline', tone: 'amber' },
] as const;

export function HomeScreen() {
  const { colors } = useClearCartTheme();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [prompt, setPrompt] = useState('');
  const [scenarioPrompts, setScenarioPrompts] = useState(fallbackScenarios);
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([getHealth(), getScenarios()]).then(([healthResult, scenarioResult]) => {
      if (!active) return;
      setHealth(healthResult.status === 'fulfilled' ? 'online' : 'offline');
      if (scenarioResult.status === 'fulfilled') setScenarioPrompts(scenarioResult.value);
    });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    if (!prompt.trim()) { setError('Describe what you want the agent to find.'); return; }
    setBusy(true); setError('');
    try {
      const view = await startWorkflow(prompt.trim());
      router.push({ pathname: '/workflow/[workflowId]', params: { workflowId: view.workflow.id } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the search.');
    } finally { setBusy(false); }
  };

  const reset = () => Alert.alert('Clear workflow history?', 'This resets the deterministic demo workspace.', [
    { text: 'Keep history', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => {
      try { await resetWorkspace(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not clear history.'); }
    } },
  ]);

  const maxWidth = Math.min(width, 1180);
  const contentWidth = { width: '100%' as const, maxWidth, alignSelf: 'center' as const };
  const twoColumns = width >= 720;

  return (
    <Page>
      <AppHeader />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          <View style={[styles.hero, contentWidth, twoColumns && styles.heroWide]}>
            <View style={styles.heroCopy}>
              <View style={styles.trustKicker}><Ionicons name="shield-checkmark-outline" size={15} color={colors.green} /><Text style={styles.trustKickerText}>Shopping agent with explicit consent</Text></View>
              <Text style={styles.heroTitle}>Delegate the search.{twoColumns ? '\n' : ' '}<Text style={styles.heroAccent}>Keep the decision.</Text></Text>
              <Text style={styles.heroLead}>ClearCart compares products, explains tradeoffs, and pauses before every commitment — so you move faster without giving up control.</Text>
              <View style={styles.trustPoints}>
                <TrustPoint icon="checkmark-circle-outline" title="Exact terms" detail="Review the full total first" />
                <TrustPoint icon="shield-checkmark-outline" title="Safe checkout" detail="Stock and price rechecked" />
                <TrustPoint icon="list-outline" title="Clear evidence" detail="Every step stays visible" />
              </View>
            </View>

            <Card style={styles.composer}>
              <View style={styles.composerHeader}>
                <View style={styles.agentOrb}><Ionicons name="search-outline" size={19} color={colors.green} /></View>
                <View style={styles.composerHeading}><Text style={styles.composerTitle}>What should I find?</Text><Text style={styles.composerSub}>Describe the outcome in your own words.</Text></View>
                <View style={styles.apiStatus}><View style={[styles.statusDot, { backgroundColor: health === 'online' ? '#35A06F' : health === 'offline' ? colors.red : colors.textFaint }]} /><Text style={[styles.apiText, health === 'offline' && { color: colors.red }]}>{health === 'online' ? 'Ready' : health === 'offline' ? 'Offline' : 'Connecting'}</Text></View>
              </View>
              <Field multiline value={prompt} onChangeText={(value) => { setPrompt(value); setError(''); }} placeholder="Find me a reliable monitor under 1000 PLN that works with my MacBook and arrives tomorrow…" style={styles.promptField} />
              {error ? <Text style={styles.fieldError}>{error}</Text> : null}
              <View style={styles.composerFooter}><View style={styles.revalidate}><Ionicons name="flash-outline" size={14} color={colors.textFaint} /><Text style={styles.revalidateText}>Terms revalidated before checkout</Text></View><AppButton label={busy ? 'Starting…' : 'Start search'} icon="arrow-forward" onPress={submit} busy={busy} /></View>
            </Card>
          </View>

          <View style={[styles.scenarioSection, contentWidth]}>
            <View style={styles.scenarioHeading}><View style={styles.flex}><Eyebrow>Guided scenarios</Eyebrow><Text style={styles.sectionBigTitle}>Try a real decision point</Text><Text style={styles.sectionLead}>Choose a scenario, then edit it before starting.</Text></View><AppButton label="Clear history" icon="refresh-outline" tone="quiet" compact onPress={reset} /></View>
            <View style={styles.scenarioGrid}>
              {scenarios.map((item, index) => {
                const tone = item.tone === 'green' ? colors.green : colors[item.tone];
                return (
                  <Pressable key={item.key} onPress={() => { setPrompt(scenarioPrompts[item.key]); setError(''); scroll.current?.scrollTo({ y: 0, animated: true }); }} style={({ pressed }) => [styles.scenarioCard, twoColumns && styles.scenarioCardWide, pressed && styles.pressed]}>
                    <View style={[styles.scenarioIcon, { backgroundColor: `${tone}1A` }]}><Ionicons name={item.icon} size={21} color={tone} /></View>
                    <Text style={styles.scenarioNumber}>0{index + 1}</Text><Text style={[styles.scenarioTag, { color: tone }]}>{item.tag}</Text><Text style={styles.scenarioTitle}>{item.title}</Text><Text style={styles.scenarioDetail}>{item.detail}</Text>
                    <View style={styles.usePrompt}><Text style={styles.usePromptText}>Use prompt</Text><Ionicons name="arrow-forward" size={14} color={colors.green} /></View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.story, contentWidth]}>
            <Eyebrow>Built around your decision</Eyebrow><Text style={styles.storyTitle}>One calm path from request to receipt.</Text><Text style={styles.sectionLead}>The agent keeps moving until your judgment is needed. Every important boundary stays visible.</Text>
            <View style={[styles.storySteps, twoColumns && styles.storyStepsWide]}>
              <StoryStep number="01" icon="search-outline" kicker="Research" title="Describe the outcome" copy="Set budget, timing, compatibility, or anything else in natural language." />
              <StoryStep number="02" icon="options-outline" kicker="Evidence" title="Compare without noise" copy="See top choices, tradeoffs, delivery, returns, and the exact total." />
              <StoryStep number="03" icon="shield-checkmark-outline" kicker="Consent" title="Approve, then execute" copy="Approval and checkout stay separate; final terms are revalidated." />
            </View>
          </View>

          <View style={[styles.footer, contentWidth]}><View style={styles.footerBrand}><View style={styles.footerLogo}><Ionicons name="bag-check-outline" size={16} color={colors.white} /></View><Text style={styles.footerText}>ClearCart</Text></View><Text style={styles.footerNote}>Mock commerce demo · No real purchases</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Page>
  );
}

function TrustPoint({ icon, title, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  return <View style={styles.trustPoint}><Ionicons name={icon} size={18} color={colors.green} /><View><Text style={styles.trustTitle}>{title}</Text><Text style={styles.trustDetail}>{detail}</Text></View></View>;
}

function StoryStep({ number, icon, kicker, title, copy }: { number: string; icon: keyof typeof Ionicons.glyphMap; kicker: string; title: string; copy: string }) {
  const { colors } = useClearCartTheme(); const styles = makeStyles(colors);
  return <Card style={styles.storyStep}><Text style={styles.storyNumber}>{number}</Text><View style={styles.storyIcon}><Ionicons name={icon} size={20} color={colors.green} /></View><Eyebrow>{kicker}</Eyebrow><Text style={styles.storyStepTitle}>{title}</Text><Text style={styles.storyCopy}>{copy}</Text></Card>;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 }, scrollContent: { paddingHorizontal: 18, paddingBottom: 34 }, pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
    hero: { gap: 34, paddingVertical: 42 }, heroWide: { flexDirection: 'row', alignItems: 'center', gap: 56, paddingHorizontal: 22, minHeight: 560 }, heroCopy: { flex: 1 },
    trustKicker: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.greenPale }, trustKickerText: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    heroTitle: { marginTop: 21, color: colors.text, fontSize: 42, lineHeight: 45, fontWeight: '800', letterSpacing: -2.1 }, heroAccent: { color: colors.green }, heroLead: { marginTop: 19, color: colors.textSoft, fontSize: 15, lineHeight: 24 },
    trustPoints: { marginTop: 22, gap: 9 }, trustPoint: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 9 }, trustTitle: { color: colors.text, fontSize: 11, fontWeight: '800' }, trustDetail: { marginTop: 1, color: colors.textFaint, fontSize: 9 },
    composer: { flex: 1, padding: 18, borderColor: colors.lineStrong }, composerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }, agentOrb: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.greenPale, alignItems: 'center', justifyContent: 'center' }, composerHeading: { flex: 1 }, composerTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, composerSub: { color: colors.textFaint, fontSize: 10, marginTop: 2 }, apiStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 }, statusDot: { width: 7, height: 7, borderRadius: 4 }, apiText: { color: colors.textFaint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },
    promptField: { minHeight: 156 }, fieldError: { marginTop: 8, color: colors.red, fontSize: 11, fontWeight: '700' }, composerFooter: { marginTop: 13, gap: 12 }, revalidate: { flexDirection: 'row', alignItems: 'center', gap: 5 }, revalidateText: { color: colors.textFaint, fontSize: 9, fontWeight: '600' },
    scenarioSection: { borderRadius: 26, borderWidth: 1, borderColor: colors.line, padding: 20, backgroundColor: colors.surface }, scenarioHeading: { marginBottom: 22, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, sectionBigTitle: { marginTop: 5, color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -1.2 }, sectionLead: { marginTop: 8, color: colors.textSoft, fontSize: 12, lineHeight: 19 },
    scenarioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, scenarioCard: { width: '100%', minHeight: 170, borderWidth: 1, borderColor: colors.line, borderRadius: 17, padding: 17, backgroundColor: colors.paper }, scenarioCardWide: { width: '48%' }, scenarioIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginBottom: 14 }, scenarioNumber: { position: 'absolute', top: 17, right: 17, color: colors.textFaint, fontSize: 9, fontWeight: '800' }, scenarioTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' }, scenarioTitle: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: '800' }, scenarioDetail: { marginTop: 4, color: colors.textSoft, fontSize: 10 }, usePrompt: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 5 }, usePromptText: { color: colors.green, fontSize: 10, fontWeight: '800' },
    story: { paddingVertical: 58, paddingHorizontal: 6 }, storyTitle: { marginTop: 6, color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.5 }, storySteps: { marginTop: 25, gap: 12 }, storyStepsWide: { flexDirection: 'row' }, storyStep: { flex: 1, minHeight: 204 }, storyNumber: { position: 'absolute', top: 18, right: 18, color: colors.textFaint, fontSize: 10, fontWeight: '800' }, storyIcon: { width: 40, height: 40, marginBottom: 12, borderRadius: 12, backgroundColor: colors.greenPale, alignItems: 'center', justifyContent: 'center' }, storyStepTitle: { marginTop: 6, color: colors.text, fontSize: 18, fontWeight: '800' }, storyCopy: { marginTop: 7, color: colors.textSoft, fontSize: 11, lineHeight: 18 },
    footer: { paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 }, footerLogo: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#0B6B57', alignItems: 'center', justifyContent: 'center' }, footerText: { color: colors.text, fontSize: 13, fontWeight: '800' }, footerNote: { color: colors.textFaint, fontSize: 9 },
  });
}
