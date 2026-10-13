import React, { useEffect, useRef, useState } from 'react';import {
  ActivityIndicator,
  AppState,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  saveTimerState,
  clearTimerState,
  loadTimerState,
} from '../../../lib/smartTools/timerStorage';import { saveActivitySession } from '../../../lib/smartTools/saveActivitySession';
import { completeNextMove as completeNextMoveEngine } from '../../../lib/completeNextMove';
import type { ActivitySession } from '../../../lib/smartTools/types';
import {
  scheduleTimerNotification,
  cancelTimerNotifications,
} from '../../../lib/smartTools/timerNotifications';
import { useAudioPlayer } from 'expo-audio';
import {
  startActivitySession,
  stopActivitySession,
} from '../../../lib/smartTools/activitySession';

type ProgressEntryType = 'result' | 'learned' | 'decision' | 'blocker' | 'note';

const PROGRESS_TYPES: ProgressEntryType[] = ['result', 'learned', 'decision', 'blocker', 'note'];

const G = '#D8B24A';

export default function MilestoneWorkspace() {
  const timerAlarm = useAudioPlayer(
  require('../../../assets/sounds/timer-alarm.wav')
);
  const params = useLocalSearchParams<{ milestoneId: string }>();
  const milestoneId = params.milestoneId;

  // data
  const [milestone, setMilestone] = useState<any>(null);
  const [nextMove, setNextMove] = useState<any>(null);
  const [activitySession, setActivitySession] = useState<ActivitySession | null>(null);
  const activitySessionRef = useRef<ActivitySession | null>(null);
  const moveText = String(nextMove?.title ?? '').toLowerCase();

const suggestTimer =
  /\b(workout|exercise|run|walk|stretch|meditate|practice|study|cook|bake|roast|rest|wait|interval|session)\b/.test(moveText);
  const [progressEntries, setProgressEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // saving flags
  const [savingStep, setSavingStep] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [completing, setCompleting] = useState(false);

  // record progress form
  const [progressText, setProgressText] = useState('');
  const [progressType, setProgressType] = useState<ProgressEntryType>('note');

  // timer (uses an end time so it stays correct if the app is backgrounded)
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState('10');
  const [timerSeconds, setTimerSeconds] = useState('0');
  const [endAt, setEndAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerDone, setTimerDone] = useState(false);

  useEffect(() => {
    if (!endAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setEndAt(null);
        setTimerDone(true);
        Vibration.vibrate(400);
        timerAlarm.seekTo(0);
timerAlarm.play();
        void clearTimerState().catch((error) => {
  console.error('Could not clear completed timer:', error);
});
       const current = activitySessionRef.current;

if (current && current.status !== 'completed') {
  const completed = stopActivitySession(current);

  activitySessionRef.current = completed;
  setActivitySession(completed);

  void saveActivitySession(completed).catch((error) => {
    console.error('Could not save completed activity:', error);
    Alert.alert(
      'Activity not saved',
      'Your timer finished, but the activity record could not be saved.'
    );
  });
}

  
        Vibration.vibrate([0, 400, 200, 400]);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endAt]);
useEffect(() => {
  const subscription = AppState.addEventListener(
    'change',
    (state) => {
      if (state === 'active' && endAt) {
        const remaining = Math.max(
          0,
          Math.ceil((endAt - Date.now()) / 1000)
        );

        setSecondsLeft(remaining);
      }
    }
  );

  return () => subscription.remove();
}, [endAt]);
useEffect(() => {
  let cancelled = false;

  async function recoverTimer() {
    try {
      const saved = await loadTimerState();

      if (cancelled || !saved) return;

      if (saved.session.milestoneId !== milestoneId) return;
      if (saved.session.status !== 'active') return;

      const remaining = Math.max(
        0,
        Math.ceil((saved.endAt - Date.now()) / 1000)
      );

      if (remaining === 0) {
  const finished = stopActivitySession(
    saved.session,
    new Date(saved.endAt).toISOString()
  );

  await saveActivitySession(finished);
  await clearTimerState();

  if (cancelled) return;

  activitySessionRef.current = finished;
  setActivitySession(finished);
  setSecondsLeft(0);
  setEndAt(null);
  setTimerDone(true);

  return;
}

      activitySessionRef.current = saved.session;
      setActivitySession(saved.session);
      setSecondsLeft(remaining);
      setEndAt(saved.endAt);
      setTimerDone(false);
    } catch (error) {
      console.error('Could not recover timer:', error);
    }
  }

  void recoverTimer();

  return () => {
    cancelled = true;
  };
}, [milestoneId]);
  // load the milestone, its pending Next Move, and its progress entries
  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      if (!milestoneId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const { data: milestoneData, error: milestoneError } = await supabase
          .from('milestones')
          .select('*')
          .eq('id', milestoneId)
          .single();
        if (milestoneError) throw milestoneError;

        const { data: moveData, error: moveError } = await supabase
          .from('actions')
          .select('*')
          .eq('milestone_id', milestoneId)
          .eq('status', 'pending')
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (moveError) throw moveError;

        const { data: progressData, error: progressError } = await supabase
          .from('progress_entries')
          .select('*')
          .eq('milestone_id', milestoneId)
          .order('created_at', { ascending: false });
        if (progressError) console.error('Could not load progress entries:', progressError);

        if (cancelled) return;
        setMilestone(milestoneData);
        setNextMove(moveData);
        setProgressEntries(progressError ? [] : progressData ?? []);
      } catch (err: any) {
        console.error('Milestone workspace load error:', err);
        if (!cancelled) setError(err?.message ?? 'Could not load milestone workspace.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [milestoneId]);

  /* ---------- actions ---------- */

  async function toggleStep(step: string) {
    if (!nextMove || savingStep) return;

    const before: string[] = Array.isArray(nextMove.completed_steps) ? nextMove.completed_steps : [];
    const after = before.includes(step) ? before.filter((x) => x !== step) : [...before, step];

    setNextMove((m: any) => ({ ...m, completed_steps: after })); // update the screen immediately
    setSavingStep(true);

    const { error: saveError } = await supabase
      .from('actions')
      .update({ completed_steps: after })
      .eq('id', nextMove.id);

    setSavingStep(false);

    if (saveError) {
      console.error('Could not save completed step:', saveError);
      setNextMove((m: any) => ({ ...m, completed_steps: before })); // put it back
      Alert.alert('Could not save', 'That step was not saved. Please try again.');
    }
  }

  async function completeNextMove() {
    if (!nextMove || completing) return;
    setCompleting(true);
    try {
      await completeNextMoveEngine(nextMove.id);
      router.back();
    } catch (err: any) {
      console.error('Could not complete Next Move:', err);
      Alert.alert('Could not complete', err?.message || 'Please try again.');
      setCompleting(false);
    }
  }

  async function recordProgress() {
    const content = progressText.trim();
    if (!content || !milestone || savingProgress) return;

    setSavingProgress(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error('No signed-in user.');

      const { data, error: insertError } = await supabase
        .from('progress_entries')
        .insert({
          user_id: user.id,
          goal_id: milestone.goal_id,
          milestone_id: milestone.id,
          action_id: nextMove?.id ?? null,
          entry_type: progressType,
          content,
        })
        .select('*')
        .single();
      if (insertError) throw insertError;

      setProgressEntries((current) => [data, ...current]);
      setProgressText(''); // clear the box (this used to be set to the word "note")

      // A blocker is the cue for the Coach to reassess the Next Move. That call would go here.
    } catch (err: any) {
      console.error('Could not record progress:', err);
      Alert.alert('Could not record', err?.message || 'Please try again.');
    } finally {
      setSavingProgress(false);
    }
  }

  function startTimer() {
    const minutes = Number(timerMinutes || 0);
const seconds = Number(timerSeconds || 0);
const totalSeconds = minutes * 60 + seconds;

if (
  !Number.isFinite(totalSeconds) ||
  totalSeconds <= 0 ||
  seconds < 0 ||
  seconds > 59
) return;
    if (nextMove && milestone) {
  const session: ActivitySession = {
    id: `${nextMove.id}-${Date.now()}`,
    goalId: milestone.goal_id,
    milestoneId: milestone.id,
    actionId: nextMove.id,
    status: 'ready',
    metrics: {},
  };

const startedSession = startActivitySession(session);
activitySessionRef.current = startedSession;
setActivitySession(startedSession);

void saveActivitySession(startedSession).catch((error) => {
  console.error('Could not save activity session:', error);
  Alert.alert(
    'Activity not saved',
    'Your timer is running, but the activity record could not be saved.'
  );
});}
    setTimerDone(false);
const finishTime = Date.now() + totalSeconds * 1000;
setEndAt(finishTime);
void scheduleTimerNotification(finishTime).catch((error) => {
  console.error('Could not schedule timer notification:', error);
});

if (activitySessionRef.current) {
  void saveTimerState({
    endAt: finishTime,
    session: activitySessionRef.current,
  }).catch((error) => {
    console.error('Could not preserve timer:', error);
    Alert.alert(
      'Timer recovery unavailable',
      'The timer is running, but it may not survive closing the app.'
    );
  });
}
    setShowTimerMenu(false);
  }

  function pauseTimer() {
   if (activitySession) {
  const completedSession = {
  ...activitySession,
  status: 'paused' as const,
};
activitySessionRef.current = completedSession;
  setActivitySession(completedSession);

  void saveActivitySession(completedSession).catch((error) => {
    console.error('Could not save completed activity:', error);
    Alert.alert(
      'Activity not saved',
      'Your activity ended, but its record could not be saved.'
    );
  });
}
    const remaining = endAt
  ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  : secondsLeft;

setSecondsLeft(remaining);
setEndAt(null);
void cancelTimerNotifications().catch((error) => {
  console.error('Could not cancel timer notification:', error);
});
setTimerDone(false);
    void clearTimerState().catch((error) => {
  console.error('Could not clear saved timer:', error);
});
  }
function resumeTimer() {
  if (secondsLeft <= 0) return;
if (activitySession) {
  const resumedSession = {
    ...activitySession,
    status: 'active' as const,
  };

  activitySessionRef.current = resumedSession;
  setActivitySession(resumedSession);
}
  const finishTime = Date.now() + secondsLeft * 1000;

  setTimerDone(false);
  setEndAt(finishTime);
  void cancelTimerNotifications()
  .then(() => scheduleTimerNotification(finishTime))
  .catch((error) => {
    console.error('Could not schedule resumed timer notification:', error);
  });
  if (activitySessionRef.current) {
  void saveTimerState({
    endAt: finishTime,
    session: activitySessionRef.current,
  }).catch((error) => {
    console.error('Could not save resumed timer:', error);
  });
}
}
  /* ---------- states ---------- */

  if (loading) {
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <ActivityIndicator color={G} />
        <Text style={s.loadingText}>Loading workspace...</Text>
      </SafeAreaView>
    );
  }

  if (error || !milestone) {
    return (
      <SafeAreaView style={[s.page, { padding: 18 }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={s.backPlain}>← BACK</Text>
        </Pressable>
        <Text style={s.errTitle}>Workspace unavailable</Text>
        <Text style={s.errText}>{error ?? 'Milestone not found.'}</Text>
      </SafeAreaView>
    );
  }

  /* ---------- derived ---------- */

  const steps: string[] = Array.isArray(nextMove?.steps) ? nextMove.steps : [];
  const completedSteps: string[] = Array.isArray(nextMove?.completed_steps) ? nextMove.completed_steps : [];
  const completedStepCount = steps.filter((step) => completedSteps.includes(step)).length;
  const moveProgress = steps.length > 0 ? Math.round((completedStepCount / steps.length) * 100) : 0;
  const canRecord = !!progressText.trim() && !savingProgress;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>← YOUR PATH</Text>
        </Pressable>

        <Text style={s.kicker}>MILESTONE WORKSPACE</Text>
        <Text style={s.title}>{milestone.title}</Text>
        {milestone.description ? <Text style={s.desc}>{milestone.description}</Text> : null}

        <View style={s.divider} />

        <Text style={s.label}>CURRENT NEXT MOVE</Text>

        {nextMove ? (
          <View style={s.card}>
            <Text style={s.moveTitle}>{nextMove.title}</Text>

            {nextMove.estimated_minutes ? <Text style={s.minutes}>{nextMove.estimated_minutes} MIN</Text> : null}

            {steps.length > 0 ? (
              <View style={{ marginTop: 16, marginBottom: 4 }}>
                <View style={s.progressHead}>
                  <Text style={s.progressLabel}>MOVE PROGRESS</Text>
                  <Text style={s.progressCount}>
                    {completedStepCount}/{steps.length} · {moveProgress}%
                  </Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${moveProgress}%` }]} />
                </View>
              </View>
            ) : null}

            {steps.length > 0 ? (
              <View style={{ marginTop: 18 }}>
                {steps.map((step, index) => {
                  const done = completedSteps.includes(step);
                  return (
                    <Pressable key={`${index}-${step}`} onPress={() => void toggleStep(step)} style={s.stepRow}>
                      <View style={[s.stepBox, done && { backgroundColor: G }]}>
                        {done ? <Text style={s.stepCheck}>✓</Text> : null}
                      </View>
                      <Text style={[s.stepText, done && s.stepTextDone]}>{step}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {(steps.length === 0 || moveProgress >= 100) && (
              <Pressable onPress={() => void completeNextMove()} disabled={completing} style={[s.completeBtn, completing && { opacity: 0.6 }]}>
                <Text style={s.completeText}>{completing ? 'COMPLETING...' : 'COMPLETE NEXT MOVE'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.emptyText}>No pending Next Move for this milestone.</Text>
          </View>
        )}

        {/* tools */}
        <View style={{ marginTop: 20, marginBottom: 12 }}>
          <Text style={s.toolsTitle}>TOOLS & SOLUTIONS</Text>

          <Pressable
  onPress={() => setShowTimerMenu((c) => !c)}
  style={s.timerToggle}
>
  <Text style={s.timerToggleText}>
    {showTimerMenu
      ? 'CLOSE TIMER'
      : suggestTimer
        ? '⏱ SUGGESTED: SET TIMER'
        : 'SET TIMER'}
  </Text>
</Pressable>

          {showTimerMenu && (
            <View style={s.timerMenu}>
              <Text style={s.timerMenuLabel}>Timer duration (minutes)</Text>
              <TextInput
                value={timerMinutes}
                onChangeText={(v) => setTimerMinutes(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="#888888"
                style={s.timerInput}
              />
              <Text style={s.timerMenuLabel}>Seconds (0–59)</Text>
<TextInput
  value={timerSeconds}
  onChangeText={(v) =>
    setTimerSeconds(v.replace(/[^0-9]/g, ''))
  }
  keyboardType="number-pad"
  placeholder="0"
  placeholderTextColor="#888888"
  style={s.timerInput}
/>
              <Pressable onPress={startTimer} style={s.startBtn}>
                <Text style={s.startText}>START TIMER</Text>
              </Pressable>
            </View>
          )}
        </View>

       {(endAt !== null || timerDone || secondsLeft > 0) && (
          <View style={s.timerCard}>
            {timerDone ? (
              <Text style={s.timerDone}>Time's up.</Text>
            ) : (
              <Text style={s.timerClock}>{`${mm}:${ss}`}</Text>
            )}
            <Pressable
  onPress={
    timerDone
      ? pauseTimer
      : endAt !== null
        ? pauseTimer
        : resumeTimer
  }
  hitSlop={10}
  style={{ marginTop: 10 }}
>
  <Text style={s.timerPause}>
    {timerDone ? 'DISMISS' : endAt !== null ? 'PAUSE' : 'RESUME'}
  </Text>
</Pressable>
          </View>
        )}

        {/* record progress */}
        <View style={s.recordCard}>
          <Text style={s.recordTitle}>RECORD PROGRESS</Text>
          <Text style={s.recordHelp}>What happened? What did you learn or discover?</Text>

          <View style={s.chips}>
            {PROGRESS_TYPES.map((type) => {
              const selected = progressType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setProgressType(type)}
                  style={[s.chip, selected && { borderColor: G, backgroundColor: G }]}
                >
                  <Text style={[s.chipText, selected && { color: '#0B0B0B' }]}>{type.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={progressText}
            onChangeText={setProgressText}
            placeholder="Record a result, observation, decision, or lesson..."
            placeholderTextColor="#666666"
            multiline
            style={s.recordInput}
          />

          <Pressable onPress={() => void recordProgress()} disabled={!canRecord} style={[s.recordBtn, canRecord && { backgroundColor: G }]}>
            <Text style={[s.recordBtnText, canRecord && { color: '#0B0B0B' }]}>
              {savingProgress ? 'SAVING...' : 'RECORD PROGRESS'}
            </Text>
          </Pressable>
        </View>

        {progressEntries.length > 0 ? (
          <View style={{ marginTop: 24 }}>
            <Text style={s.recordedLabel}>RECORDED</Text>
            {progressEntries.map((entry) => (
              <View key={entry.id} style={s.entry}>
                <Text style={s.entryType}>{(entry.entry_type ?? 'note').toUpperCase()}</Text>
                <Text style={s.entryContent}>{entry.content}</Text>
                <Text style={s.entryDate}>{new Date(entry.created_at).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0B0B' },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 18, paddingBottom: 40 },
  loadingText: { color: '#8E8E93', marginTop: 12 },
  backPlain: { color: G, fontWeight: '900' },
  errTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 30 },
  errText: { color: '#8E8E93', marginTop: 10 },
  back: { marginTop: 24, marginBottom: 22, paddingVertical: 12, paddingHorizontal: 8, alignSelf: 'flex-start' },
  backText: { color: G, fontWeight: '900' },
  kicker: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', lineHeight: 31, marginTop: 10 },
  desc: { color: '#A5A5AA', fontSize: 15, lineHeight: 22, marginTop: 12 },
  divider: { height: 1, backgroundColor: '#302B20', marginVertical: 24 },
  label: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginBottom: 10 },
  card: { backgroundColor: '#111111', borderWidth: 1, borderColor: '#3A321F', borderRadius: 16, padding: 16 },
  moveTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', lineHeight: 24 },
  minutes: { color: G, fontSize: 12, fontWeight: '800', marginTop: 7 },
  emptyText: { color: '#FFFFFF', fontWeight: '800' },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  progressLabel: { color: '#8E8E93', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  progressCount: { color: G, fontSize: 12, fontWeight: '900' },
  track: { height: 6, backgroundColor: '#292929', borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: G, borderRadius: 999 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  stepBox: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: G, marginRight: 10, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  stepCheck: { color: '#0B0B0B', fontSize: 12, fontWeight: '900' },
  stepText: { flex: 1, color: '#D6D6D8', fontSize: 15, lineHeight: 21 },
  stepTextDone: { color: '#8E8E93', textDecorationLine: 'line-through' },
  completeBtn: { marginTop: 10, minHeight: 52, borderRadius: 12, backgroundColor: G, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  completeText: { color: '#0B0B0B', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  toolsTitle: { color: G, fontSize: 15, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
  timerToggle: { borderWidth: 1, borderColor: G, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  timerToggleText: { color: G, fontWeight: '900' },
  timerMenu: { marginBottom: 16, padding: 16, backgroundColor: '#111111', borderRadius: 12 },
  timerMenuLabel: { color: '#FFFFFF', marginBottom: 10 },
  timerInput: { color: '#FFFFFF', borderWidth: 1, borderColor: G, borderRadius: 8, padding: 12 },
  startBtn: { backgroundColor: G, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  startText: { color: '#0B0B0B', fontWeight: '900' },
  timerCard: { backgroundColor: '#111111', borderWidth: 1, borderColor: G, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  timerClock: { color: G, fontSize: 32, fontWeight: '900' },
  timerDone: { color: G, fontSize: 24, fontWeight: '900' },
  timerPause: { color: '#8E8E93', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  recordCard: { marginTop: 22, borderWidth: 1, borderColor: '#3A321F', borderRadius: 16, padding: 16, backgroundColor: '#111111' },
  recordTitle: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  recordHelp: { color: '#8E8E93', fontSize: 13, lineHeight: 19, marginTop: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#3A3426', backgroundColor: '#111111' },
  chipText: { color: '#A5A5AA', fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  recordInput: { marginTop: 14, minHeight: 100, borderWidth: 1, borderColor: '#3A3426', borderRadius: 12, padding: 12, color: '#FFFFFF', fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  recordBtn: { marginTop: 12, backgroundColor: '#393939', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  recordBtnText: { color: '#777777', fontWeight: '900', letterSpacing: 1 },
  recordedLabel: { color: '#8E8E93', fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginBottom: 10 },
  entry: { borderLeftWidth: 2, borderLeftColor: G, paddingLeft: 12, marginBottom: 18 },
  entryType: { color: G, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  entryContent: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  entryDate: { color: '#666666', fontSize: 11, marginTop: 6 },
});
