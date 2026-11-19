import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme, minTouch } from './theme';

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={styles.screen}>{children}</SafeAreaView>;
}

export function BigButton({
  label,
  onPress,
  onPressIn,
  onPressOut,
  color = theme.green,
  ink = theme.greenInk,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  color?: string;
  ink?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? '#A8A29E' : color, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'low' }) {
  const background = tone === 'low' ? theme.low : tone === 'warn' ? '#FEE2E2' : '#E7F5F0';
  const color = tone === 'low' ? theme.lowInk : tone === 'warn' ? theme.danger : theme.green;
  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <Text style={[styles.bannerText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  button: {
    minHeight: minTouch,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  banner: { borderRadius: 12, padding: 12 },
  bannerText: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
});
