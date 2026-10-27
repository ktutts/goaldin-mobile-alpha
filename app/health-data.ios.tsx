/**
 * GOAL'D IN — Apple Health, iOS only.
 * Explicit, read-only access to three types of measurements.
 * No network uploads, background reads, or automatic coaching.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  isHealthDataAvailable,
  requestAuthorization,
  getMostRecentQuantitySample,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';

type Reading = { value: string; detail: string };
type RecordState = {
  sleep: Reading | null;
  restingHeartRate: Reading | null;
  hrv: Reading | null;
};

const GOLD = '#E9BC56';
const HEALTH_TYPES = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
] as const;

function quantityText(sample: { quantity?: number; unit?: string; endDate?: string | Date } | null | undefined, digits = 0): Reading | null {
  if (!sample || typeof sample.quantity !== 'number' || !Number.isFinite(sample.quantity)) return null;
  return {
    value: `${sample.quantity.toFixed(digits)} ${sample.unit || ''}`.trim(),
    detail: sample.endDate ? `Recorded ${new Date(sample.endDate).toLocaleString()}` : 'Latest available record',
  };
}

function Row({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.rowLabel}>{title}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Text style={styles.rowDetail}>{subtitle}</Text>
    </View>
  );
}

export default function HealthDataIOS() {
  const [loading, setLoading] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordState>({ sleep: null, restingHeartRate: null, hrv: null });

  const readHealth = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const available = await isHealthDataAvailable();
      if (!available) {
        Alert.alert('Apple Health unavailable', 'HealthKit is not available on this device. Use a physical, supported iPhone to test.');
        return;
      }
      // Never query a type before requesting permission for that type.
      await requestAuthorization({ toRead: [...HEALTH_TYPES] });
      setHasRequested(true);

      // Independent reads: absent or restricted types must not hide other measurements.
      const [sleepResult, heartResult, hrvResult] = await Promise.allSettled([
        queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 100 }),
        getMostRecentQuantitySample('HKQuantityTypeIdentifierRestingHeartRate'),
        getMostRecentQuantitySample('HKQuantityTypeIdentifierHeartRateVariabilitySDNN'),
      ]);

      let sleep: Reading | null = null;
      if (sleepResult.status === 'fulfilled') {
        const samples = Array.isArray(sleepResult.value) ? sleepResult.value : [];
        const pastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        // Category entries are fragments (awake/asleep/in-bed), NOT whole sleep sessions.
        const recent = samples.filter((s) => {
          const date = new Date(s.endDate);
          return Number.isFinite(date.getTime()) && date >= pastWeek;
        });
        if (recent.length > 0) {
          sleep = {
            value: `${recent.length} record${recent.length === 1 ? '' : 's'}`,
            detail: 'Sleep-stage/in-bed records in the last 7 days (not total sleep hours)',
          };
        }
      }

      setRecords({
        sleep,
        restingHeartRate: heartResult.status === 'fulfilled' ? quantityText(heartResult.value) : null,
        hrv: hrvResult.status === 'fulfilled' ? quantityText(hrvResult.value, 1) : null,
      });
      setLastChecked(new Date().toLocaleString());
    } catch (error) {
      Alert.alert('Could not read Apple Health', error instanceof Error ? error.message : 'Please check Apple Health permissions and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.goldText}>← BACK</Text>
      </Pressable>
      <Text style={styles.eyebrow}>GOAL'D IN · APPLE HEALTH</Text>
      <Text style={styles.title}>Better context.\nYour call.</Text>
      <Text style={styles.description}>
        Choose whether GOAL'D IN can read sleep records, resting heart rate, and heart-rate variability from Apple Health.
        Nothing is read until you tap below.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>CONNECT APPLE HEALTH</Text>
        <Text style={styles.small}>
          Read-only access. Your measurements stay on this phone in this test feature. They are not uploaded,
          shared with Circle, or sent to the Coach.
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Connect and read Apple Health" onPress={readHealth} disabled={loading} style={[styles.primary, loading && styles.dim]}>
          {loading ? <ActivityIndicator color="#101010" /> : <Text style={styles.primaryText}>{hasRequested ? 'READ RECENT DATA' : 'GRANT READ ACCESS'}</Text>}
        </Pressable>
        <Text style={styles.note}>You can deny individual categories or change access later in iPhone Settings / Health.</Text>
      </View>

      {lastChecked ? <Text style={styles.checked}>Checked {lastChecked}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>LATEST PERMITTED RECORDS</Text>
        <Row title="Sleep" value={records.sleep?.value ?? 'No records found'} subtitle={records.sleep?.detail ?? 'No matching data available, or read access was not granted'} />
        <Row title="Resting heart rate" value={records.restingHeartRate?.value ?? 'No records found'} subtitle={records.restingHeartRate?.detail ?? 'No matching data available, or read access was not granted'} />
        <Row title="Heart-rate variability (SDNN)" value={records.hrv?.value ?? 'No records found'} subtitle={records.hrv?.detail ?? 'No matching data available, or read access was not granted'} />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>YOU DECIDE TODAY'S PACE</Text>
        <Text style={styles.small}>Health measurements provide context, not a readiness score or medical advice. Your daily pace remains your choice.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  content: { paddingHorizontal: 22, paddingTop: 66, paddingBottom: 44, gap: 18 },
  back: { alignSelf: 'flex-start', marginBottom: 17 },
  goldText: { color: GOLD, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  eyebrow: { color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#FFFFFF', fontSize: 37, fontWeight: '800', lineHeight: 43 },
  description: { color: '#C7C0B5', fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: '#1E1B16', borderWidth: 1, borderColor: '#64502E', borderRadius: 20, padding: 20, gap: 14 },
  cardTitle: { color: GOLD, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  small: { color: '#C8C0B3', lineHeight: 21, fontSize: 14 },
  primary: { backgroundColor: GOLD, minHeight: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 10 },
  dim: { opacity: 0.7 },
  primaryText: { color: '#15110B', fontSize: 13, fontWeight: '900', letterSpacing: 0.7 },
  note: { color: '#9B9489', fontSize: 12, lineHeight: 18 },
  checked: { color: '#AE9865', fontSize: 12 },
  dataRow: { borderTopWidth: 1, borderTopColor: '#4B4132', paddingTop: 14, gap: 6 },
  rowLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  rowValue: { color: GOLD, fontSize: 20, fontWeight: '800' },
  rowDetail: { color: '#BDB6AC', fontSize: 12, lineHeight: 18 },
  notice: { padding: 18, borderRadius: 16, backgroundColor: '#161616', gap: 7 },
  noticeTitle: { color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});
