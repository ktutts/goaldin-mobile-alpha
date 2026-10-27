import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const GOLD = '#E9BB49';
const TRACK = '#3A3223';
const INK = '#F4F1E8';

/**
 * Goal-level ring: completed *planned milestones*, not percent of ultimate
 * goal achievement. A completed goal is the only state that renders 100%.
 * For lifelong practices the Goal Card renders its own infinity state.
 * This is separate from the startup readiness animation.
 */
export default function GoalStageRing({ completed, total, achieved, size = 104 }:
  { completed: number; total: number; achieved: boolean; size?: number }) {
  const count = Math.max(0, Math.floor(total));
  const done = Math.min(count, Math.max(0, Math.floor(completed)));
  const width = 9;
  const center = size / 2;
  const radius = (size - width - 3) / 2;
  const circumference = 2 * Math.PI * radius;
  // Leave one unfilled checkpoint for confirmation of the actual goal outcome.
  // This is visual stage tracking, not a % estimate of life/goal completion.
  const fraction = achieved ? 1 : count > 0 ? done / (count + 1) : 0;
  const offset = circumference * (1 - fraction);

  return (
    <View accessible accessibilityRole="text"
      accessibilityLabel={achieved ? 'Goal achieved' : count ? `${done} of ${count} currently planned milestones completed` : 'No milestones planned yet'}
      style={[styles.wrap, { width: size, height: size + 24 }]}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill}>
          <Circle cx={center} cy={center} r={radius} stroke={TRACK} strokeWidth={width} fill="none" />
          <Circle cx={center} cy={center} r={radius} stroke={GOLD}
            strokeWidth={width} fill="none" strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset} rotation={-90} origin={`${center}, ${center}`} />
        </Svg>
        <Text style={[styles.value, { fontSize: achieved ? 32 : count > 9 ? 24 : 28 }]}>
          {achieved ? '✓' : count ? `${done}/${count}` : '—'}
        </Text>
        <Text style={styles.inside}>{achieved ? 'ACHIEVED' : 'STAGES'}</Text>
      </View>
      <Text style={styles.caption}>{achieved ? "GOAL'D IN" : 'YOUR JOURNEY'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  value: { color: INK, fontWeight: '900', textAlign: 'center' },
  inside: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 2 },
  caption: { color: '#AAA39A', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginTop: 6, textAlign: 'center' },
});
