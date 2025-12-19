import { ReactNode } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { Gradients } from '@/app/ui/theme';
import { GradientBackground } from './gradient-background';

type GradientButtonProps = PressableProps & {
  title?: string;
  children?: ReactNode;
  variant?: keyof typeof Gradients;
  size?: 'md' | 'sm';
  fullWidth?: boolean;
  textStyle?: StyleProp<TextStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function GradientButton({
  title,
  children,
  variant = 'cta',
  disabled,
  size = 'md',
  fullWidth = false,
  style,
  textStyle,
  contentStyle,
  ...pressableProps
}: GradientButtonProps) {
  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      style={({ pressed }) => {
        const base: StyleProp<ViewStyle>[] = [
          styles.pressable,
          size === 'sm' ? styles.pressableSm : styles.pressableMd,
          fullWidth && styles.fullWidth,
          pressed && !disabled && styles.pressablePressed,
          disabled && styles.pressableDisabled,
          style,
        ];
        return base;
      }}>
      <GradientBackground colors={Gradients[variant] ?? Gradients.cta} style={styles.background}>
        <View style={[styles.content, size === 'sm' && styles.contentSm, contentStyle]}>
          {children}
          {title ? (
            <Text style={[styles.text, size === 'sm' && styles.textSm, textStyle]}>{title}</Text>
          ) : null}
        </View>
      </GradientBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  pressableMd: {
    minHeight: 52,
  },
  pressableSm: {
    minHeight: 40,
  },
  pressablePressed: {
    transform: [{ scale: 0.97 }],
  },
  pressableDisabled: {
    opacity: 0.55,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  background: {
    borderRadius: 18,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  contentSm: {
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 14,
  },
});
