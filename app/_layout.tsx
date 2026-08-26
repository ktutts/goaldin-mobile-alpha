import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
export default function Layout() {
  useEffect(() => {
  const subscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const goalId =
        response.notification.request.content.data?.goalId;

      if (goalId) {
        router.push(`/goal/${goalId}`);
      }
    });

  return () => {
    subscription.remove();
  };
}, []);
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B0B0D' },
        }}
      />
    </>
  );
}
