import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, Goal } from '@/types/models';
import CircularProgress from '../../components/CircularProgress';
import GoalTimePicker from '../../components/GoalTimePicker';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCapacityForDate, capacityLabels } from '@/lib/capacity';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type GoalSchedule = {
  id: string;
  type: 'weekly' | 'date';
  days?: number[];
  times?: string[];
  date?: string;
};

export default function GoalDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const [goalRes, actionRes] = await Promise.all([
          supabase.from('goals').select('*').eq('id', goalId).eq('user_id', user.id).single(),
          supabase.from('actions').select('*').eq('goal_id', goalId).eq('user_id', user.id).order('position', { ascending: true }),
        ]);

        if (goalRes.error || !goalRes.data) {
          setError(goalRes.error?.message || 'Could not load goal');
          setGoal(null);
          setActions([]);
        } else {
          setGoal(goalRes.data as Goal);
          setActions((actionRes.data || []) as Action[]);
        }

        await getCapacityForDate();
      } catch (err) {
        console.error(err);
        setError('Error loading goal');
      } finally {
        setLoading(false);
      }
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

  if (loading) return <View style={s.center}><ActivityIndicator color="#F0D06A" /></View>;
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
          <Text style={s.eyebrow}>ACTIVE GOAL</Text>
          <Text style={s.title}>{goal?.title}</Text>
          <View style={s.progressWrap}><CircularProgress progress={Math.round((actions.filter(a=>a.status==='completed').length / (actions.length||1))*100)} size={160} strokeWidth={12} /></View>
          <Text style={s.subtitle}>{goal?.title || ''}</Text>
        </View>

        <View style={s.nextMoveCard}>
          <Text style={s.nextMoveLabel}>⚡  YOUR NEXT MOVE</Text>

          {nextPending ? (
            <>
              <Text style={s.nextMoveTitle}>{nextPending.title}</Text>
              <Text style={s.nextMoveMeta}>{nextPending.estimated_minutes ? `${nextPending.estimated_minutes} MIN` : 'READY WHEN YOU ARE'}</Text>

              <Pressable style={s.startMoveButton} onPress={() => {
                if (!moveStarted) { setMoveStarted(true); setSecondsLeft((nextPending.estimated_minutes ?? 1) * 60); setTimerRunning(true); return; }
                setTimerRunning((c)=>!c);
              }}>
                <Text style={s.startMoveText}>{!moveStarted ? 'START MOVE →' : timerRunning ? `PAUSE · ${Math.floor(secondsLeft/60)}:${String(secondsLeft%60).padStart(2,'0')}` : `RESUME · ${Math.floor(secondsLeft/60)}:${String(secondsLeft%60).padStart(2,'0')}`}</Text>
              </Pressable>

              <Pressable onPress={() => setShowReminderMenu(true)} style={{ marginTop: 14, borderWidth: 1, borderColor: '#D8B24A', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: '#D8B24A', fontWeight: '900' }}>🔔 SET REMINDER</Text>
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
          ) : (
            <Text style={{ color: '#8E8E93' }}>No pending moves</Text>
          )}
        </View>

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
