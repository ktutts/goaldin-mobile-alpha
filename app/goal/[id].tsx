import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, Goal } from '@/types/models';

export default function GoalDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;

  const load = useCallback(async () => {
    if (!goalId) {
      setError('No goal was selected.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

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
    setLoading(false);
  }, [goalId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#D8B24A" />
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

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Pressable style={s.backButton} onPress={() => router.back()}>
          <Text style={s.backText}>← BACK</Text>
        </Pressable>

        <Text style={s.brand}>GOAL'D IN</Text>
        <Text style={s.title}>{goal.title}</Text>
        <Text style={s.subtitle}>Progress</Text>

        <View style={s.track}>
          <View style={[s.fill, { width: `${progress}%` }]} />
        </View>
        <Text style={s.progress}>{progress}% complete</Text>

        <View style={s.panel}>
          <Text style={s.label}>NEXT PENDING</Text>
          {nextPending ? (
            <Text style={s.next}>{nextPending.title}{nextPending.estimated_minutes ? ` · ${nextPending.estimated_minutes} min` : ''}</Text>
          ) : (
            <Text style={s.next}>All moves are complete.</Text>
          )}
        </View>

        <Text style={s.label}>MOVES</Text>
        {actions.map((action) => {
          const statusLabel = action.status === 'completed' ? 'DONE' : action.status === 'pending' ? 'PENDING' : 'SKIPPED';
          return (
            <View key={action.id} style={s.actionRow}>
              <View style={s.actionMeta}>
                <Text style={s.actionTitle}>{action.title}</Text>
                {action.estimated_minutes ? <Text style={s.actionMinutes}>{action.estimated_minutes} min</Text> : null}
              </View>
              <View style={[s.badge, action.status === 'completed' ? s.badgeDone : action.status === 'pending' ? s.badgePending : s.badgeSkipped]}>
                <Text style={s.badgeText}>{statusLabel}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#090909' },
  scroll: { padding: 24, paddingTop: 56, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090909' },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: '#D8B24A', fontWeight: '900', letterSpacing: 1.5 },
  brand: { color: '#D8B24A', fontWeight: '900', letterSpacing: 3, marginBottom: 8 },
  title: { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 6 },
  subtitle: { color: '#888', fontSize: 12, letterSpacing: 2, marginBottom: 10, fontWeight: '800' },
  track: { height: 10, backgroundColor: '#222', borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  fill: { height: '100%', backgroundColor: '#D8B24A' },
  progress: { color: '#fff', fontWeight: '800', marginBottom: 18 },
  panel: { backgroundColor: '#171717', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#262626', marginBottom: 20 },
  label: { color: '#888', fontSize: 11, letterSpacing: 1.5, fontWeight: '800', marginBottom: 8 },
  next: { color: '#fff', fontSize: 18, fontWeight: '700' },
  actionRow: { backgroundColor: '#151515', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#262626', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionMeta: { flex: 1, marginRight: 12 },
  actionTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  actionMinutes: { color: '#999', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeDone: { backgroundColor: '#D8B24A' },
  badgePending: { backgroundColor: '#2a2a2a' },
  badgeSkipped: { backgroundColor: '#444' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  errorCard: { backgroundColor: '#171717', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#262626' },
  errorTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  errorCopy: { color: '#999', marginBottom: 16, lineHeight: 20 },
  button: { backgroundColor: '#D8B24A', padding: 14, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#090909', fontWeight: '900' },
});
