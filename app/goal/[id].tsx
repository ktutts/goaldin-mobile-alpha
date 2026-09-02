import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, Goal } from '@/types/models';
import CircularProgress from '../../components/CircularProgress';
import GoalTimePicker from '../../components/GoalTimePicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCapacityForDate, capacityLabels } from '@/lib/capacity';
import Constants from 'expo-constants';



type GoalSchedule = {
  id: string;
  type: 'weekly' | 'date';
  days?: number[];
  times?: string[];
  date?: string;
};
const getNotifications = async () => {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
};


export default function GoalDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [moveStarted, setMoveStarted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [showReminderMenu, setShowReminderMenu] = useState(false);
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [pendingTime, setPendingTime] = useState<Date>(new Date());
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [savedSchedule, setSavedSchedule] = useState<{ days: number[]; times: string[] } | null>(null);
  const [savedNotificationIds, setSavedNotificationIds] = useState<string[]>([]);
  const [showScheduleSavedModal, setShowScheduleSavedModal] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState('10');
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const deleteGoal = () => {
  if (!goalId) return;
 

  Alert.alert(
    'Delete Goal?',
    'This will permanently delete this goal and its moves. This cannot be undone.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('goals')
            .delete()
            .eq('id', goalId);

          if (error) {
            Alert.alert('Could not delete goal', error.message);
            return;
          }

          router.replace('/today' as any);
        },
      },
    ]
  );
};
const archiveGoal = async () => {
  if (!goalId) return;

  const { error } = await supabase
    .from('goals')
    .update({
  status: 'archived',
  archived_at: new Date().toISOString(),
})
    .eq('id', goalId);

  if (error) {
    Alert.alert('Could not archive achievement', error.message);
    return;
  }

  router.replace('/today' as any);
};const shareAchievement = async () => {
  try {
    await Share.share({
      message: `I just completed "${goal?.title ?? 'a goal'}". Stay Goal'D In.`,
    });
  } catch {
    Alert.alert('Could not share achievement');
  }
};
const renewGoal = async () => {
  if (!goal) return;

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    Alert.alert('Sign in required', 'Please sign in and try again.');
    return;
  }

  const { data: newGoal, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      title: goal.title,
      status: 'active',
    })
    .select()
    .single();

  if (error || !newGoal) {
    Alert.alert(
      'Could not renew goal',
      error?.message || 'Please try again.'
    );
    return;
  }

  Alert.alert(
    'Goal Renewed',
    'A new active cycle has been created while this achievement stays in your history.',
    [
      {
        text: 'OPEN NEW GOAL',
        onPress: () => router.replace(`/goal/${newGoal.id}`),
      },
    ]
  );
};
const completeMove = async (actionId: string) => {
  const { error: actionError } = await supabase
    .from('actions')
    .update({
  status: 'completed',
  completed_at: new Date().toISOString(),
})
    .eq('id', actionId);

  if (actionError) {
    Alert.alert('Could not complete move', actionError.message);
    return;
  }

  const remainingPending = actions.filter(
    (action) => action.id !== actionId && action.status === 'pending'
  );

  setActions((current) =>
    current.map((action) =>
      action.id === actionId
        ? { ...action, status: 'completed' }
        : action
    )
  );
const completedMove = actions.find((action) => action.id === actionId);
const upcomingMove = remainingPending[0];

if (upcomingMove) {
  setCoachMessage(
    `Nice work. ${completedMove?.title ?? 'That move'} is complete. Next up: ${upcomingMove.title}`
  );
} else {
  setCoachMessage(
    `Nice work. ${completedMove?.title ?? 'That move'} is complete. Goal complete.`
  );
}
  if (remainingPending.length === 0 && goalId) {
    const { error: goalError } = await supabase
      .from('goals')
      .update({
  status: 'completed',
  completed_at: new Date().toISOString(),
})
      .eq('id', goalId);

    if (goalError) {
      Alert.alert('Move completed', 'The move was completed, but the goal could not be closed.');
      return;
    }

    setGoal((current) =>
  current
    ? {
        ...current,
        status: 'completed',
      }
    : current
);

return;
}
};
  useEffect(() => {
    if (!goalId) {
      setError('No goal selected');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/');
          return;
        }

        const [goalRes, actionRes, milestoneRes] = await Promise.all([
  supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single(),

  supabase
    .from('actions')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', user.id)
    .order('position', { ascending: true }),

  supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', user.id)
    .order('position', { ascending: true }),
]);

        if (goalRes.error || !goalRes.data) {
          setError(goalRes.error?.message || 'Could not load goal');
          setGoal(null);
          setActions([]);
          setMilestones([]);
        } else {
  setGoal(goalRes.data as Goal);
  setActions((actionRes.data || []) as Action[]);
  setMilestones(milestoneRes.data || []);
}

        await getCapacityForDate();
      } catch (err) {
        console.error(err);
        setError('Error loading goal');
      } finally {
        setLoading(false);
      

};
    };

    void load();
  }, [goalId]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setTimerRunning(false);
          setMoveStarted(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [timerRunning]);

  const nextPending = actions.find((a) => a.status === 'pending');

  function formatTimeFromDate(d: Date) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function addSelectedTimeFromDate(date: Date) {
    const t = formatTimeFromDate(date);
    setSelectedTimes((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setPendingTime(date);
    setShowCustomPicker(false);
  }

  function cancelScheduleEditing() {
    if (savedSchedule) {
      setSelectedDays(savedSchedule.days.slice());
      setSelectedTimes(savedSchedule.times.slice());
    } else {
      setSelectedDays([]);
      setSelectedTimes([]);
    }
    setShowScheduleBuilder(false);
  }

  useEffect(() => {
    // load saved schedule for this goal if present
    const loadSaved = async () => {
      if (!goalId) return;
      try {
        const raw = await AsyncStorage.getItem(`goal-schedule-${goalId}`);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.days && parsed?.times) {
          setSavedSchedule({ days: parsed.days, times: parsed.times });
          setSelectedDays(parsed.days);
          setSelectedTimes(parsed.times);
          setSavedNotificationIds(parsed.notificationIds || []);
        }
      } catch (e) {
        // ignore
      }
    };

    void loadSaved();
  }, [goalId]);

  async function scheduleSuggestedSchedule() {
    try {
      const text = `${goal?.title || ''} ${actions[0]?.title || ''}`.toLowerCase();
      let times;
      if (text.includes('water') || text.includes('hydrate') || text.includes('hydration')) {
        times = [ { hour: 8, minute: 0 }, { hour: 11, minute: 0 }, { hour: 14, minute: 0 }, { hour: 17, minute: 0 } ];
      } else if (text.includes('breakfast')) {
        times = [{ hour: 7, minute: 0 }];
      } else if (text.includes('lunch')) {
        times = [{ hour: 12, minute: 0 }];
      } else if (text.includes('dinner')) {
        times = [{ hour: 18, minute: 0 }];
      } else if (text.includes('workout') || text.includes('exercise') || text.includes('gym')) {
        times = [{ hour: 17, minute: 0 }];
      } else {
        times = [{ hour: 9, minute: 0 }, { hour: 14, minute: 0 }];
      }

      const formattedTimesText = times.map((time) => {
        const hour12 = time.hour % 12 || 12;
        const ampm = time.hour >= 12 ? 'PM' : 'AM';
        return `${hour12}:${String(time.minute).padStart(2, '0')} ${ampm}`;
      }).join(' · ');
const Notifications = await getNotifications();
if (!Notifications) return;
      for (const time of times) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "GOAL'D IN · NEXT MOVE",
            body: actions[0]?.title ? `Time for ${actions[0].title}. Stay ready.` : 'Time for your next move. Stay ready.',
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute }
        });
      }

      setShowReminderMenu(false);
      Alert.alert('SCHEDULE SET', `GOAL'D IN will remind you at ${formattedTimesText}.`);
    } catch (err) {
      console.error('Suggested schedule error', err);
      Alert.alert('Could not set schedule', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function removeSelectedTime(t: string) {
    setSelectedTimes((prev) => prev.filter((x) => x !== t));
  }

  async function saveMoveSchedule() {
    if (selectedDays.length === 0 || selectedTimes.length === 0) {
      Alert.alert('Select days and times', 'Choose at least one day and one time.');
      return;
    }
const Notifications = await getNotifications();
if (!Notifications) return;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Notifications blocked', 'Allow notifications to receive reminders.');
        return;
      }

      // Cancel previously saved notifications (when editing)
      for (const id of savedNotificationIds) {
        try {
          await Notifications.cancelScheduledNotificationAsync(id);
        } catch (e) {
          // ignore
        }
      }

      const newIds: string[] = [];
      // For each selected weekday and time, schedule a weekly notification
      for (const weekday of selectedDays) {
        for (const t of selectedTimes) {
          const parts = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
          if (!parts) continue;
          let hour = parseInt(parts[1], 10);
          const minute = parseInt(parts[2], 10);
          const ampm = parts[3];
          if (ampm) {
            const up = ampm.toUpperCase();
            if (up === 'PM' && hour < 12) hour += 12;
            if (up === 'AM' && hour === 12) hour = 0;
          }

          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: "GOAL'D IN · NEXT MOVE",
              body: nextPending?.title || goal?.title || 'Time for your next move',
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday,
              hour,
              minute,
            },
          });

          newIds.push(id);
        }
      }

      // Persist saved schedule and notification ids
      const scheduleObj = { days: selectedDays, times: selectedTimes };
      setSavedSchedule(scheduleObj);
      setSavedNotificationIds(newIds);
      try {
        await AsyncStorage.setItem(`goal-schedule-${goalId}`, JSON.stringify({ ...scheduleObj, notificationIds: newIds }));
      } catch (e) {
        // ignore
      }

      setShowScheduleSavedModal(true);
      setShowScheduleBuilder(false);
      setShowReminderMenu(false);
    } catch (err) {
      console.error(err);
      Alert.alert('Could not save schedule', 'Please try again.');
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#F0D06A" /></View>
  if (error) return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Pressable style={s.backButton} onPress={() => router.back()}><Text style={s.backText}>← BACK</Text></Pressable>
        <View style={s.errorCard}><Text style={s.errorTitle}>Could not load</Text><Text style={s.errorCopy}>{error}</Text></View>
      </ScrollView>
    </View>
  );
  

  return (
    <SafeAreaView style={s.page} edges={["top"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Pressable style={s.backButton} onPress={() => router.back()}><Text style={s.backText}>← BACK</Text></Pressable>

        <Text style={s.brand}>GOAL'D IN</Text>

        <View style={s.hero}>
            <Pressable
  onPress={() => {
    Alert.alert(
      'Goal Options',
      undefined,
      [
        {
          text: 'Delete Goal',
          style: 'destructive',
          onPress: deleteGoal,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  }}
  style={{
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 10,
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: 2,
    }}
  >
    •••
  </Text>
</Pressable>
          <Text style={s.eyebrow}>
  {!nextPending ? 'GOAL COMPLETE ✓' : 'ACTIVE GOAL'}
</Text>
          <Text style={s.title}>{goal?.title}</Text>
          <CircularProgress
  progress={Math.round(
    (actions.filter(a => a.status === 'completed').length /
      (actions.length || 1)) *
      100
  )}
  size={160}
  strokeWidth={12}
  label={!nextPending ? "GOAL'D IN ✓" : "IN PROGRESS"}
/>
          <Text style={s.subtitle}>{goal?.title || ''}</Text>
        </View>

        <View style={s.nextMoveCard}>
          {coachMessage && (
  <View
    style={{
      marginBottom: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: '#D8B24A',
      borderRadius: 16,
      backgroundColor: '#111111',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 8,
      }}
    >
      GOAL'D IN COACH
    </Text>

    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        lineHeight: 23,
      }}
    >
      {coachMessage}
    </Text>
  </View>
)}  
          <Text style={s.nextMoveLabel}>⚡  YOUR NEXT MOVE</Text>

          {nextPending ? (
            <>
            <Text style={s.nextMoveTitle}>{nextPending.title}</Text>
              <Text style={s.nextMoveMeta}>{nextPending.estimated_minutes ? `${nextPending.estimated_minutes} MIN` : 'READY WHEN YOU ARE'}</Text>

           <Pressable
  style={s.startMoveButton}
  onPress={() => completeMove(nextPending.id)}
>
  <Text style={s.startMoveText}>MARK COMPLETE</Text>
</Pressable>
</>
          ):(
            <>
<Pressable
  onPress={() => setShowTimerMenu(true)}
  style={{
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#D8B24A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontWeight: '900',
      letterSpacing: 1,
    }}
  >
    ⏱ SET TIMER
  </Text>

    {moveStarted && (
  <View
    style={{
      marginTop: 14,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 16,
      padding: 18,
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 10,
      }}
    >
      TIMER
    </Text>

    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 32,
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 14,
      }}
    >
      {Math.floor(secondsLeft / 60)}:
      {String(secondsLeft % 60).padStart(2, '0')}
    </Text>

    <Pressable
      style={s.startMoveButton}
      onPress={() => setTimerRunning((current) => !current)}
    >
      <Text style={s.startMoveText}>
        {timerRunning ? 'PAUSE TIMER' : 'RESUME TIMER'}
      </Text>
    </Pressable>
    <Pressable
  onPress={() => {
    setTimerRunning(false);
    setMoveStarted(false);
    setSecondsLeft(0);
  }}
  style={{
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontWeight: '900',
      letterSpacing: 1,
    }}
  >
    CANCEL TIMER
  </Text>
</Pressable>
  </View>
)}

    
</Pressable>
{showTimerMenu && (
  <View
    style={{
      marginTop: 14,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 16,
      padding: 18,
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 12,
      }}
    >
      HOW LONG DO YOU WANT?
    </Text>

    <TextInput
      value={timerMinutes}
      onChangeText={setTimerMinutes}
      keyboardType="number-pad"
      placeholder="Minutes"
      placeholderTextColor="#777"
      style={{
        borderWidth: 1,
        borderColor: '#3A3426',
        borderRadius: 12,
        padding: 14,
        color: '#FFFFFF',
        fontSize: 18,
        marginBottom: 12,
      }}
    />

    <Pressable
      style={s.startMoveButton}
      onPress={() => {
        const minutes = Math.max(1, Number(timerMinutes) || 1);

        setSecondsLeft(minutes * 60);
        setMoveStarted(true);
        setTimerRunning(true);
        setShowTimerMenu(false);
      }}
    >
      <Text style={s.startMoveText}>START TIMER</Text>
    </Pressable>
  </View>
)}

              <Pressable onPress={() => setShowReminderMenu(true)} style={{ marginTop: 14, borderWidth: 1, borderColor: '#D8B24A', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: '#D8B24A', fontWeight: '900' }}>🔔 SET REMINDER </Text>
              </Pressable>

            {showReminderMenu && (
                <View style={s.reminderMenu}>
                  <Text style={s.reminderTitle}>WHEN SHOULD I REMIND YOU?</Text>

                  <Pressable onPress={() => setShowScheduleBuilder(true)} style={s.primaryButton}><Text style={s.primaryButtonText}>MAKE A SCHEDULE</Text></Pressable>
                  <Pressable onPress={() => { void scheduleSuggestedSchedule(); }} style={{ paddingVertical: 12 }}><Text style={{ color: '#D8B24A', fontWeight: '900' }}>USE SUGGESTED SCHEDULE</Text></Pressable>

                  {savedSchedule && !showScheduleBuilder && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ color: '#D8B24A', fontWeight: '900', marginBottom: 6 }}>SAVED SCHEDULE</Text>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{savedSchedule.days.map((d)=>['S','M','T','W','T','F','S'][d-1]).join(' · ')}</Text>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', marginTop: 6 }}>{savedSchedule.times.join(' · ')}</Text>
                      <Pressable onPress={() => { setSelectedDays(savedSchedule.days.slice()); setSelectedTimes(savedSchedule.times.slice()); setShowScheduleBuilder(true); }} style={{ marginTop: 10 }}>
                        <Text style={{ color: '#D8B24A', fontWeight: '900' }}>EDIT SCHEDULE</Text>
                      </Pressable>
                    </View>
                  )}
                
                  {showScheduleBuilder && (
                    <View style={s.scheduleBuilder}>
                      <Text style={s.sectionTitle}>CHOOSE DAYS</Text>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                        {['S','M','T','W','T','F','S'].map((label, idx) => {
                          const dayNum = idx + 1; // 1..7
                          const sel = selectedDays.includes(dayNum);
                          return (
                            <Pressable key={label + dayNum} onPress={() => setSelectedDays(p => p.includes(dayNum) ? p.filter(x=>x!==dayNum) : [...p, dayNum])} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: sel ? '#D8B24A' : '#3A321F', backgroundColor: sel ? '#D8B24A' : 'transparent', marginRight: 8, marginBottom: 8 }}>
                              <Text style={{ color: sel ? '#0B0B0B' : '#D8B24A', fontWeight: '900' }}>{label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
{showTimerMenu && (
  <View
    style={{
      marginTop: 14,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 16,
      padding: 18,
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 12,
      }}
    >
      HOW LONG DO YOU WANT?
    </Text>

    <TextInput
      value={timerMinutes}
      onChangeText={setTimerMinutes}
      keyboardType="number-pad"
      placeholder="Minutes"
      placeholderTextColor="#777"
      style={{
        borderWidth: 1,
        borderColor: '#3A3426',
        borderRadius: 12,
        padding: 14,
        color: '#FFFFFF',
        fontSize: 18,
        marginBottom: 12,
      }}
    />

    <Pressable
      style={s.startMoveButton}
      onPress={() => {
        const minutes = Math.max(1, Number(timerMinutes) || 1);

        setSecondsLeft(minutes * 60);
        setMoveStarted(true);
        setTimerRunning(true);
        setShowTimerMenu(false);
      }}
    >
      <Text style={s.startMoveText}>START TIMER</Text>
    </Pressable>
  </View>
)}
                      <Pressable onPress={() => { setPendingTime(new Date()); setShowCustomPicker(true); }} style={{ marginTop: 12, backgroundColor: '#111111', borderWidth: 1, borderColor: '#3A321F', paddingVertical: 12, alignItems: 'center', borderRadius: 12 }}>
                        <Text style={{ color: '#D8B24A', fontWeight: '900' }}>+ ADD TIME</Text>
                      </Pressable>

                      {selectedTimes.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
                          {selectedTimes.map(t => (
                            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#3A321F', marginRight: 8, marginBottom: 8, backgroundColor: '#111' }}>
                              <Text style={{ color: '#FFFFFF', fontWeight: '800', marginRight: 8 }}>{t}</Text>
                              <Pressable onPress={() => setSelectedTimes(p => p.filter(x => x !== t))} style={{ padding: 6 }}>
                                <Text style={{ color: '#D8B24A', fontWeight: '900' }}>×</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      )}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
                        <Pressable onPress={cancelScheduleEditing} style={{ paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: '#3A321F', alignItems: 'center' }}>
                          <Text style={{ color: '#8E8E93', fontWeight: '900' }}>CANCEL</Text>
                        </Pressable>

                        <Pressable onPress={saveMoveSchedule} style={{ backgroundColor: '#D8B24A', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' }}>
                          <Text style={{ color: '#0B0B0B', fontWeight: '900' }}>SAVE SCHEDULE</Text>
                        </Pressable>
                      </View>

                      <GoalTimePicker show={showCustomPicker} initialDate={pendingTime} onCancel={() => setShowCustomPicker(false)} onAdd={addSelectedTimeFromDate} />
                    </View>
                  )}
                </View>
              )}

            </>
          )}
          {goal?.status === 'completed' && (
           <View
  style={{
    width: '100%',
    marginTop: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D8B24A',
    borderRadius: 18,
    backgroundColor: '#111111',
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 2,
      textAlign: 'center',
    }}
  >
    ACHIEVEMENT COMPLETE
  </Text>

  <Text
    style={{
      color: '#FFFFFF',
      fontSize: 26,
      fontWeight: '900',
      textAlign: 'center',
      marginTop: 12,
    }}
  >
    {goal?.title}
  </Text>

  <Text
    style={{
      color: '#8E8E93',
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 20,
    }}
  >
    You said you would do it — and did.
  </Text>

  <Pressable
    onPress={shareAchievement}
    style={{
      backgroundColor: '#D8B24A',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    }}
  >
    <Text
      style={{
        color: '#080808',
        fontWeight: '900',
        fontSize: 15,
        letterSpacing: 1,
      }}
    >
      SHARE ACHIEVEMENT
    </Text>
  </Pressable>

  <Pressable
    onPress={renewGoal}
    style={{
      borderWidth: 1,
      borderColor: '#D8B24A',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        fontSize: 15,
        letterSpacing: 1,
      }}
    >
      RENEW GOAL
    </Text>
  </Pressable>
  <Pressable
    onPress={archiveGoal}
    style={{
      borderWidth: 1,
      borderColor: '#3A3A3C',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: '#E5E5E5',
        fontWeight: '800',
        fontSize: 14,
        letterSpacing: 1,
      }}
    >
      ARCHIVE ACHIEVEMENT
    </Text>
  </Pressable>
</View>
          )}    
        </View>
{milestones.length > 0 ? (
  <View
    style={{
      marginTop: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 18,
      backgroundColor: '#111111',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 20,
      }}
    >
      YOUR PATH
    </Text>

    {milestones.map((milestone, index) => {
      const isCurrent = index === 0;
      const isLast = index === milestones.length - 1;

      return (
        <View
          key={milestone.id}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              width: 34,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 2,
                borderColor: isCurrent ? '#D8B24A' : '#6E6E73',
                backgroundColor: isCurrent ? '#D8B24A' : 'transparent',
              }}
            />

            {!isLast ? (
              <View
                style={{
                  width: 2,
                  flex: 1,
                  minHeight: 58,
                  backgroundColor: '#3A3426',
                  marginTop: 4,
                }}
              />
            ) : null}
          </View>

          <View
            style={{
              flex: 1,
              paddingBottom: isLast ? 0 : 22,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: isCurrent ? '#FFFFFF' : '#B8B8BD',
                  fontSize: 17,
                  fontWeight: isCurrent ? '900' : '700',
                }}
              >
                {milestone.title}
              </Text>

              {isCurrent ? (
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: '#D8B24A',
                  }}
                >
                  <Text
                    style={{
                      color: '#000000',
                      fontSize: 10,
                      fontWeight: '900',
                      letterSpacing: 0.8,
                    }}
                  >
                    CURRENT
                  </Text>
                </View>
              ) : null}
            </View>

            {milestone.description ? (
              <Text
                style={{
                  color: '#8E8E93',
                  fontSize: 14,
                  marginTop: 6,
                  lineHeight: 20,
                }}
              >
                {milestone.description}
              </Text>
            ) : null}

            {milestone.target_date ? (
              <Text
                style={{
                  color: isCurrent ? '#D8B24A' : '#8E8E93',
                  fontSize: 13,
                  marginTop: 7,
                  fontWeight: isCurrent ? '700' : '500',
                }}
              >
                Target: {new Date(milestone.target_date).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        </View>
      );
    })}
  </View>
) : null}
      </ScrollView>

      <Modal visible={showScheduleSavedModal} transparent animationType="fade" onRequestClose={() => setShowScheduleSavedModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '86%', backgroundColor: '#111111', borderRadius: 12, borderWidth: 1, borderColor: '#D8B24A', padding: 18 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 16, marginBottom: 8 }}>SCHEDULE SET</Text>
            <Text style={{ color: '#FFFFFF', marginBottom: 18 }}>GOAL'D IN will remind you on the chosen days and times.</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              {savedSchedule && (
                <Pressable onPress={() => {
                  setShowScheduleSavedModal(false);
                  setSelectedDays(savedSchedule.days.slice());
                  setSelectedTimes(savedSchedule.times.slice());
                  setShowScheduleBuilder(true);
                }} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                  <Text style={{ color: '#D8B24A', fontWeight: '900' }}>EDIT SCHEDULE</Text>
                </Pressable>
              )}

              <Pressable onPress={() => setShowScheduleSavedModal(false)} style={{ backgroundColor: '#D8B24A', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }}>
                <Text style={{ color: '#0B0B0B', fontWeight: '900' }}>DONE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0B0B' },
  scroll: { padding: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backButton: { marginBottom: 8 },
  backText: { color: '#D8B24A', fontWeight: '900' },
  brand: { color: '#D8B24A', fontWeight: '900', fontSize: 12, letterSpacing: 1.5, marginBottom: 12 },
  hero: { marginBottom: 18 },
  eyebrow: { color: '#8E8E93', fontSize: 12, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginBottom: 12 },
  progressWrap: { alignItems: 'center', marginVertical: 8 },
  subtitle: { color: '#8E8E93', marginTop: 8 },
  nextMoveCard: { padding: 12, backgroundColor: '#111111', borderRadius: 12, borderWidth: 1, borderColor: '#3A321F' },
  nextMoveLabel: { color: '#D8B24A', fontWeight: '900', marginBottom: 8 },
  nextMoveTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  nextMoveMeta: { color: '#8E8E93', marginTop: 6 },
  startMoveButton: { marginTop: 12, backgroundColor: '#D8B24A', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  startMoveText: { color: '#0B0B0B', fontWeight: '900' },
  reminderMenu: { marginTop: 14, borderWidth: 1, borderColor: '#3A3425', borderRadius: 18, padding: 16, backgroundColor: '#111111' },
  reminderTitle: { color: '#D8B24A', fontSize: 13, fontWeight: '900', letterSpacing: 1.5, marginBottom: 14 },
  primaryButton: { backgroundColor: '#D8B24A', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  primaryButtonText: { color: '#0B0B0B', fontWeight: '900' },
  scheduleBuilder: { marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#3A321F' },
  sectionTitle: { color: '#D8B24A', fontWeight: '900', marginBottom: 8 },
  errorCard: { marginTop: 20, padding: 16 },
  errorTitle: { fontWeight: '900', color: '#fff' },
  errorCopy: { color: '#ddd', marginTop: 8 },
});
