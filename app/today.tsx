import { useCallback, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Modal,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, Goal } from '@/types/models';
import {
  Capacity,
  capacityLabels,
  getCapacityForDate,
  upsertCapacity,
} from '@/lib/capacity';
const GOLD = '#D6AA3F';
const GOLD_BRIGHT = '#F0D06A';
const BG = '#0B0B0D';
const CARD = '#121214';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

// TODAY is not a list of every goal. It shows only commitments that belong
// to the current local day, plus user-chosen additions. No synthetic percent.
type TodayMilestone = { id: string; goal_id: string; status: string; position: number; title?: string };
type GoalDayTimes = { day: number; times: string[] };
type TodaySchedule = { times: string[] };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function happenedToday(isoValue: unknown): boolean {
  if (typeof isoValue !== 'string' || !isoValue) return false;
  const date = new Date(isoValue);
  return !Number.isNaN(date.getTime()) && localDayKey(date) === localDayKey();
}
function clockLabel(raw: string): string {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return raw;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function scheduleForToday(raw: string | null, weekday: number): TodaySchedule | null {
  if (!raw) return null;
  try {
    const schedule: { dayTimes?: GoalDayTimes[]; schedule_days?: GoalDayTimes[]; days?: number[]; times?: string[] } = JSON.parse(raw);
    const dayTimes = Array.isArray(schedule.dayTimes) ? schedule.dayTimes
      : Array.isArray(schedule.schedule_days) ? schedule.schedule_days
      : Array.isArray(schedule.days) && Array.isArray(schedule.times)
        ? schedule.days.map((day) => ({ day, times: schedule.times ?? [] })) : [];
    const times = dayTimes.filter((x) => x.day === weekday && Array.isArray(x.times))
      .flatMap((x) => x.times).filter((x): x is string => typeof x === 'string')
      .sort();
    return times.length ? { times: [...new Set(times)] } : null;
  } catch {
    return null;
  }
}
function goalIcon(title: string): ComponentProps<typeof Ionicons>['name'] {
  const text = title.toLowerCase();
  if (/run|walk|5k|marathon|fitness|workout|exercise|training/.test(text)) return 'footsteps-outline';
  if (/truck|car|restore|garage|fix|repair|build|house/.test(text)) return 'construct-outline';
  if (/wife|husband|date|family|relationship|friend/.test(text)) return 'heart-outline';
  if (/cook|food|meal|recipe|nutrition/.test(text)) return 'restaurant-outline';
  if (/business|launch|job|career|work/.test(text)) return 'briefcase-outline';
  if (/read|learn|study|school/.test(text)) return 'book-outline';
  return 'flag-outline';
}

export default function Today() {
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [milestones, setMilestones] = useState<TodayMilestone[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [scheduleToday, setScheduleToday] = useState<Record<string, TodaySchedule>>({});
  const [chosenToday, setChosenToday] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showOtherGoals, setShowOtherGoals] = useState(false);
  const [showTodayTools, setShowTodayTools] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadCapacity = useCallback(async () => {
    const current = await getCapacityForDate();
    setCapacity(current);
    return current;
  }, []);
const showCapacityPrompt = useCallback(() => {
  setCapacityOpen(true);
}, []);
const chooseCapacity = useCallback(
  async (level: 'high' | 'medium' | 'low') => {
    const updated = await upsertCapacity({
      date: new Date().toISOString().slice(0, 10),
      level,
      source: 'manual',
      metadata: null,
    });

    if (updated) {
      setCapacity(updated);
    }

    setCapacityOpen(false);
  },
  []
);

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/');
        return;
      }

      const [gRes, aRes, mRes] = await Promise.all([
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),

        supabase
          .from('actions')
          .select('*')
          .eq('user_id', user.id)
          .order('position'),

        supabase
          .from('milestones')
          .select('id, goal_id, status, position, title')
          .eq('user_id', user.id)
          .order('position', { ascending: true }),
      ]);

      if (gRes.error || aRes.error || mRes.error) {
        setError(
          gRes.error?.message ||
            aRes.error?.message ||
            mRes.error?.message ||
            'Could not load your goals.'
        );
        setGoals([]);
        setActions([]);
        setMilestones([]);
      } else {
        const activeGoals = (gRes.data || []) as Goal[];
        const activeIds = new Set(activeGoals.map(g => g.id));

        setGoals(activeGoals);

        setActions(
          ((aRes.data || []) as Action[]).filter(a =>
            activeIds.has(a.goal_id)
          )
        );
        setMilestones(
          ((mRes.data || []) as TodayMilestone[]).filter(m =>
            activeIds.has(m.goal_id)
          )
        );

        // Load the current local day's commitments. A schedule is read from
        // existing goal-specific storage; no new reminders are created.
        const dateKey = localDayKey();
        const weekday = new Date().getDay() + 1; // Expo weekday: Sunday=1
        const stored = await Promise.all(activeGoals.map((g) =>
          AsyncStorage.getItem(`goal-schedule-${g.id}`).catch(() => null)
        ));
        const scheduleMap: Record<string, TodaySchedule> = {};
        activeGoals.forEach((g, i) => {
          const today = scheduleForToday(stored[i], weekday);
          if (today) scheduleMap[g.id] = today;
        });
        // Legacy goal-creation schedules can be stored only in event history.
        // Read these only for goals without a device-local schedule. This
        // reflects a saved user choice, not permission to create a reminder.
        const missingScheduleIds = activeGoals
          .filter((g) => !stored[activeGoals.indexOf(g)])
          .map((g) => g.id);
        if (missingScheduleIds.length > 0) {
          const { data: events, error: eventError } = await supabase.from('events')
            .select('object_id, event_type, metadata, created_at')
            .in('object_id', missingScheduleIds)
            .in('event_type', ['goal_created', 'goal_schedule_updated'])
            .order('created_at', { ascending: false })
            .limit(250);
          if (eventError) {
            console.warn('TODAY could not read older schedule history:', eventError.message);
          } else {
            const checked = new Set<string>();
            for (const event of events ?? []) {
              const id = String(event.object_id ?? '');
              if (!id || checked.has(id)) continue;
              const content = event.event_type === 'goal_created'
                ? event.metadata?.when_context : event.metadata;
              const possibleDays = content?.dayTimes ?? content?.schedule_days ?? content?.scheduleDays;
              const today = scheduleForToday(JSON.stringify({ dayTimes: possibleDays,
                days: content?.days, times: content?.times }), weekday);
              if (today) {
                scheduleMap[id] = today;
                checked.add(id);
              }
            }
          }
        }
        const manualRaw = await AsyncStorage.getItem(`goaldin-today-chosen-${dateKey}`)
          .catch(() => null);
        let manual: string[] = [];
        try {
          const parsed: unknown = manualRaw ? JSON.parse(manualRaw) : [];
          if (Array.isArray(parsed)) manual = parsed.filter((id): id is string => typeof id === 'string');
        } catch { /* Ignore invalid old local selection. */ }
        setChosenToday(manual.filter((id) => activeIds.has(id)));
        setScheduleToday(scheduleMap);
        await loadCapacity();
      }

      if (!silent) setLoading(false);
      setRefreshing(false);
    },
    [loadCapacity]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
      return undefined;
    }, [load])
  );

  // A manual TODAY selection does not alter recurring schedules or reminders.
  const chooseForToday = async (goalId: string, selected: boolean) => {
    const updated = selected
      ? [...new Set([...chosenToday, goalId])]
      : chosenToday.filter((id) => id !== goalId);
    try {
      await AsyncStorage.setItem(`goaldin-today-chosen-${localDayKey()}`, JSON.stringify(updated));
      setChosenToday(updated);
    } catch {
      Alert.alert('Could not save', 'Your choice for today was not saved. Try again.');
    }
  };

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? 'Good morning'
      : hour < 18
        ? 'Good afternoon'
        : 'Good evening';

  // Only a scheduled or intentionally selected commitment belongs in TODAY.
  // A finished Next Move disappears from active TODAY even when another move
  // is already prepared for the next session. Completed history stays visible.
  const goalData = goals.map((goal) => {
    const stages = milestones.filter((m) => m.goal_id === goal.id)
      .sort((a, b) => a.position - b.position);
    const active = stages.find((m) => m.status === 'active');
    const goalActions = actions.filter((a) => a.goal_id === goal.id)
      .sort((a, b) => a.position - b.position);
    const nextMove = active
      ? goalActions.find((a) => a.status === 'pending' && a.milestone_id === active.id)
      : stages.length === 0
        ? goalActions.find((a) => a.status === 'pending') : undefined;
    const doneActions = goalActions.filter((a) => a.status === 'completed'
      && happenedToday((a as Action & { completed_at?: string | null }).completed_at));
    const lastDone = doneActions[doneActions.length - 1];
    return {
      goal, nextMove, activeStage: active?.title ?? null,
      stagesCompleted: stages.filter((m) => m.status === 'completed').length,
      todaySchedule: scheduleToday[goal.id] ?? null,
      chosen: chosenToday.includes(goal.id),
      lastDone,
    };
  });
  const dueToday = goalData.filter((item) =>
    (item.todaySchedule || item.chosen) && !item.lastDone
  ).sort((a, b) =>
    (a.todaySchedule?.times[0] ?? '99:99').localeCompare(b.todaySchedule?.times[0] ?? '99:99')
  );
  const completedToday = goalData.filter((item) => !!item.lastDone);
  const otherGoals = goalData.filter((item) =>
    !dueToday.some((due) => due.goal.id === item.goal.id) && !item.lastDone
  );
  const weekdayName = WEEKDAYS[new Date().getDay()];

  return (
    <View style={s.page}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ silent: true });
            }}
            tintColor={GOLD}
            colors={[GOLD]}
          />
        }
      >
        {/* BRAND */}
        <View style={s.brandRow}>
          <View style={s.brandLeft}>
            <Image
              source={require('../assets/images/goaldin-crown.png')}
              style={s.brandCrown}
              resizeMode="contain"
            />

            <Text style={s.brand}>GOAL'D IN</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="YOU, open your profile"
            style={({ pressed }) => [
              s.profileButton,
              pressed && s.pressed,
            ]}
            onPress={() => router.push('/you')}
          >
            <View style={s.profileIconCircle}>
              <Ionicons name="person-outline" size={15} color={GOLD_BRIGHT} />
            </View>
            <Text style={s.profileText}>YOU</Text>
          </Pressable>
        </View>

        {/* TODAY is the default: one actionable commitment per card. */}
        <Text style={s.greeting}>{greeting} · {weekdayName}</Text>
        <Text style={s.hero}>What matters{'\n'}<Text style={s.heroGold}>today?</Text></Text>
        <View style={n.paceRow}>
          <Pressable style={n.pacePill} onPress={showCapacityPrompt}>
            <Text style={n.paceText}>{capacity ? `TODAY · ${capacityLabels[capacity.level]}` : 'CHOOSE TODAY’S PACE'}</Text>
            <Ionicons name="chevron-down" size={13} color={GOLD_BRIGHT} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="GOAL IT, create a new goal"
            style={({ pressed }) => [n.compactGoalIt, pressed && s.pressed]}
            onPress={() => router.push('/goal-it')}
          >
            <Image
              source={require('../assets/images/goal-it-button-art.png')}
              style={n.compactGoalItArt}
              resizeMode="contain"
              accessible={false}
            />
          </Pressable>
        </View>

        <View style={n.sectionRow}>
          <View>
            <Text style={n.sectionEyebrow}>YOUR COMMITMENTS</Text>
            <Text style={n.sectionSub}>{dueToday.length ? `${dueToday.length} to focus on today` : 'A clear day is a good thing.'}</Text>
          </View>
          <Ionicons name="sunny-outline" size={22} color={GOLD_BRIGHT} />
        </View>
        {dueToday.length === 0 ? (
          <View style={n.quietCard}>
            <Text style={n.quietTitle}>Your day is yours.</Text>
            <Text style={n.quietBody}>No unfinished commitments are scheduled or chosen for today. Enjoy the space, or choose something meaningful when you want.</Text>
            <Pressable style={n.quietLink} onPress={() => setShowOtherGoals(true)}>
              <Text style={n.quietLinkText}>CHOOSE A NEXT MOVE  →</Text>
            </Pressable>
          </View>
        ) : dueToday.map(({ goal, nextMove, activeStage, todaySchedule, chosen }) => (
          <View key={goal.id} style={n.focusCard}>
            <View style={n.focusTop}>
              <View style={n.purposeIcon}>
                <Ionicons name={goalIcon(goal.title)} size={23} color={GOLD_BRIGHT} />
              </View>
              <View style={{flex: 1}}>
                <Text style={n.focusKicker}>{todaySchedule ? 'SCHEDULED FOR TODAY' : 'CHOSEN FOR TODAY'}</Text>
                <Text style={n.focusGoal} numberOfLines={2}>{goal.title}</Text>
              </View>
              {todaySchedule ? <Text style={n.focusTime}>{todaySchedule.times.map(clockLabel).join(' · ')}</Text> : null}
            </View>
            <Text style={n.focusAction}>{nextMove?.title ?? 'Choose the next meaningful move'}</Text>
            {activeStage ? <Text style={n.focusStage}>Current stage · {activeStage}</Text> : null}
            <Pressable style={n.focusButton}
              onPress={() => nextMove?.milestone_id
                ? router.push(`/goal/milestone/${nextMove.milestone_id}`)
                : router.push(`/goal/${goal.id}`)}>
              <Text style={n.focusButtonText}>{nextMove?.milestone_id ? 'OPEN MY NEXT MOVE' : 'OPEN MY JOURNEY'}   →</Text>
            </Pressable>
            <View style={n.focusLinks}>
              <Pressable onPress={() => router.push(`/goal/${goal.id}`)}>
                <Text style={n.linkText}>MY PLAN  ↗</Text>
              </Pressable>
              {chosen && !todaySchedule ? (
                <Pressable onPress={() => void chooseForToday(goal.id, false)}>
                  <Text style={n.mutedLink}>NOT FOR TODAY</Text>
                </Pressable>
              ) : <Text style={n.mutedLink}>NEED TO ADAPT? OPEN WORKSPACE</Text>}
            </View>
          </View>
        ))}

        {completedToday.length > 0 ? (
          <View style={n.secondarySection}>
            <Pressable style={n.disclosure} onPress={() => setShowCompleted((open) => !open)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Ionicons name="checkmark-circle-outline" size={20} color={GOLD_BRIGHT} />
                <Text style={n.disclosureLabel}>COMPLETED TODAY · {completedToday.length}</Text>
              </View>
              <Ionicons name={showCompleted ? 'chevron-up' : 'chevron-down'} size={17} color={GOLD_BRIGHT} />
            </Pressable>
            {showCompleted && completedToday.map(({goal, lastDone}) => (
              <Pressable key={goal.id} style={n.completedRow} onPress={() => router.push(`/goal/${goal.id}`)}>
                <Ionicons name={goalIcon(goal.title)} size={22} color={GOLD_BRIGHT} />
                <View style={{flex: 1}}>
                  <Text style={n.completedTitle} numberOfLines={1}>{goal.title}</Text>
                  <Text style={n.completedSubtitle} numberOfLines={2}>{lastDone?.title ?? 'Progress recorded'} · View Journey / Reflect</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#A8A8A8" />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={n.secondarySection}>
          <Pressable style={n.disclosure} onPress={() => setShowOtherGoals((open) => !open)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name="albums-outline" size={20} color={GOLD_BRIGHT} />
              <Text style={n.disclosureLabel}>OTHER GOALS · {otherGoals.length}</Text>
            </View>
            <Ionicons name={showOtherGoals ? 'chevron-up' : 'chevron-down'} size={17} color={GOLD_BRIGHT} />
          </Pressable>
          {showOtherGoals && (otherGoals.length ? otherGoals.map(({goal, nextMove, stagesCompleted}) => (
            <View key={goal.id} style={n.otherRow}>
              <Pressable onPress={() => router.push(`/goal/${goal.id}`)} style={{flex: 1}}>
                <Text style={n.otherTitle} numberOfLines={2}>{goal.title}</Text>
                <Text style={n.otherSubtitle} numberOfLines={2}>
                  {stagesCompleted > 0 ? `${stagesCompleted} completed stage${stagesCompleted > 1 ? 's' : ''} · ` : ''}{nextMove?.title ?? 'Your Journey is ready to explore'}
                </Text>
              </Pressable>
              <Pressable style={n.choosePill} onPress={() => void chooseForToday(goal.id, true)}>
                <Text style={n.chooseText}>TODAY +</Text>
              </Pressable>
            </View>
          )) : <Text style={n.emptyOther}>All your active goals are already accounted for.</Text>)}
        </View>

        <View style={n.bottomActions}>
          <View style={n.toolsPanel}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More tools"
              accessibilityState={{ expanded: showTodayTools }}
              style={({ pressed }) => [n.toolsHeader, pressed && s.pressed]}
              onPress={() => setShowTodayTools((open) => !open)}
            >
              <View style={n.toolsIconWrap}>
                <Ionicons name="grid-outline" size={19} color={GOLD_BRIGHT} />
              </View>
              <View style={n.toolsHeaderText}>
                <Text style={n.toolsTitle}>MORE TOOLS</Text>
                <Text style={n.toolsSubtitle}>Ready when you need them</Text>
              </View>
              <Ionicons
                name={showTodayTools ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={GOLD_BRIGHT}
              />
            </Pressable>
            {showTodayTools && (
              <View style={n.toolsExpanded}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [n.toolItem, pressed && s.pressed]}
                  onPress={() => router.push('/nutrition-plan-v2' as any)}
                >
                  <View style={n.toolItemIcon}>
                    <Ionicons name="restaurant-outline" size={19} color={GOLD_BRIGHT} />
                  </View>
                  <View style={n.toolItemCopy}>
                    <Text style={n.toolItemTitle}>Meal Plan</Text>
                    <Text style={n.toolItemDetail}>Plan meals around your goals</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={17} color={GOLD_BRIGHT} />
                </Pressable>
                <View style={n.toolDivider} />
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [n.toolItem, pressed && s.pressed]}
                  onPress={() => router.push('/health-data' as any)}
                >
                  <View style={n.toolItemIcon}>
                    <Ionicons name="heart-outline" size={19} color={GOLD_BRIGHT} />
                  </View>
                  <View style={n.toolItemCopy}>
                    <Text style={n.toolItemTitle}>Health Data</Text>
                    <Text style={n.toolItemDetail}>Connect a wearable · optional</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={17} color={GOLD_BRIGHT} />
                </Pressable>
                <View style={n.toolDivider} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Camera, save a private progress photo"
                  style={({ pressed }) => [n.toolItem, pressed && s.pressed]}
                  onPress={() => router.push('/camera' as any)}
                >
                  <View style={n.toolItemIcon}>
                    <Ionicons name="camera-outline" size={19} color={GOLD_BRIGHT} />
                  </View>
                  <View style={n.toolItemCopy}>
                    <Text style={n.toolItemTitle}>Camera</Text>
                    <Text style={n.toolItemDetail}>Capture a moment of progress · private</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={17} color={GOLD_BRIGHT} />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* IDEA */}
        <Pressable
          style={({ pressed }) => [
            s.ideaCard,
            pressed && s.pressed,
          ]}
          onPress={() => router.push('/discover')}
        >
          <View style={s.ideaIcon}>
            <Text style={s.ideaSpark}>✦</Text>
          </View>

          <View style={s.ideaWords}>
            <Text style={s.ideaTitle}>Need an idea?</Text>
            <Text style={s.ideaSub}>
              Discover something worth accomplishing.
            </Text>
          </View>

          <Text style={s.chevron}>›</Text>
        </Pressable>

        {error ? (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Couldn't refresh</Text>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

            <BottomNav />

      <Modal
        visible={capacityOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCapacityOpen(false)}
      >
        {<View style={s.capacityOverlay}>
  <Pressable
    style={StyleSheet.absoluteFill}
    onPress={() => setCapacityOpen(false)}
  />

  <View style={s.capacitySheet}>
    <View style={s.capacityHandle} />

    <Text style={s.capacityEyebrow}>TODAY'S PACE</Text>

    <Text style={s.capacityTitle}>
      What have you got today?
    </Text>

    <Text style={s.capacityCopy}>
      We'll size your next moves around what you've got.
    </Text>

    <Pressable
      style={({ pressed }) => [
        s.capacityChoice,
        pressed && s.capacityChoicePressed,
      ]}
      onPress={() => chooseCapacity('high')}
    >
      <View style={s.capacityChoiceIcon}>
        <Text style={s.capacityChoiceIconText}>⚡</Text>
      </View>

      <View style={s.capacityChoiceWords}>
        <Text style={s.capacityChoiceTitle}>PUSH</Text>
        <Text style={s.capacityChoiceCopy}>
          Give me something to attack.
        </Text>
      </View>

      <Text style={s.capacityChoiceArrow}>›</Text>
    </Pressable>

    <Pressable
      style={({ pressed }) => [
        s.capacityChoice,
        pressed && s.capacityChoicePressed,
      ]}
      onPress={() => chooseCapacity('medium')}
    >
      <View style={s.capacityChoiceIcon}>
        <Text style={s.capacityChoiceIconText}>◆</Text>
      </View>

      <View style={s.capacityChoiceWords}>
        <Text style={s.capacityChoiceTitle}>STEADY</Text>
        <Text style={s.capacityChoiceCopy}>
          Keep me moving.
        </Text>
      </View>

      <Text style={s.capacityChoiceArrow}>›</Text>
    </Pressable>

    <Pressable
      style={({ pressed }) => [
        s.capacityChoice,
        pressed && s.capacityChoicePressed,
      ]}
      onPress={() => chooseCapacity('low')}
    >
      <View style={s.capacityChoiceIcon}>
        <Text style={s.capacityChoiceIconText}>○</Text>
      </View>

      <View style={s.capacityChoiceWords}>
        <Text style={s.capacityChoiceTitle}>LIGHT</Text>
        <Text style={s.capacityChoiceCopy}>
          Small moves still count.
        </Text>
      </View>

      <Text style={s.capacityChoiceArrow}>›</Text>
    </Pressable>

    <Pressable
      style={s.capacityDismiss}
      onPress={() => setCapacityOpen(false)}
    >
      <Text style={s.capacityDismissText}>NOT NOW</Text>
    </Pressable>
  </View>
</View>}
      </Modal>

    </View>
  );
}
function MiniRing({ progress }: { progress: number }) {
  const segments = 12;

  const complete = Math.round(
    (Math.max(0, Math.min(progress, 100)) / 100) * segments
  );

  return (
    <View style={s.ring}>
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (360 / segments) * i;

        return (
          <View
            key={i}
            style={[
              s.ringSegment,
              {
                backgroundColor:
                  i < complete ? GOLD_BRIGHT : '#303030',

                transform: [
                  { rotate: `${angle}deg` },
                  { translateY: -25 },
                ],
              },
            ]}
          />
        );
      })}

      <Text style={s.ringText}>{progress}%</Text>
    </View>
  );
}

function BottomNav() {
  return (
    <View style={s.nav}>
      <Pressable
        style={s.navItem}
        onPress={() => router.replace('/today')}
      >
        <Text style={s.navIconActive}>◎</Text>
        <Text style={s.navActive}>HOME</Text>
      </Pressable>

      <Pressable
        style={s.navItem}
        onPress={() => router.push('/discover')}
      >
        <Text style={s.navIcon}>◇</Text>
        <Text style={s.navText}>DISCOVER</Text>
      </Pressable>

      <Pressable
        style={s.navItem}
        onPress={() => router.push('/wins')}
      >
        <Text style={s.navIcon}>♢</Text>
        <Text style={s.navText}>WINS</Text>
      </Pressable>

      <Pressable
        style={s.navItem}
        onPress={() => router.push('/you')}
      >
        <Text style={s.navIcon}>○</Text>
        <Text style={s.navText}>PROFILE</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: BG,
  },

  scroll: {
    paddingTop: 58,
    paddingBottom: 125,
  },

  loading: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: 'center',
    alignItems: 'center',
  },

  brandRow: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  brandCrown: {
    width: 42,
    height: 42,
    marginRight: 10,
  },

  brand: {
    color: GOLD_BRIGHT,
    fontSize: 19,
    letterSpacing: 3,
    fontWeight: '900',
  },

  profileButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(214,170,63,0.50)',
    backgroundColor: '#191713',
    borderRadius: 24,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 5,
  },

  profileIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(214,170,63,0.34)',
    backgroundColor: '#2A2317',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileText: {
    color: '#E8C36A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  greeting: {
    color: '#A9A9A9',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 30,
    paddingHorizontal: 24,
  },

  hero: {
    color: '#E5E5E5',
    fontSize: 39,
    lineHeight: 44,
    fontWeight: '600',
    letterSpacing: -1.25,
    paddingHorizontal: 24,
    marginTop: 8,
  },

  heroGold: {
    color: GOLD,
  },

  sectionHeader: {
    paddingHorizontal: 24,
    marginTop: 38,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    color: '#E5E5E5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  goalCount: {
    color: '#8D8D8D',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  goalRow: {
    paddingLeft: 24,
    paddingRight: 12,
    gap: 12,
  },

  /* intentionally short cards */
  goalCard: {
  width: '100%',
  minHeight: 132,
  padding: 15,
  backgroundColor: CARD,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.1)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.16,
  shadowRadius: 16,
  elevation: 6,
  marginBottom: 14,
},

  goalCardFirst: {
  borderColor: 'rgba(216,178,74,0.45)',
},
  goalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  goalMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#242426',
    justifyContent: 'center',
    alignItems: 'center',
  },

  goalMarkText: {
    color: GOLD,
    fontSize: 17,
  },

  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  ringSegment: {
    position: 'absolute',
    width: 5,
    height: 11,
    borderRadius: 5,
  },

  ringText: {
    color: '#E5E5E5',
    fontSize: 13,
    fontWeight: '700',
  },

  goalTitle: {
  color: '#E5E5E5',
  fontSize: 20,
  lineHeight: 24,
  fontWeight: '700',
  marginTop: 0,
  flexShrink: 1,
},

  progressTrack: {
    height: 4,
    backgroundColor: '#18181B',
    borderRadius: 99,
    
    marginTop: 18,
  },

  progressFill: {
    height: 4,
    backgroundColor: GOLD,
    borderRadius: 99,
  },

  nextRow: {
    marginTop: 8,
  },

  nextText: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '600',
  },

  emptyGoal: {
    marginHorizontal: 24,
    padding: 22,
    backgroundColor: '#18181B',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  emptyGoalTitle: {
    color: '#E5E5E5',
    fontSize: 20,
    fontWeight: '700',
  },

  emptyGoalText: {
    color: '#8D8D8D',
    lineHeight: 20,
    marginTop: 6,
  },

  goalIt: {
    marginHorizontal: 24,
    marginTop: 28,
    minHeight: 126,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 25,
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(214,170,63,0.15)',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 7,
  },

  goalItCrownWrap: {
    width: 86,
    alignItems: 'center',
  },

  goalItGlow: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#4A3A16',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: GOLD_BRIGHT,
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },

  goalItCrown: {
    width: 56,
    height: 56,
  },

  goalItWords: {
    flex: 1,
    marginLeft: 11,
  },

  goalItTitle: {
    color: GOLD_BRIGHT,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 1.3,
  },

  goalItSub: {
    color: '#7C7C7C',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
    paddingRight: 6,
  },

  goldChevron: {
    color: GOLD_BRIGHT,
    fontSize: 34,
    fontWeight: '300',
  },

  ideaCard: {
    marginHorizontal: 24,
    marginTop: 12,
    minHeight: 80,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121214',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  ideaIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#242426',
    justifyContent: 'center',
    alignItems: 'center',
  },

  ideaSpark: {
    color: GOLD_BRIGHT,
    fontSize: 24,
  },

  ideaWords: {
    flex: 1,
    marginLeft: 12,
  },

  ideaTitle: {
    color: '#E5E5E5',
    fontSize: 17,
    fontWeight: '700',
  },

  ideaSub: {
    color: '#8D8D8D',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },

  chevron: {
    color: '#666666',
    fontSize: 28,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },

  errorCard: {
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: '#121214',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },

  errorTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  errorText: {
    color: '#8D8D8D',
    marginTop: 5,
  },

  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 91,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 11,
    paddingBottom: 12,
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
  },

  navIconActive: {
    color: GOLD,
    fontSize: 24,
  },

  navIcon: {
    color: '#666666',
    fontSize: 24,
  },

  navActive: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 1.5,
  },

  navText: {
    color: '#666666',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 1.5,
  },
mealPlanButton: {
  alignSelf: 'flex-end',
  width: 78,
  height: 78,
  borderRadius: 39,
  borderWidth: 1.5,
  borderColor: GOLD_BRIGHT,
  backgroundColor: '#0B0B0D',
  alignItems: 'center',
  justifyContent: 'center',

  marginTop: 14,
  marginRight: 24,
  marginBottom: 24,
},

mealPlanIcon: {
  fontSize: 18,
  marginBottom: 2,
},

mealPlanText: {
  color: GOLD_BRIGHT,
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 1,
  textAlign: 'center',
  lineHeight: 12,
},
  goalItButton: {
  height: 82,
  borderRadius: 22,
  backgroundColor: GOLD_BRIGHT,
  marginTop: 22,
  marginBottom: 18,

  borderWidth: 1,
  borderColor: '#F3D56B',

  shadowColor: GOLD_BRIGHT,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.5,
  shadowRadius: 22,
  elevation: 16,
},
goalItButtonText: {
  fontSize: 26,
  fontWeight: '900',
  letterSpacing: 3,
  color: '#090909',
},
  goalItButtonInner: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 22,
},

  capacityRow: {
    paddingHorizontal: 24,
    marginTop: 18,
  },

  capacityPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#121214',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  capacityPillText: {
    color: '#E5E5E5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
capacityOverlay: {
  flex: 1,
  justifyContent: 'flex-end',
  backgroundColor: 'rgba(0,0,0,0.74)',
},

capacitySheet: {
  backgroundColor: '#121214',
  borderTopLeftRadius: 30,
  borderTopRightRadius: 30,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.07)',
  paddingHorizontal: 24,
  paddingTop: 14,
  paddingBottom: 34,
  shadowColor: '#D6AA3F',
  shadowOpacity: 0.12,
  shadowRadius: 24,
  elevation: 14,
},

capacityHandle: {
  width: 42,
  height: 4,
  borderRadius: 2,
  backgroundColor: '#343438',
  alignSelf: 'center',
  marginBottom: 26,
},

capacityEyebrow: {
  color: '#D6AA3F',
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 2.2,
  marginBottom: 10,
},

capacityTitle: {
  color: '#F4F1EA',
  fontSize: 30,
  lineHeight: 36,
  fontWeight: '800',
},

capacityCopy: {
  color: '#858589',
  fontSize: 15,
  lineHeight: 22,
  marginTop: 8,
  marginBottom: 24,
},

capacityChoice: {
  minHeight: 82,
  borderRadius: 20,
  backgroundColor: '#18181B',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.06)',
  paddingHorizontal: 16,
  marginBottom: 10,
  flexDirection: 'row',
  alignItems: 'center',
},

capacityChoicePressed: {
  transform: [{ scale: 0.985 }],
  borderColor: 'rgba(214,170,63,0.38)',
  backgroundColor: '#1C1B17',
},

capacityChoiceIcon: {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#111113',
  borderWidth: 1,
  borderColor: 'rgba(214,170,63,0.22)',
},

capacityChoiceIconText: {
  color: '#E7C45A',
  fontSize: 18,
  fontWeight: '800',
},

capacityChoiceWords: {
  flex: 1,
  marginLeft: 15,
},

capacityChoiceTitle: {
  color: '#E7C45A',
  fontSize: 14,
  fontWeight: '900',
  letterSpacing: 1.4,
},

capacityChoiceCopy: {
  color: '#8B8B8F',
  fontSize: 13,
  marginTop: 4,
},

capacityChoiceArrow: {
  color: '#8A6A2B',
  fontSize: 28,
  marginLeft: 10,
},

capacityDismiss: {
  minHeight: 48,
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 4,
},

capacityDismissText: {
  color: '#626267',
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 1.6,
},
  goalItPlus: {
  width: 48,
  height: 48,
  borderRadius: 24,
  borderWidth: 1.5,
  borderColor: '#090909',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 18,
},

  goalItPlusText: {
  color: '#090909',
  fontSize: 28,
  fontWeight: '700',
},

  goalItChevron: {
  color: '#090909',
  fontSize: 30,
  fontWeight: '700',
},

  
  
});
// The action-first TODAY presentation is intentionally separate from legacy
// goal-card styles; it does not affect Goal Journey or Milestone Workspace.
const n = StyleSheet.create({
  paceRow: { marginTop: 16, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  pacePill: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#3C3424', borderRadius: 99, backgroundColor: '#181716' },
  paceText: { color: '#E8C36A', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  // Exact branded black/gold pill artwork; 48pt touch target.
  compactGoalIt: { width: 148, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  compactGoalItArt: { width: 148, height: 44 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginTop: 30, marginBottom: 14 },
  sectionEyebrow: { color: '#E8C36A', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  sectionSub: { color: '#AFAFAF', fontSize: 13, marginTop: 5 },
  quietCard: { marginHorizontal: 24, borderRadius: 20, borderWidth: 1, borderColor: '#363026', backgroundColor: '#151411', padding: 20, gap: 10 },
  quietTitle: { color: '#F4F1EA', fontSize: 21, fontWeight: '800' },
  quietBody: { color: '#BABABA', fontSize: 14, lineHeight: 21 },
  quietLink: { alignSelf: 'flex-start', paddingTop: 10, paddingBottom: 5 },
  quietLinkText: { color: '#E8C36A', fontSize: 12, fontWeight: '900' },
  focusCard: { marginHorizontal: 24, marginBottom: 13, borderRadius: 22, borderWidth: 1, borderColor: '#755E2B', backgroundColor: '#191713', padding: 17, gap: 13 },
  focusTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  purposeIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#29241A', borderWidth: 1, borderColor: '#483A20' },
  focusKicker: { color: '#D8B24A', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  focusGoal: { color: '#F4F1EA', fontSize: 16, lineHeight: 22, fontWeight: '800', marginTop: 4 },
  focusTime: { color: '#E8C36A', fontSize: 11, fontWeight: '800', maxWidth: 86, textAlign: 'right' },
  focusAction: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', lineHeight: 27, marginTop: 4 },
  focusStage: { color: '#AFAFAF', fontSize: 12, lineHeight: 18 },
  focusButton: { backgroundColor: '#D8B24A', borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', padding: 12 },
  focusButtonText: { color: '#101010', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  focusLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 9, paddingTop: 1 },
  linkText: { color: '#E8C36A', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  mutedLink: { color: '#A6A6A6', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  secondarySection: { marginHorizontal: 24, marginTop: 22 },
  disclosure: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#312C24' },
  disclosureLabel: { color: '#E5E2DC', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2721' },
  completedTitle: { color: '#F0EDE6', fontSize: 14, fontWeight: '800' },
  completedSubtitle: { color: '#A3A3A3', fontSize: 12, marginTop: 4, lineHeight: 17 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2B2924' },
  otherTitle: { color: '#EEEEEE', fontSize: 15, fontWeight: '800' },
  otherSubtitle: { color: '#9F9F9F', fontSize: 12, marginTop: 4, lineHeight: 17 },
  choosePill: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 99, borderWidth: 1, borderColor: '#6B572C' },
  chooseText: { color: '#D8B24A', fontSize: 10, fontWeight: '900' },
  emptyOther: { color: '#AAAAAA', fontSize: 12, paddingVertical: 16 },
  bottomActions: { paddingHorizontal: 24, marginTop: 27 },
  toolsPanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(214,170,63,0.29)',
    backgroundColor: '#151411',
    overflow: 'hidden',
  },
  toolsHeader: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  toolsIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#292317',
    borderWidth: 1,
    borderColor: 'rgba(214,170,63,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolsHeaderText: { flex: 1, gap: 3 },
  toolsTitle: { color: '#E8C36A', fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  toolsSubtitle: { color: '#AFA8A0', fontSize: 12 },
  toolsExpanded: { borderTopWidth: 1, borderTopColor: '#3A3225', paddingHorizontal: 14, paddingVertical: 3 },
  toolItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 9 },
  toolItemIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: '#211D16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolItemCopy: { flex: 1, gap: 3 },
  toolItemTitle: { color: '#F4F1EA', fontSize: 14, fontWeight: '800' },
  toolItemDetail: { color: '#AFA8A0', fontSize: 11 },
  toolDivider: { height: 1, backgroundColor: '#302B24', marginLeft: 51 },
});
