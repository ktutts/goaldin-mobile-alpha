import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCapacityForDate, upsertCapacity } from '@/lib/capacity';
import {
  getSdkStatus,
  getGrantedPermissions,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  revokeAllPermissions,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

// Raw wearable observations stay on screen only. Saving a user-selected TODAY
// pace uses the app's existing capacity service. No automatic AI/health sync.
const BG = '#0B0B0D';
const GOLD = '#E8C36A';
const WHITE = '#F4F1EA';
const MUTED = '#A5A5A8';
const READ_PERMISSIONS = [
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
] as const;

type PermissionName = 'SleepSession' | 'RestingHeartRate' | 'HeartRateVariabilityRmssd';
type Availability = 'checking' | 'ready' | 'needs-update' | 'unavailable' | 'error';
type DataRow = {
  name: string;
  value: string;
  lastUpdated: string | null;
  source: string | null;
  state: 'data' | 'missing' | 'permission' | 'error';
};

const LABELS: { type: PermissionName; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'SleepSession', title: 'Sleep sessions', detail: 'Sleep-session window supplied by a connected app', icon: 'moon-outline' },
  { type: 'RestingHeartRate', title: 'Resting heart rate', detail: 'Recent resting beats per minute, when supplied', icon: 'heart-outline' },
  { type: 'HeartRateVariabilityRmssd', title: 'Heart-rate variability', detail: 'Recent HRV (RMSSD), when supplied', icon: 'pulse-outline' },
];

function hasReadPermission(granted: readonly { accessType: string; recordType: string }[], type: PermissionName): boolean {
  return granted.some((permission) => permission.accessType === 'read' && permission.recordType === type);
}
function formatDate(value: string | null): string {
  if (!value) return 'No timestamp supplied';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}
function timestamp(record: { time?: string; endTime?: string; startTime?: string }): string | null {
  return record.time ?? record.endTime ?? record.startTime ?? null;
}
function origin(record: { metadata?: { dataOrigin?: string } }): string | null {
  return record.metadata?.dataOrigin ?? null;
}
function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function HealthDataScreen() {
  const insets = useSafeAreaInsets();
  const [availability, setAvailability] = useState<Availability>('checking');
  const [granted, setGranted] = useState<Array<{ accessType: string; recordType: string }>>([]);
  const [busy, setBusy] = useState<'connecting' | 'reading' | 'checking' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<DataRow[] | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [selectedPace, setSelectedPace] = useState<'high' | 'medium' | 'low' | null>(null);
  const [paceSaving, setPaceSaving] = useState(false);
  const [paceMessage, setPaceMessage] = useState<string | null>(null);

  // This is the person's choice, not an algorithmic recovery verdict. A saved
  // choice is already supported by TODAY's capacity system.
  useEffect(() => {
    let alive = true;
    void getCapacityForDate().then((result) => {
      if (alive && result && (result.level === 'high' || result.level === 'medium' || result.level === 'low')) {
        setSelectedPace(result.level);
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const savePace = async (level: 'high' | 'medium' | 'low') => {
    if (paceSaving) return;
    setPaceSaving(true);
    setPaceMessage(null);
    try {
      // Store ONLY the manually chosen pace. Never upload raw Health Connect
      // observations or claim they produced a medical readiness score.
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const saved = await upsertCapacity({ date: localDate, level, source: 'manual', metadata: null });
      if (!saved) throw new Error('TODAY could not save your choice.');
      setSelectedPace(level);
      setPaceMessage('Your choice is saved for TODAY. The Coach can use this pace setting where its existing capacity support is enabled.');
    } catch (error) {
      setPaceMessage(`Pace was not saved: ${readableError(error)}`);
    } finally {
      setPaceSaving(false);
    }
  };

  const disconnect = () => {
    Alert.alert('Disconnect Health Connect?', 'This revokes this app’s Health Connect permissions. Your manual TODAY pace and other goal history are kept.', [
      { text: 'Keep connected', style: 'cancel' },
      { text: 'Revoke access', style: 'destructive', onPress: () => {
        void (async () => {
          setBusy('connecting');
          try {
            await revokeAllPermissions();
            setGranted([]);
            setMeasurements(null);
            setLastChecked(null);
            setMessage('Health Connect access revoked. No previously viewed records are kept on this screen.');
          } catch (error) {
            setMessage(`Could not revoke access: ${readableError(error)}`);
          } finally { setBusy(null); }
        })();
      } },
    ]);
  };

  // Check only device availability and previously granted permissions.
  // No health records are read until the user taps "READ RECENT DATA".
  const checkConnection = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setAvailability('unavailable');
      setMessage('This first integration is Android-only. Apple Health support will be a separate build.');
      return;
    }
    setBusy('checking');
    setMessage(null);
    try {
      const status = await getSdkStatus();
      if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
        setAvailability('needs-update');
        setMessage('Health Connect needs to be installed or updated on this device.');
        setGranted([]);
        return;
      }
      if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        setAvailability('unavailable');
        setGranted([]);
        setMessage('Health Connect is unavailable on this Android device or emulator.');
        return;
      }
      if (!(await initialize())) {
        setAvailability('error');
        setMessage('Health Connect is available but could not be initialized.');
        return;
      }
      setAvailability('ready');
      const current = await getGrantedPermissions();
      setGranted(current);
    } catch (error) {
      setAvailability('error');
      setMessage(`Connection check failed: ${readableError(error)}`);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void checkConnection(); }, [checkConnection]);

  const requestAccess = async () => {
    if (availability !== 'ready' || busy) return;
    setBusy('connecting');
    setMessage(null);
    setMeasurements(null);
    try {
      // Asking for read access is the only action performed by this button.
      const approved = await requestPermission([...READ_PERMISSIONS]);
      // Re-check the system's actual grants, not just the request result.
      const current = await getGrantedPermissions();
      const allowed = current.length ? current : approved;
      setGranted(allowed);
      const count = LABELS.filter((item) => hasReadPermission(allowed, item.type)).length;
      setMessage(count ? `Read access granted for ${count} of 3 data types. No records have been read yet.`
        : 'No permissions were granted. You can try again or manage access in Health Connect settings.');
    } catch (error) {
      setMessage(`Permission request failed: ${readableError(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const readRecentData = async () => {
    if (availability !== 'ready' || busy) return;
    setBusy('reading');
    setMessage(null);
    setMeasurements(null);
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const timeRangeFilter = { operator: 'between' as const, startTime: start.toISOString(), endTime: now.toISOString() };
    try {
      const current = await getGrantedPermissions();
      setGranted(current);
      const results: DataRow[] = [];
      for (const item of LABELS) {
        if (!hasReadPermission(current, item.type)) {
          results.push({ name: item.title, value: 'Access not granted', lastUpdated: null, source: null, state: 'permission' });
          continue;
        }
        try {
          let value = 'No records from the last 7 days';
          let lastUpdated: string | null = null;
          let source: string | null = null;
          let state: DataRow['state'] = 'missing';
          if (item.type === 'SleepSession') {
            const { records } = await readRecords('SleepSession', { timeRangeFilter });
            const latest = [...records].sort((a, b) => Date.parse(b.endTime) - Date.parse(a.endTime))[0];
            if (latest) {
              // Interval length is not necessarily time actually asleep.
              const minutes = Math.round((Date.parse(latest.endTime) - Date.parse(latest.startTime)) / 60000);
              value = Number.isFinite(minutes) && minutes >= 0
                ? `${Math.floor(minutes / 60)}h ${minutes % 60}m session length`
                : 'Sleep session available';
              lastUpdated = timestamp(latest);
              source = origin(latest);
              state = 'data';
            }
          } else if (item.type === 'RestingHeartRate') {
            const { records } = await readRecords('RestingHeartRate', { timeRangeFilter });
            const latest = [...records].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
            if (latest) {
              value = `${latest.beatsPerMinute} bpm`;
              lastUpdated = timestamp(latest);
              source = origin(latest);
              state = 'data';
            }
          } else {
            const { records } = await readRecords('HeartRateVariabilityRmssd', { timeRangeFilter });
            const latest = [...records].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
            if (latest) {
              value = `${Math.round(latest.heartRateVariabilityMillis)} ms (RMSSD)`;
              lastUpdated = timestamp(latest);
              source = origin(latest);
              state = 'data';
            }
          }
          results.push({ name: item.title, value, lastUpdated, source, state });
        } catch (error) {
          results.push({ name: item.title, value: readableError(error), lastUpdated: null, source: null, state: 'error' });
        }
      }
      setMeasurements(results);
      setLastChecked(new Date().toISOString());
      setMessage('Finished reading permitted records on this device. Nothing was uploaded or shared with the Coach.');
    } catch (error) {
      setMessage(`Could not check permissions: ${readableError(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const openSettings = () => {
    try { openHealthConnectSettings(); }
    catch (error) { setMessage(`Could not open Health Connect settings: ${readableError(error)}`); }
  };

  const grantsCount = LABELS.filter((item) => hasReadPermission(granted, item.type)).length;
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 44 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to Today">
          <Ionicons name="arrow-back" size={18} color={GOLD} />
          <Text style={styles.backText}>TODAY</Text>
        </Pressable>
        <View style={styles.eyebrowRow}>
          <Ionicons name="watch-outline" size={22} color={GOLD} />
          <Text style={styles.eyebrow}>GOAL'D IN · HEALTH DATA</Text>
        </View>
        <Text style={styles.title}>Better context.{ '\n' }Your call.</Text>
        <Text style={styles.intro}>Connect supported wearable measurements through Android Health Connect. Wearable records are only read when you ask. Your manually selected pace can be saved separately for TODAY.</Text>

        <View style={styles.panel}>
          <View style={styles.row}>
            <Ionicons name={availability === 'ready' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={21} color={GOLD} />
            <Text style={styles.panelTitle}>HEALTH CONNECT</Text>
          </View>
          {busy === 'checking' || availability === 'checking' ? (
            <ActivityIndicator color={GOLD} />
          ) : (
            <Text style={styles.status}>
              {availability === 'ready' ? `Available · ${grantsCount} of 3 read permissions granted`
                : availability === 'needs-update' ? 'An install or update is needed'
                  : availability === 'unavailable' ? 'Unavailable on this device'
                    : 'Connection needs attention'}
            </Text>
          )}
          <Pressable disabled={busy !== null} style={styles.textButton} onPress={() => void checkConnection()}>
            <Ionicons name="refresh-outline" size={16} color={GOLD} /><Text style={styles.link}>CHECK CONNECTION</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>AVAILABLE MEASUREMENTS</Text>
        {LABELS.map((item) => (
          <View key={item.type} style={styles.measurementRow}>
            <View style={styles.measurementIcon}><Ionicons name={item.icon} size={21} color={GOLD} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.measurementTitle}>{item.title}</Text>
              <Text style={styles.description}>{item.detail}</Text>
              <Text style={styles.permission}>{hasReadPermission(granted, item.type) ? 'READ ACCESS GRANTED' : 'NOT CONNECTED'}</Text>
            </View>
          </View>
        ))}

        <Pressable disabled={availability !== 'ready' || busy !== null} style={[styles.primary, (availability !== 'ready' || busy) && styles.disabled]} onPress={() => void requestAccess()}>
          {busy === 'connecting' ? <ActivityIndicator color={BG} /> : <Text style={styles.primaryText}>GRANT READ ACCESS →</Text>}
        </Pressable>
        <Text style={styles.helper}>This opens Android's permission request. You can decline or grant individual categories.</Text>
        <Pressable disabled={availability !== 'ready' || busy !== null || grantsCount === 0} style={[styles.secondary, (availability !== 'ready' || busy || grantsCount === 0) && styles.disabled]} onPress={() => void readRecentData()}>
          {busy === 'reading' ? <ActivityIndicator color={GOLD} /> : <Text style={styles.secondaryText}>READ RECENT DATA · 7 DAYS</Text>}
        </Pressable>

        {measurements && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>LATEST PERMITTED RECORDS</Text>
            {measurements.map((item) => (
              <View key={item.name} style={styles.result}>
                <Text style={styles.measurementTitle}>{item.name}</Text>
                <Text style={item.state === 'error' ? styles.errorText : styles.resultValue}>{item.value}</Text>
                {item.lastUpdated && <Text style={styles.description}>Recorded: {formatDate(item.lastUpdated)}</Text>}
                {item.source && <Text style={styles.description}>Data origin: {item.source}</Text>}
              </View>
            ))}
            <Text style={styles.helper}>Checked {formatDate(lastChecked)}. An empty result can be normal in the emulator. A sleep session length does not necessarily equal actual sleep time.</Text>
          </View>
        )}
        {message && <Text style={styles.message}>{message}</Text>}

        <View style={styles.pacePanel}>
          <View style={styles.row}>
            <Ionicons name="sparkles-outline" size={20} color={GOLD} />
            <Text style={styles.panelTitle}>YOUR CALL · TODAY'S PACE</Text>
          </View>
          <Text style={styles.paceTitle}>How much have you got today?</Text>
          <Text style={styles.description}>
            Use the measurements above as context if available, but trust how you're feeling, your time, and your priorities. No automatic readiness rating or imposed limits.
          </Text>
          <View style={styles.paceOptions}>
            {([
              { level: 'high' as const, title: 'PUSH', subtitle: 'I have more to give' },
              { level: 'medium' as const, title: 'STEADY', subtitle: 'Keep me moving' },
              { level: 'low' as const, title: 'LIGHT', subtitle: 'Small moves still count' },
            ]).map((choice) => (
              <Pressable
                key={choice.level}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedPace === choice.level, disabled: paceSaving }}
                disabled={paceSaving}
                style={[styles.paceChoice, selectedPace === choice.level && styles.paceSelected]}
                onPress={() => void savePace(choice.level)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.paceChoiceTitle}>{choice.title}</Text>
                  <Text style={styles.description}>{choice.subtitle}</Text>
                </View>
                <Ionicons name={selectedPace === choice.level ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={GOLD} />
              </Pressable>
            ))}
          </View>
          {paceSaving && <ActivityIndicator color={GOLD} />}
          {paceMessage && <Text style={styles.message}>{paceMessage}</Text>}
          <Text style={styles.helper}>Saving a pace updates your existing TODAY setting. Only your manual choice is saved through the app; no sleep or heart-rate values are transmitted to the Coach by this tool.</Text>
        </View>

        {grantsCount > 0 && (
          <Pressable style={styles.textButton} disabled={busy !== null} onPress={disconnect}>
            <Ionicons name="unlink-outline" size={17} color={GOLD} />
            <Text style={styles.link}>DISCONNECT · REVOKE HEALTH ACCESS</Text>
          </Pressable>
        )}
        <Pressable style={styles.textButton} onPress={openSettings}>
          <Ionicons name="settings-outline" size={17} color={GOLD} />
          <Text style={styles.link}>MANAGE OR REVOKE ACCESS IN HEALTH CONNECT</Text>
        </Pressable>
        <Text style={styles.privacy}>PRIVATE BY DEFAULT · No automatic wearable-data syncing, background monitoring, recovery scores, or AI access. Your manually chosen TODAY pace is saved through GOAL'D IN only when you tap a pace option. Wearable support depends on whether your device writes records to Health Connect.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 24, gap: 15 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, alignSelf: 'flex-start' },
  backText: { fontSize: 11, letterSpacing: 1.2, color: GOLD, fontWeight: '900' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  eyebrow: { fontSize: 11, color: GOLD, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 34, lineHeight: 42, color: WHITE, letterSpacing: -0.7, fontWeight: '800' },
  intro: { fontSize: 14, lineHeight: 22, color: '#B9B9BB', marginBottom: 10 },
  panel: { backgroundColor: '#171614', borderWidth: 1, borderColor: '#473A20', borderRadius: 20, padding: 18, gap: 12 },
  row: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  panelTitle: { fontSize: 11, color: GOLD, fontWeight: '900', letterSpacing: 1 },
  status: { color: WHITE, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12, alignSelf: 'flex-start' },
  link: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 0.25, flexShrink: 1 },
  section: { marginTop: 14, color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  measurementRow: { flexDirection: 'row', gap: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#262421' },
  measurementIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#242019', alignItems: 'center', justifyContent: 'center' },
  measurementTitle: { color: WHITE, fontSize: 15, fontWeight: '800' },
  description: { color: MUTED, fontSize: 12, marginTop: 4, lineHeight: 18 },
  permission: { color: GOLD, fontSize: 10, letterSpacing: 0.7, fontWeight: '800', marginTop: 8 },
  primary: { marginTop: 8, backgroundColor: GOLD, minHeight: 54, borderRadius: 13, justifyContent: 'center', alignItems: 'center', padding: 14 },
  primaryText: { color: '#111111', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  secondary: { backgroundColor: '#211E18', borderWidth: 1, borderColor: '#705A30', minHeight: 51, borderRadius: 13, justifyContent: 'center', alignItems: 'center', padding: 13 },
  secondaryText: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  disabled: { opacity: 0.48 },
  helper: { color: '#88888C', fontSize: 12, lineHeight: 18 },
  result: { borderTopWidth: 1, borderTopColor: '#33302A', paddingTop: 11, gap: 2 },
  resultValue: { color: GOLD, fontWeight: '700', fontSize: 15, lineHeight: 21 },
  errorText: { color: '#E7A49C', fontSize: 12 },
  message: { color: '#D2C29C', fontSize: 12, lineHeight: 19 },
  privacy: { color: '#88888C', fontSize: 12, lineHeight: 20, marginTop: 5 },
  pacePanel: { backgroundColor: '#171614', borderWidth: 1, borderColor: '#6A5327', borderRadius: 20, padding: 18, gap: 11, marginTop: 14 },
  paceTitle: { color: WHITE, fontSize: 20, fontWeight: '800', lineHeight: 27 },
  paceOptions: { gap: 9, marginTop: 6 },
  paceChoice: { flexDirection: 'row', alignItems: 'center', borderRadius: 13, backgroundColor: '#24221D', borderWidth: 1, borderColor: '#3C3529', paddingHorizontal: 13, paddingVertical: 11, gap: 10 },
  paceSelected: { borderColor: GOLD, backgroundColor: '#2E2717' },
  paceChoiceTitle: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});
