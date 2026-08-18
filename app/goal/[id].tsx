import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, Goal,Milestone } from '@/types/models';
import CircularProgress from '../../components/CircularProgress';

import {
  calculateGoalProgress,
  getAdaptiveMove,
} from '@/adaptivePlan';
const [milestones, setMilestones] =
  useState<Milestone[]>([]);
import {
  Capacity,
  DEFAULT_CAPACITY_LEVEL,
  capacityLabels,
  capacityTargetMinutes,
  getCapacityForDate,
} from '@/lib/capacity';
type StarterActionDraft = {
  title: string;
  description: string;
  estimated_minutes: number;
};

export default function GoalDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;

  const load = useCallback(async () => {
    if (!goalId) {
      setError('No goal was selected.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/');
      return;
    }

    const [goalRes, actionRes] = await Promise.all([
      supabase.from('goals').select('*').eq('id', goalId).eq('user_id', user.id).single(),
      supabase.from('actions').select('*').eq('goal_id', goalId).eq('user_id', user.id).order('position', { ascending: true }),
    ]);

    if (goalRes.error || !goalRes.data) {
      setError(goalRes.error?.message || 'Goal could not be loaded.');
      setGoal(null);
      setActions([]);
      setLoading(false);
      return;
    }

    setGoal(goalRes.data as Goal);
    setActions((actionRes.data || []) as Action[]);
    const currentCapacity = await getCapacityForDate();
    setCapacity(currentCapacity);
    setLoading(false);
  }, [goalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createStarterActions = useCallback(async () => {
    if (!goal || !goalId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const drafts = buildStarterActions(goal.title);
    const rows = drafts.map((draft, index) => ({
      goal_id: goal.id,
      user_id: user.id,
      title: draft.title,
      description: draft.description,
      status: 'pending' as const,
      position: index,
      estimated_minutes: draft.estimated_minutes,
    }));

    await supabase.from('actions').insert(rows);
    await load();
  }, [goal, goalId, load]);

  const handleDone = useCallback(async (action: Action) => {
    if (!goalId) return;

    const now = new Date().toISOString();
    await supabase.from('actions').update({ status: 'completed', completed_at: now }).eq('id', action.id);

    const updatedActions = actions.map((item) => item.id === action.id ? { ...item, status: 'completed' as const, completed_at: now } : item);
    const allCompleted = updatedActions.every((item) => item.status === 'completed');

    if (allCompleted) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          await supabase.from('goals').update({ status: 'completed', completed_at: now }).eq('id', goalId);
        } catch {
          await supabase.from('goals').update({ status: 'completed' }).eq('id', goalId);
        }

        const { data: existingWins } = await supabase.from('wins').select('id').eq('goal_id', goalId).eq('user_id', user.id).limit(1);
        if (!existingWins?.length) {
          await supabase.from('wins').insert({
            user_id: user.id,
            goal_id: goalId,
            title: goal?.title || 'Goal completed',
            summary: 'Completed in GOAL\'D IN',
          });
        }
        Alert.alert('WIN RECORDED', 'Nice work — this goal is marked complete.');
      }
    }

    await load();
  }, [actions, goal, goalId, load]);

  const handleLater = useCallback(async (action: Action) => {
    const nextPosition = Math.max(0, ...actions.map((item) => item.position)) + 1;
    await supabase.from('actions').update({ position: nextPosition }).eq('id', action.id);
    await load();
  }, [actions, load]);

  const handleMakeEasier = useCallback(async (action: Action) => {
    const preferredMinutes = capacityTargetMinutes[capacity?.level ?? DEFAULT_CAPACITY_LEVEL];
    const nextTitle = makeEasierTitle(action.title, preferredMinutes);
    await supabase.from('actions').update({ title: nextTitle, estimated_minutes: preferredMinutes }).eq('id', action.id);
    await load();
  }, [capacity?.level, load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#F0D06A" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.page}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Pressable style={s.backButton} onPress={() => router.back()}>
            <Text style={s.backText}>← BACK</Text>
          </Pressable>
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Could not load this goal</Text>
            <Text style={s.errorCopy}>{error}</Text>
            <Pressable style={s.button} onPress={() => router.replace('/today')}>
              <Text style={s.buttonText}>BACK TO TODAY</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!goal) {
    return null;
  }

  const completed = actions.filter((action) => action.status === 'completed').length;
  const total = actions.length || 1;
  const progress = Math.round((completed / total) * 100);
  const nextPending = actions.find((action) => action.status === 'pending');
  const hasActions = actions.length > 0;

  return (
   <SafeAreaView style={s.page} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Pressable style={s.backButton} onPress={() => router.back()}>
  <Text style={s.backText}>← BACK</Text>
</Pressable>

<Text style={s.brand}>GOAL'D IN</Text>

<View style={s.hero}>
  <Text style={s.eyebrow}>ACTIVE GOAL</Text>
  <Text style={s.title}>{goal.title}</Text>

  <View style={s.progressWrap}>
    <CircularProgress
      progress={progress}
      size={190}
      strokeWidth={13}
    />
  </View>

  <Text style={s.progressCaption}>
    {completed} OF {actions.length} MOVES COMPLETE
  </Text>

  <Text style={s.subtitle}>
    {capacity
      ? `TODAY · ${capacityLabels[capacity.level]}`
      : 'Capacity not set yet. Check in from Home.'}
  </Text>
</View>

<View style={s.nextMoveCard}>
  <Text style={s.nextMoveLabel}>⚡  YOUR NEXT MOVE</Text>

  {nextPending ? (
    <>
      <Text style={s.nextMoveTitle}>{nextPending.title}</Text>

      <Text style={s.nextMoveMeta}>
        {nextPending.estimated_minutes
          ? `${nextPending.estimated_minutes} MIN${capacity ? ` · ${capacityLabels[capacity.level]}` : ''}`
          : 'READY WHEN YOU ARE'}
      </Text>

      <Pressable
        style={s.startMoveButton}
        onPress={() => {
          // We'll wire timer/action behavior here next.
        }}
      >
        <Text style={s.startMoveText}>START MOVE  →</Text>
      </Pressable>
    </>
  ) : (
    <>
      <Text style={s.nextMoveTitle}>Goal complete.</Text>
      <Text style={s.nextMoveMeta}>YOU DID IT.</Text>
    </>
  )}
</View>

        {notice ? <View style={s.notice}><Text style={s.noticeText}>{notice}</Text></View> : null}

        {!hasActions ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>THIS GOAL NEEDS A NEXT MOVE</Text>
            <Pressable style={s.button} onPress={() => void createStarterActions()}>
              <Text style={s.buttonText}>BUILD MY NEXT MOVE</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.label}>ACTION CHECKLIST</Text>
            {actions.map((action) => {
              const statusLabel = action.status === 'completed' ? 'DONE' : action.status === 'pending' ? 'PENDING' : 'SKIPPED';
              const isPending = action.status === 'pending';

              return (
                <View key={action.id} style={s.actionRow}>
                  <View style={s.actionMeta}>
                    <Text style={s.actionTitle}>{action.title}</Text>
                    {action.description ? <Text style={s.actionDescription}>{action.description}</Text> : null}
                    {action.estimated_minutes ? <Text style={s.actionMinutes}>{action.estimated_minutes} min</Text> : null}
                  </View>
                  <View style={s.actionRight}>
                    <View style={[s.badge, action.status === 'completed' ? s.badgeDone : action.status === 'pending' ? s.badgePending : s.badgeSkipped]}>
                      <Text style={s.badgeText}>{statusLabel}</Text>
                    </View>
                    {isPending ? (
                      <View style={s.actionButtons}>
                        <Pressable style={s.smallButton} onPress={() => void handleDone(action)}>
                          <Text style={s.smallButtonText}>DONE</Text>
                        </Pressable>
                        <Pressable style={s.smallButtonSecondary} onPress={() => void handleLater(action)}>
                          <Text style={s.smallButtonText}>LATER</Text>
                        </Pressable>
                        <Pressable style={s.smallButtonSecondary} onPress={() => void handleMakeEasier(action)}>
                          <Text style={s.smallButtonText}>MAKE EASIER</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function buildStarterActions(title: string): StarterActionDraft[] {
  const normalized = title.toLowerCase();

  if (normalized.includes('laundry')) {
    return [
      { title: 'Gather the clean laundry', description: 'Collect the clothes that are ready to be put away.', estimated_minutes: 10 },
      { title: 'Put away hanging clothes', description: 'Hang up the shirts and other garments that belong in the closet.', estimated_minutes: 12 },
      { title: 'Fold and put away remaining clothes', description: 'Finish the rest of the laundry so the room feels reset.', estimated_minutes: 15 },
    ];
  }

  if (normalized.includes('workout') || normalized.includes('exercise')) {
    return [
      { title: 'Choose today\'s workout', description: 'Pick the routine that fits your energy and time.', estimated_minutes: 5 },
      { title: 'Complete the warm-up', description: 'Get your body moving before the main set.', estimated_minutes: 8 },
      { title: 'Finish the workout', description: 'Complete the main exercises and wrap up.', estimated_minutes: 20 },
    ];
  }

  if (normalized.includes('fort')) {
    return [
      { title: 'Choose the location and materials', description: 'Pick a spot and gather blankets, pillows, and supports.', estimated_minutes: 8 },
      { title: 'Build the main structure', description: 'Create the base of the fort.', estimated_minutes: 12 },
      { title: 'Add blankets, pillows, and finishing touches', description: 'Make it cozy and complete.', estimated_minutes: 10 },
    ];
  }

  return [
    { title: 'Decide what finished looks like', description: 'Clarify the result before you begin.', estimated_minutes: 8 },
    { title: 'Complete the first useful step', description: 'Start with the smallest meaningful action.', estimated_minutes: 10 },
    { title: 'Finish and check the result', description: 'Wrap up and confirm it is done.', estimated_minutes: 12 },
  ];
}

function makeEasierTitle(title: string, minutes: number) {
  const cleaned = title.replace(/^[0-9]+-minute\s+/i, '').trim();
  return `${minutes}-minute ${cleaned}`;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0B0D' },
  scroll: { padding: 24, paddingTop: 56, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0B0D' },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: '#D6AA3F', fontWeight: '900', letterSpacing: 1.5 },
  brand: { color: '#F0D06A', fontWeight: '900', letterSpacing: 3, marginBottom: 8 },
  title: { color: '#E5E5E5', fontSize: 32, fontWeight: '600', marginBottom: 6 },
  subtitle: { color: '#A9A9A9', fontSize: 12, letterSpacing: 2, marginBottom: 10, fontWeight: '800' },
  track: { height: 10, backgroundColor: '#18181B', borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  fill: { height: '100%', backgroundColor: '#D6AA3F' },
  progress: { color: '#E5E5E5', fontWeight: '800', marginBottom: 18 },
  panel: { backgroundColor: '#121214', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20 },
  label: { color: '#A9A9A9', fontSize: 11, letterSpacing: 1.5, fontWeight: '800', marginBottom: 8 },
  next: { color: '#E5E5E5', fontSize: 18, fontWeight: '700' },
  notice: { backgroundColor: '#18181B', padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(214,170,63,0.15)' },
  noticeText: { color: '#F0D06A', fontWeight: '800' },
  emptyCard: { backgroundColor: '#121214', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20 },
  emptyTitle: { color: '#E5E5E5', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  actionRow: { backgroundColor: '#18181B', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  actionMeta: { flex: 1, marginRight: 12 },
  actionTitle: { color: '#E5E5E5', fontWeight: '700', fontSize: 16 },
  actionDescription: { color: '#A9A9A9', marginTop: 4, lineHeight: 18 },
  actionMinutes: { color: '#F0D06A', marginTop: 6, fontWeight: '700' },
  actionRight: { alignItems: 'flex-end', gap: 8 },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  smallButton: { backgroundColor: '#F0D06A', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  smallButtonSecondary: { backgroundColor: '#1B1B1B', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  smallButtonText: { color: '#E5E5E5', fontWeight: '800', fontSize: 11 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeDone: { backgroundColor: '#D6AA3F' },
  badgePending: { backgroundColor: '#1B1B1B' },
  badgeSkipped: { backgroundColor: '#444' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  errorCard: { backgroundColor: '#121214', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  errorTitle: { color: '#E5E5E5', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  errorCopy: { color: '#A9A9A9', marginBottom: 16, lineHeight: 20 },
  button: { backgroundColor: '#F0D06A', padding: 14, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#090909', fontWeight: '900' },
hero: {
  marginTop: 22,
  marginBottom: 24,
},

eyebrow: {
  color: '#F0D06A',
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 1.5,
  marginBottom: 10,
},

progressWrap: {
  alignItems: 'center',
  marginTop: 26,
  marginBottom: 14,
},

progressCaption: {
  color: '#8D8D8D',
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 1.5,
  textAlign: 'center',
},

nextMoveCard: {
  backgroundColor: '#121214',
  borderWidth: 1,
  borderColor: 'rgba(214,170,63,0.15)',
  borderRadius: 24,
  padding: 22,
  marginBottom: 28,
},

nextMoveLabel: {
  color: '#F0D06A',
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 1.5,
  marginBottom: 14,
},

nextMoveTitle: {
  color: '#E5E5E5',
  fontSize: 25,
  lineHeight: 30,
  fontWeight: '700',
},

nextMoveMeta: {
  color: '#F0D06A',
  fontSize: 12,
  fontWeight: '800',
  letterSpacing: 1.3,
  marginTop: 8,
},

startMoveButton: {
  backgroundColor: '#F0D06A',
  minHeight: 56,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 20,
},

startMoveText: {
  color: '#090909',
  fontSize: 14,
  fontWeight: '900',
  letterSpacing: 1.1,
},
});
