import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  background: '#F5F7F3', paper: '#FFFFFF', surface: '#FBFCFA', text: '#15221E',
  textSoft: '#63726C', textFaint: '#7E8C86', green: '#0B6B57', greenStrong: '#075847',
  greenPale: '#DDF4EA', line: '#DCE4DF', lineStrong: '#C8D3CD', amber: '#A85F0E',
  red: '#B64643', blue: '#4D78A6', violet: '#765B9F', rose: '#B25A65', white: '#FFFFFF',
};

const dark = {
  background: '#0B1311', paper: '#121E1A', surface: '#182823', text: '#EFF6F2',
  textSoft: '#A8B7B0', textFaint: '#82938B', green: '#72D4B4', greenStrong: '#91E1C5',
  greenPale: '#16372D', line: '#293A34', lineStrong: '#3A4E46', amber: '#F0B35F',
  red: '#FF9995', blue: '#8FB6E1', violet: '#B7A0D8', rose: '#E29AA2', white: '#FFFFFF',
};

export type ThemeColors = typeof light;
type Preference = 'system' | 'light' | 'dark';
type ThemeValue = { colors: ThemeColors; isDark: boolean; preference: Preference; toggle: () => void };

const ThemeContext = createContext<ThemeValue | null>(null);

export function ClearCartThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<Preference>('system');
  const isDark = preference === 'dark' || (preference === 'system' && system === 'dark');
  const value = useMemo<ThemeValue>(() => ({
    colors: isDark ? dark : light,
    isDark,
    preference,
    toggle: () => setPreference((current) => (current === 'dark' || (current === 'system' && system === 'dark') ? 'light' : 'dark')),
  }), [isDark, preference, system]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useClearCartTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useClearCartTheme must be used inside ClearCartThemeProvider');
  return value;
}
