import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren } from 'react';

import { colors, shadows } from './theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

type CardProps = PropsWithChildren<{
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  color?: string;
  borderColor?: string;
  radius?: number;
}>;

export function GlassCard({
  children,
  style,
  contentStyle,
  color = 'rgba(255,255,255,0.82)',
  borderColor = colors.line,
  radius = 24,
}: CardProps) {
  return (
    <View style={[styles.cardShadow, { borderRadius: radius }, style]}>
      <View style={[styles.card, { backgroundColor: color, borderColor, borderRadius: radius }, contentStyle]}>{children}</View>
    </View>
  );
}

type PrimaryButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
};

export function PrimaryButton({ icon, label, onPress, filled = true }: PrimaryButtonProps) {
  const content = (
    <View style={styles.buttonInner}>
      <MaterialIcons name={icon} color={filled ? '#FFFFFF' : colors.deepViolet} size={24} />
      <Text style={[styles.buttonText, { color: filled ? '#FFFFFF' : colors.ink }]}>{label}</Text>
    </View>
  );

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {filled ? (
        <LinearGradient colors={[colors.deepViolet, '#24208A']} style={styles.buttonFill}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.buttonFill, styles.secondaryButton]}>{content}</View>
      )}
    </Pressable>
  );
}

export function HeaderIcon({ name, onPress }: { name: IconName; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <MaterialIcons name={name} size={28} color={colors.ink} />
    </Pressable>
  );
}

export function BrandTitle({ size = 27 }: { size?: number }) {
  return (
    <Text style={[styles.brand, { fontSize: size }]}>
      RateWise <Text style={styles.brandAccent}>AI</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    ...shadows.card,
  },
  card: {
    borderWidth: 1,
    padding: 20,
  },
  button: {
    width: '100%',
    height: 58,
    borderRadius: 28,
    overflow: 'hidden',
    ...shadows.button,
  },
  buttonFill: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
  },
  buttonInner: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '800',
    marginLeft: 12,
  },
  iconButton: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  brand: {
    color: colors.ink,
    fontWeight: '900',
  },
  brandAccent: {
    color: colors.violet,
  },
});
