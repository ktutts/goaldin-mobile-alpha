import { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, Goal } from '@/types/models';
import PremiumPressable from '@/components/PremiumPressable';
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
import CircularProgress from '@/components/CircularProgress';
export default function Today() {
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [capacityPromptShown, setCapacityPromptShown] = useState(false);
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

      const [gRes, aRes] = await Promise.all([
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
      ]);

      if (gRes.error || aRes.error) {
        setError(
          gRes.error?.message ||
            aRes.error?.message ||
            'Could not load your goals.'
        );
        setGoals([]);
        setActions([]);
      } else {
        const activeGoals = (gRes.data || []) as Goal[];
        const activeIds = new Set(activeGoals.map(g => g.id));

        setGoals(activeGoals);

        setActions(
          ((aRes.data || []) as Action[]).filter(a =>
            activeIds.has(a.goal_id)
          )
        );

        const currentCapacity = await loadCapacity();
        if (
          !silent &&
          !currentCapacity &&
          !capacityPromptShown &&
          activeGoals.length > 0
        ) {
          setCapacityPromptShown(true);
          showCapacityPrompt();
        }
      }

      if (!silent) setLoading(false);
      setRefreshing(false);
    },
    [capacityPromptShown, loadCapacity, showCapacityPrompt]
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

  const goalData = goals.map(goal => {
    const goalActions = actions
      .filter(action => action.goal_id === goal.id)
      .sort((a, b) => a.position - b.position);

    const completed = goalActions.filter(
      action => action.status === 'completed'
    ).length;

    const progress = goalActions.length
      ? Math.round((completed / goalActions.length) * 100)
      : 0;

    const nextMove = goalActions.find(
      action => action.status === 'pending'
    );

    return {
      goal,
      progress,
      nextMove,
    };
  });

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
              source={require('../assets/images/goaldin-icon.png')}
              style={s.brandCrown}
              resizeMode="contain"
            />

            <Text style={s.brand}>GOAL'D IN</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              s.profileButton,
              pressed && s.pressed,
            ]}
            onPress={() => router.push('/you')}
          >
            <Text style={s.profileText}>YOU</Text>
          </Pressable>
        </View>

        {/* HERO */}
        <Text style={s.greeting}>{greeting}</Text>

        <Text style={s.hero}>
          What are we{'\n'}
          <Text style={s.heroGold}>accomplishing?</Text>
        </Text>

        <View style={s.capacityRow}>
          <Pressable style={s.capacityPill} onPress={showCapacityPrompt}>
            <Text style={s.capacityPillText}>
              {capacity
                ? `TODAY · ${capacityLabels[capacity.level]}`
                : 'CHECK IN DAILY CAPACITY'}
            </Text>
          </Pressable>
        </View>
<View style={s.capacityRow}>

</View>

<Pressable
  onPress={() => router.push('/nutrition-plan-v2' as any)}
  style={{
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#705A20',
    backgroundColor: '#121009',
    borderRadius: 22,
    padding: 18,
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.4,
    }}
  >
    PLAN · RESOURCES
  </Text>

  <Text
    style={{
      color: '#F4F1E8',
      fontSize: 19,
      fontWeight: '900',
      marginTop: 5,
    }}
  >
    Nutrition + Shopping
  </Text>

  <Text
    style={{
      color: '#9C9A92',
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    }}
  >
    Today's meals, grocery budget, prep and the next move.
  </Text>
</Pressable>

{/* MY GOALS */}
        {/* MY GOALS */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>MY GOALS</Text>

          <Text style={s.goalCount}>
            {goals.length} {goals.length === 1 ? 'GOAL' : 'GOALS'}
          </Text>
        </View>

        {goalData.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.goalRow}
            snapToInterval={238}
            decelerationRate="fast"
          >
            {goalData.map(({ goal, progress, nextMove }, index) => (
              <Pressable
                key={goal.id}
                style={({ pressed }) => [
                  s.goalCard,
                  index === 0 && s.goalCardFirst,
                  pressed && s.pressed,
                ]}
                onPress={() => router.push(`/goal/${goal.id}`)}
              >
                <View style={s.goalTop}>
                  <View style={s.goalMark}>
                    <Text style={s.goalMarkText}>
                      {index === 0 ? '●' : '◆'}
                    </Text>
                  </View>

<CircularProgress
  progress={progress}
  size={84}
  strokeWidth={7}
  label=""

/>
                </View>

                <Text style={s.goalTitle} numberOfLines={2}>
                  {goal.title}
                </Text>

                <View style={s.progressTrack}>
                  <View
                    style={[
                      s.progressFill,
                      { width: `${Math.max(3, progress)}%` },
                    ]}
                  />
                </View>

                <View style={s.nextRow}>
                  <Text style={s.nextText} numberOfLines={1}>
                    Next: {nextMove?.title || 'Goal ready'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Pressable
            style={({ pressed }) => [
              s.emptyGoal,
              pressed && s.pressed,
            ]}
            onPress={() => router.push('/goal-it')}
          >
            <Text style={s.emptyGoalTitle}>
              Nothing here yet.
            </Text>

            <Text style={s.emptyGoalText}>
              GOAL IT and start accomplishing something.
            </Text>
          </Pressable>
        )}

        {/* GOAL IT */}
        <PremiumPressable
  style={s.goalItButton}
  haptic="medium"
  goldGlow
  onPress={() => router.push('/goal-it')}
>
  <View style={s.goalItButtonInner}>
    <View style={s.goalItPlus}>
      <Text style={s.goalItPlusText}>+</Text>
    </View>

    <Text style={s.goalItButtonText}>GOAL IT</Text>

    <Text style={s.goalItChevron}>›</Text>
  </View>
</PremiumPressable>

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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#121214',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  profileText: {
    color: '#A5A5A5',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
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
    width: 226,
    height: 238,
    padding: 16,
    backgroundColor: CARD,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },

  goalCardFirst: {
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
  },

  goalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  goalMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    fontWeight: '600',
    marginTop: 14,
    flexShrink: 1,
  },

  progressTrack: {
    height: 4,
    backgroundColor: '#18181B',
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 18,
  },

  progressFill: {
    height: 4,
    backgroundColor: GOLD,
    borderRadius: 99,
  },

  nextRow: {
    marginTop: 16,
  },

  nextText: {
    color: '#8A8A8A',
    fontSize: 13,
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

  goalItButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: '#121214',
    marginTop: 22,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: GOLD_BRIGHT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },

  goalItButtonInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GOLD,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  goalItPlusText: {
    color: GOLD_BRIGHT,
    fontSize: 23,
    lineHeight: 25,
    fontWeight: '600',
    marginTop: -1,
  },

  goalItButtonText: {
    flex: 1,
    color: GOLD_BRIGHT,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1.4,
  },

  goalItChevron: {
    color: GOLD_BRIGHT,
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 30,
  },
  
});