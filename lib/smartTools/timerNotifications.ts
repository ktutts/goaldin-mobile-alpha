import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { TimerStage } from './types';

const TIMER_CHANNEL = 'goaldin-timers';

export async function prepareTimerNotifications(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();

  let granted = existing.granted;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }

  if (!granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(TIMER_CHANNEL, {
      name: 'GOAL’D IN Timers',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 300, 200, 300],
    });
  }

  return true;
}
export async function scheduleTimerNotification(
  finishTime: number
): Promise<string | null> {
 const ready = await prepareTimerNotifications();

console.log('Timer notification permission:', ready);

if (!ready) return null;
  const seconds = Math.max(
    1,
    Math.ceil((finishTime - Date.now()) / 1000)
  );
console.log('Scheduling timer notification:', seconds);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'GOAL’D IN — Timer Finished',
      body: 'Your timer is up. Record your progress and get after your next move.',
      sound: 'default',
      data: { goaldinTimer: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: TIMER_CHANNEL,
    },
  });
}
export async function cancelTimerNotifications(): Promise<void> {
  const scheduled =
    await Notifications.getAllScheduledNotificationsAsync();

  const timerNotifications = scheduled.filter(
  (notification) =>
    notification.content.data?.goaldinTimer === true ||
    notification.content.title?.includes('Timer Finished')
);
  for (const notification of timerNotifications) {
    await Notifications.cancelScheduledNotificationAsync(
      notification.identifier
    );
  }
}
export async function scheduleGuidedTimerNotifications(
  stages: TimerStage[],
  firstStageEndAt: number
): Promise<void> {
  if (!stages.length) return;

  const ready = await prepareTimerNotifications();
  if (!ready) return;

  let stageEndAt = firstStageEndAt;

  for (let i = 0; i < stages.length; i++) {
    if (i > 0) {
      stageEndAt += stages[i].seconds * 1000;
    }

    if (stageEndAt <= Date.now()) continue;

    const nextStage = stages[i + 1];

    await Notifications.scheduleNotificationAsync({
      content: {
        title: nextStage
          ? "GOAL'D IN — Next Stage"
          : "GOAL'D IN — Activity Complete",
        body: nextStage
          ? `Up next: ${nextStage.label}`
          : 'Your guided activity is complete.',
        sound: 'default',
        data: { goaldinTimer: true },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(
          1,
          Math.ceil((stageEndAt - Date.now()) / 1000)
        ),
        channelId: TIMER_CHANNEL,
      },
    });
  }
}