import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps, type ViewStyle, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClearCartTheme, type ThemeColors } from '@/providers/theme-provider';

type IconName = keyof typeof Ionicons.glyphMap;

export function Page({ children }: PropsWithChildren) {
  const { colors } = useClearCartTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom', 'left', 'right']}>{children}</SafeAreaView>;
}

export function AppHeader({ back = false }: { back?: boolean }) {
  const { colors, isDark, toggle } = useClearCartTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.logo}><Ionicons name="bag-check-outline" size={21} color={colors.white} /></View>
      )}
      <Pressable onPress={() => router.replace('/')} style={styles.brandCopy}>
        <Text style={styles.brand}>ClearCart</Text>
        <Text style={styles.brandSub}>TRUSTED BUYING AGENT</Text>
      </Pressable>
      <View style={styles.headerTrust}><Ionicons name="shield-checkmark-outline" size={14} color={colors.green} /><Text style={styles.headerTrustText}>Consent first</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle color theme" onPress={toggle} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={19} color={colors.text} />
      </Pressable>
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  const { colors } = useClearCartTheme();
  const styles = createStyles(colors);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Eyebrow({ children, color }: PropsWithChildren<{ color?: string }>) {
  const { colors } = useClearCartTheme();
  return <Text style={[createStyles(colors).eyebrow, color ? { color } : undefined]}>{children}</Text>;
}

export function SectionTitle({ icon, eyebrow, title, trailing }: { icon: IconName; eyebrow: string; title: string; trailing?: ReactNode }) {
  const { colors } = useClearCartTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.iconTile}><Ionicons name={icon} size={19} color={colors.green} /></View>
      <View style={styles.sectionHeadingCopy}><Eyebrow>{eyebrow}</Eyebrow><Text style={styles.sectionTitle}>{title}</Text></View>
      {trailing}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  tone?: 'primary' | 'secondary' | 'quiet' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export function AppButton({ label, onPress, icon, tone = 'primary', busy, disabled, compact, style }: ButtonProps) {
  const { colors } = useClearCartTheme();
  const styles = createStyles(colors);
  const inactive = disabled || busy;
  const foreground = tone === 'primary' ? colors.white : tone === 'danger' ? colors.red : tone === 'quiet' ? colors.textSoft : colors.text;
  return (
    <Pressable accessibilityRole="button" disabled={inactive} onPress={onPress} style={({ pressed }) => [
      styles.button, styles[`button_${tone}`], compact && styles.buttonCompact, inactive && styles.disabled, pressed && !inactive && styles.pressed, style,
    ]}>
      {busy ? <ActivityIndicator size="small" color={foreground} /> : icon ? <Ionicons name={icon} size={compact ? 15 : 18} color={foreground} /> : null}
      <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const { colors } = useClearCartTheme();
  const styles = createStyles(colors);
  return <TextInput placeholderTextColor={colors.textFaint} {...props} style={[styles.input, props.multiline && styles.textarea, props.style]} />;
}

export function Notice({ children, tone = 'error' }: PropsWithChildren<{ tone?: 'error' | 'warning' | 'success' }>) {
  const { colors } = useClearCartTheme();
  const styles = createStyles(colors);
  const color = tone === 'error' ? colors.red : tone === 'warning' ? colors.amber : colors.green;
  const icon: IconName = tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline';
  return <View style={[styles.notice, { borderColor: color }]}><Ionicons name={icon} size={17} color={color} /><Text style={[styles.noticeText, { color }]}>{children}</Text></View>;
}

export function Chip({ children, selected = false, onPress, tone }: PropsWithChildren<{ selected?: boolean; onPress?: () => void; tone?: string }>) {
  const { colors } = useClearCartTheme();
  const styles = createStyles(colors);
  const color = tone ?? colors.green;
  const body = <Text style={[styles.chipText, { color: selected ? colors.white : color }]}>{children}</Text>;
  const chipStyle = [styles.chip, { borderColor: color, backgroundColor: selected ? color : 'transparent' }];
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [chipStyle, pressed && styles.pressed]}>{body}</Pressable> : <View style={chipStyle}>{body}</View>;
}

export function Divider() {
  const { colors } = useClearCartTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: { minHeight: 68, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.background },
    logo: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#0B6B57', alignItems: 'center', justifyContent: 'center' },
    brandCopy: { flexShrink: 1 }, brand: { color: colors.text, fontSize: 18, lineHeight: 20, fontWeight: '800', letterSpacing: -0.6 },
    brandSub: { color: colors.textFaint, fontSize: 8, lineHeight: 12, fontWeight: '800', letterSpacing: 0.8 },
    headerTrust: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }, headerTrustText: { color: colors.textSoft, fontSize: 10, fontWeight: '700' },
    roundButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
    card: { borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 20, backgroundColor: colors.paper, shadowColor: '#12342A', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 9 }, elevation: 3 },
    eyebrow: { color: colors.green, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }, iconTile: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale },
    sectionHeadingCopy: { flex: 1, gap: 2 }, sectionTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.5 },
    button: { minHeight: 50, borderRadius: 14, paddingHorizontal: 19, paddingVertical: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    button_primary: { borderColor: '#0B6B57', backgroundColor: '#0B6B57' }, button_secondary: { borderColor: colors.lineStrong, backgroundColor: colors.paper },
    button_quiet: { borderColor: 'transparent', backgroundColor: 'transparent' }, button_danger: { borderColor: colors.red, backgroundColor: 'transparent' },
    buttonCompact: { minHeight: 40, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11 }, buttonLabel: { fontSize: 12, fontWeight: '800' },
    input: { minHeight: 50, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, color: colors.text, backgroundColor: colors.background, fontSize: 14 },
    textarea: { minHeight: 118, textAlignVertical: 'top', lineHeight: 21 },
    notice: { borderWidth: 1, borderRadius: 11, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.surface }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
    chip: { minHeight: 34, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, justifyContent: 'center' }, chipText: { fontSize: 10, fontWeight: '800' },
    disabled: { opacity: 0.5 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });
}
