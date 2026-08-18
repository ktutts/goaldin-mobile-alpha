import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type CircularProgressProps = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
};

export default function CircularProgress({
  progress,
  size = 160,
  strokeWidth = 12,
  label = 'IN PROGRESS',
}: CircularProgressProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const strokeDashoffset =
    circumference - (safeProgress / 100) * circumference;

  const center = size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
        },
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient
            id="goldGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop offset="0%" stopColor="#8C6518" />
            <Stop offset="28%" stopColor="#D8B24A" />
            <Stop offset="52%" stopColor="#FFE58A" />
            <Stop offset="72%" stopColor="#D8B24A" />
            <Stop offset="100%" stopColor="#9B701C" />
          </LinearGradient>
        </Defs>

        {/* Background track */}
        <Circle
          stroke="#262626"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={radius}
          cx={center}
          cy={center}
        />

        {/* Gold progress */}
        <Circle
          stroke="url(#goldGradient)"
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          r={radius}
          cx={center}
          cy={center}
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>

      <View style={styles.center}>
        <View style={styles.percentRow}>
          <Text style={styles.number}>{Math.round(safeProgress)}</Text>
          <Text style={styles.percent}>%</Text>
        </View>

        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  percentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  number: {
    color: '#FFFFFF',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: -1.5,
  },

  percent: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 5,
    marginLeft: 2,
  },

  label: {
    color: '#D8B24A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginTop: 3,
  },
});