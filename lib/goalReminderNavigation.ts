import { useEffect } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const LAST_HANDLED = 'goaldin-last-opened-goal-reminder';

/**
 * Install once in the root layout. A scheduled goal reminder opens the CURRENT
 * pending action, via the Goal screen, even if the original action has changed.
 * Does not start the timer, activity tracking or BLE monitoring.
 */
export function useGoalReminderNavigation({
  navigationReady,
  onOpenReminder,
}: {
  navigationReady: boolean;
  onOpenReminder: () => void;
}): void {
  useEffect(() => {
    if (!navigationReady) return;
    let active = true;
    const handling = new Set<string>();
    const open = async (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      const legacyGoalReminder = data?.source == null &&
        typeof data?.goalId === 'string' && !!data.goalId &&
        !data?.timerId && !data?.actionId && !data?.milestoneId;
      if (!(data?.source === 'goal-schedule' || legacyGoalReminder) ||
          typeof data.goalId !== 'string' || !data.goalId) return;
      // Ignore dismissals or unrelated custom notification actions.
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const key = [response.notification.request.identifier,
        response.notification.date, response.actionIdentifier].join(':');
      if (handling.has(key)) return;
      handling.add(key);
      try {
        if ((await AsyncStorage.getItem(LAST_HANDLED)) === key) return;
        // Write before navigation; the live and cold-start handlers can both fire.
        await AsyncStorage.setItem(LAST_HANDLED, key);
      } catch (error) {
        console.warn('Reminder deduplication unavailable:', error);
      }
      if (!active) return;
      onOpenReminder(); // Prevent the opening cinematic from hiding the target.
      router.push({pathname: '/goal/[id]',
        params: {id: data.goalId, openNextMove: '1'}});
    };
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void open(response);
    });
    // Cold start: the listener may be installed AFTER the notification was tapped.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) void open(response);
    }).catch((error) => console.warn('Could not read reminder launch:', error));
    return () => {active = false; sub.remove();};
  }, [navigationReady, onOpenReminder]);
}
