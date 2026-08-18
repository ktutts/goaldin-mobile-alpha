import React, { ReactNode, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type HapticType = 'light' | 'medium' | 'heavy' | 'none';

type PremiumPressableProps = {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  haptic?: HapticType;
  disabled?: boolean;
  goldGlow?: boolean;
};

export default function PremiumPressable({
  children,
  onPress,
  style,
  haptic = 'light',
  disabled = false,
  goldGlow = true,
}: PremiumPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  function animateDown() {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.975,
        useNativeDriver: false,
        speed: 40,
        bounciness: 0,
      }),
      Animated.timing(glow, {
        toValue: 1,
        duration: 90,
        useNativeDriver: false,
      }),
    ]).start();
  }

  function animateUp() {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: false,
        speed: 26,
        bounciness: 5,
      }),
      Animated.timing(glow, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      }),
    ]).start();
  }

  async function fireHaptic() {
    if (haptic === 'none') return;

    const intensity =
      haptic === 'heavy'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : haptic === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;

    try {
      await Haptics.impactAsync(intensity);
    } catch {
      // Haptics are optional. Do not block the action.
    }
  }

  function handlePress(event: GestureResponderEvent) {
    if (disabled) return;

    void fireHaptic();
    onPress?.(event);
  }

  const shadowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.04, goldGlow ? 0.32 : 0.08],
  });

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ scale }],
          shadowColor: goldGlow ? '#E8C55B' : '#000000',
          shadowOffset: { width: 0, height: 5 },
          shadowRadius: 16,
          shadowOpacity,
          elevation: goldGlow ? 5 : 2,
        },
      ]}
    >
      <Pressable
        disabled={disabled}
        onPress={handlePress}
        onPressIn={animateDown}
        onPressOut={animateUp}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}