/* Safe, idempotent, source-specific patch. It never replaces the whole wizard. */
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(process.cwd(), 'app', 'goal-it.tsx');
if (!fs.existsSync(target)) throw new Error(`Missing ${target}`);
const original = fs.readFileSync(target, 'utf8');
if (original.includes('goaldin-goal-it-ready-patch-v1')) {
  console.log('Goal creation reminder patch already present.'); process.exit(0);
}
function once(haystack, needle, replacement) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) throw new Error(`Patch not applied: expected one matching section, found ${count}: ${needle.slice(0, 75)}`);
  return haystack.replace(needle, replacement);
}
try {
  let s = original;
  const imports = "import { supabase } from '@/lib/supabase';";
  if (!s.includes("from '@react-native-async-storage/async-storage'")) {
    s = once(s, imports, imports + "\nimport AsyncStorage from '@react-native-async-storage/async-storage';");
  }
  // Make auto-preparation clear and controllable at the original commitment.
  s = once(s, "  const [scheduleType, setScheduleType] = useState<'once' | 'repeat' | null>(null);",
`  const [scheduleType, setScheduleType] = useState<'once' | 'repeat' | null>(null);
  const [autoPrepareNextMove, setAutoPrepareNextMove] = useState(true);`);
  s = once(s, `          wants_beginner_plan: runningGoal ? wantsBeginnerPlan : null,`,
`          wants_beginner_plan: runningGoal ? wantsBeginnerPlan : null,
          auto_prepare_routine: autoPrepareNextMove,`);
  s = once(s, `            <View style={{ marginTop: 20 }}>
              <GoalItButton onPress={create} disabled={saving} loading={saving} />`,
`            <Pressable onPress={() => setAutoPrepareNextMove((current) => !current)}
              accessibilityRole="checkbox" accessibilityState={{ checked: autoPrepareNextMove }}
              style={{ borderWidth: 1, borderColor: '#64512C', borderRadius: 12, padding: 13, marginTop: 16 }}>
              <Text style={{ color: '#E9C369', fontWeight: '800', fontSize: 12 }}>
                {autoPrepareNextMove ? '☑' : '☐'} KEEP MY NEXT MOVE READY
              </Text>
              <Text style={{ color: '#BDBDBD', lineHeight: 18, fontSize: 12, marginTop: 4 }}>
                After each session, the Coach can prepare a safe, ordinary next step inside my Path.
                I choose when to start. No schedule or reminder changes without my approval.
              </Text>
            </Pressable>
            <View style={{ marginTop: 20 }}>
              <GoalItButton onPress={create} disabled={saving} loading={saving} />`);
  s = once(s, `    setWantsBeginnerPlan(false);`, `    setWantsBeginnerPlan(false);
    setAutoPrepareNextMove(true);`);
  s = once(s, '    // Schedule the reminders chosen while creating this goal.',
`    // goaldin-goal-it-ready-patch-v1
    // Preserve WHEN locally as well as in the existing goal_created event. The
    // TODAY screen then recognizes the user's commitments immediately.
    const notificationIds = [];
    if (scheduleType === 'repeat' && scheduleDays.length) {
      try {
        await AsyncStorage.setItem(\`goal-schedule-\${goal.id}\`, JSON.stringify({
          version: 2, dayTimes: scheduleDays, notificationIds: [],
        }));
      } catch (saveError) { console.warn('Could not cache new goal schedule:', saveError); }
    }
    // Schedule the reminders chosen while creating this goal.`);
  s = once(s, `    // goaldin-goal-it-ready-patch-v1`,
`    // Allow routine preparation only because the user saw this choice in WHEN.
    try {
      await AsyncStorage.setItem(\`goaldin-auto-prepare-\${goal.id}\`, String(autoPrepareNextMove));
    } catch (saveError) { console.warn('Could not cache Coach setting; cloud event remains the source:', saveError); }

    // goaldin-goal-it-ready-patch-v1`);
  s = once(s, `                    body: firstMove.title || \`Time to make progress on \${cleanTitle}.\`,
                    sound: true,`,
`                    // Resolve the latest move when the reminder is tapped;
                    // don't freeze the first action's title forever.
                    body: 'Your Next Move is ready when you are.',
                    sound: true,
                    data: { goalId: goal.id, source: 'goal-schedule' },`);
  s = once(s, '                await Notifications.scheduleNotificationAsync({',
`                const notificationId = await Notifications.scheduleNotificationAsync({`);
  // First register every notification ID before the next one is scheduled.
  s = once(s, `                  },
                });
              } catch (notifyError)`, `                  },
                });
                notificationIds.push(notificationId);
              } catch (notifyError)`);
  s = once(s, `    setTitle('');`,
`    // Keep notification IDs so future schedule edits can cancel old reminders.
    if (scheduleType === 'repeat' && scheduleDays.length) {
      try {
        await AsyncStorage.setItem(\`goal-schedule-\${goal.id}\`, JSON.stringify({
          version: 2, dayTimes: scheduleDays, notificationIds,
        }));
      } catch (saveError) { console.warn('Could not preserve reminder IDs:', saveError); }
    }

    setTitle('');`);
  // After a brand-new goal, reveal the actual Path even if the NEXT scheduled
  // session is tomorrow. Avoid an apparently empty TODAY on the first launch.
  s = once(s, `      router.replace('/today');
    }, 700);`, `      router.replace(\`/goal/\${goal.id}\`);
    }, 700);`);
  const backup = target + '.before-ready-loop';
  fs.writeFileSync(backup, original, {flag:'wx'});
  fs.writeFileSync(target, s);
  console.log('Updated goal-it.tsx: reminder payload, schedule IDs, and new-goal Path landing.');
  console.log(`Backup: ${backup}`);
} catch (error) {
  console.error(String(error.message ?? error));
  process.exitCode = 1;
}
