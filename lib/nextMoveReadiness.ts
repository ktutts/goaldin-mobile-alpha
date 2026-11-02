import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { prepareNextMoveLaunch } from '@/lib/workoutLaunch';

/**
 * Prepares ONE routine Next Move within an already accepted, active milestone.
 * It NEVER changes schedules, marks milestones/goals achieved, creates a
 * reminder, connects a monitor, or starts an activity session.
 *
 * This is intentionally foreground-only. A future server transaction should
 * replace the last check/insert for strict cross-device idempotency.
 */
export type ReadinessResult =
  | { state: 'ready' | 'prepared'; actionId: string }
  | { state: 'no_completed_work' | 'no_active_milestone' | 'not_active' | 'throttled' }
  | { state: 'review_milestone' | 'needs_review' | 'unavailable'; detail: string };

const jobs = new Map<string, Promise<ReadinessResult>>();
const recentAttempts = new Map<string, number>();
const ATTEMPT_COOLDOWN_MS = 5 * 60 * 1000;

function cleanText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function isRoutineSafe(title: string, steps: string[], progress: Array<{entry_type?: string; content?: string}>) {
  // Defer a concerning symptom/blocker or work that requires a consequential
  // purchase, dangerous operation, medical decision, or other outside consent.
  const notes = progress.slice(0, 12);
  if (notes.some((item) => item.entry_type === 'blocker')) return false;
  if (notes.some((item) => {
    const content = (item.content ?? '').replace(/\b(?:no|without|free of|zero|not experiencing)\s+(?:knee\s+)?(?:pain|injury|dizziness|swelling)\b/gi, '');
    return /\b(pain|injur(?:y|ed)|knee hurts|dizzi(?:ness|y)|faint|swollen|chest tight|short of breath)\b/i.test(content);
  })) return false;
  const words = `${title} ${steps.join(' ')}`;
  return !/\b(purchase|buy|order parts|pay for|wire money|prescri(?:be|ption)|medicat(?:e|ion)|surgery|live electrical|high voltage|weld|torch|grind metal|operate heavy machinery|lift heavy|hazardous chemicals|demolition)\b/i.test(words);
}

async function scheduleSummary(goalId: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(`goal-schedule-${goalId}`);
    const saved = raw ? JSON.parse(raw) : null;
    let days: Array<{day: number; times: string[]}> = Array.isArray(saved?.dayTimes) ? saved.dayTimes : [];
    if (!days.length) {
      const { data } = await supabase.from('events')
        .select('event_type,metadata').eq('object_id', goalId)
        .in('event_type', ['goal_created','goal_schedule_updated'])
        .order('created_at', { ascending: false }).limit(3);
      for (const event of data ?? []) {
        const item = event.event_type === 'goal_created' ? event.metadata?.when_context : event.metadata;
        if (Array.isArray(item?.dayTimes)) { days = item.dayTimes; break; }
        if (Array.isArray(item?.schedule_days)) { days = item.schedule_days; break; }
      }
    }
    const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days.filter((d) => d && Number.isInteger(d.day) && d.day >= 1 && d.day <= 7)
      .map((d) => `${names[d.day - 1]}: ${(Array.isArray(d.times) ? d.times : []).join(', ')}`)
      .join('; ') || 'No recurring schedule confirmed. Do not invent appointments.';
  } catch { return 'Schedule unavailable. Do not invent appointments.'; }
}

async function run(goalId: string): Promise<ReadinessResult> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { state: 'unavailable', detail: 'Sign in is required.' };
  const { data: goal, error: goalError } = await supabase.from('goals')
    .select('id,title,status,is_practice').eq('id', goalId).eq('user_id', user.id).maybeSingle();
  if (goalError || !goal || goal.status !== 'active') return { state: 'not_active' };

  // Explicit per-goal consent, checked from the latest synced event so a
  // preference change on a different device is respected too. Legacy goals
  // without consent default OFF.
  const localPreference = await AsyncStorage.getItem(`goaldin-auto-prepare-${goalId}`).catch(() => null);
  const { data: preferenceEvents, error: preferenceError } = await supabase.from('events')
    .select('event_type,metadata').eq('object_id', goalId)
    .in('event_type', ['goal_created','goal_preparation_preference_updated'])
    .order('created_at', { ascending: false }).limit(3);
  if (preferenceError) return { state: 'unavailable', detail: 'Could not verify your Coach preference.' };
  const latest = (preferenceEvents ?? [])[0];
  const cloudApproved = latest?.event_type === 'goal_created'
    ? latest.metadata?.when_context?.auto_prepare_routine
    : latest?.metadata?.enabled;
  const routineApproved = typeof cloudApproved === 'boolean'
    ? cloudApproved : localPreference === 'true';
  if (!routineApproved) return { state: 'needs_review', detail: 'Routine preparation is off for this goal.' };

  const { data: milestone, error: milestoneError } = await supabase.from('milestones')
    .select('id,title,description,status,position').eq('goal_id', goalId)
    .eq('user_id', user.id).eq('status', 'active')
    .order('position', { ascending: true }).limit(1).maybeSingle();
  if (milestoneError) return { state: 'unavailable', detail: milestoneError.message };
  if (!milestone) return { state: 'no_active_milestone' };

  const { data: pending, error: pendingError } = await supabase.from('actions')
    .select('id').eq('goal_id', goalId).eq('milestone_id', milestone.id)
    .eq('user_id', user.id).eq('status', 'pending')
    .order('position', { ascending: true }).limit(1);
  if (pendingError) return { state: 'unavailable', detail: pendingError.message };
  if (pending?.length) return { state: 'ready', actionId: String(pending[0].id) };

  const [movesRes, progressRes] = await Promise.all([
    supabase.from('actions').select('id,title,status,position,completed_at')
      .eq('goal_id', goalId).eq('milestone_id', milestone.id)
      .eq('user_id', user.id).order('position', { ascending: false }).limit(40),
    supabase.from('progress_entries').select('entry_type,content,created_at')
      .eq('goal_id', goalId).eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(20),
  ]);
  if (movesRes.error || progressRes.error) {
    return { state: 'unavailable', detail: movesRes.error?.message ?? progressRes.error?.message ?? 'Could not load progress.' };
  }
  const completed = (movesRes.data ?? []).filter((m: any) => m.status === 'completed');
  if (!completed.length) return { state: 'no_completed_work' }; // New goals already have a first Move.
  const lastKey = `${user.id}:${milestone.id}`;
  if (Date.now() - (recentAttempts.get(lastKey) ?? 0) < ATTEMPT_COOLDOWN_MS) return { state: 'throttled' };
  recentAttempts.set(lastKey, Date.now());
  const progress = (progressRes.data ?? []).map((p: any) => ({
    entry_type: cleanText(p.entry_type, 30), content: cleanText(p.content, 700), created_at: p.created_at,
  }));
  if (!isRoutineSafe('', [], progress)) {
    return { state: 'needs_review', detail: 'A recent concern deserves a person-approved adjustment, not automatic progression.' };
  }

  // A completed set of planned Moves is a review point, not permission
  // to generate another action and block the user's milestone confirmation.
  if ((movesRes.data ?? []).length > 0 &&
      (movesRes.data ?? []).every((m: any) => m.status === 'completed')) {
    return { state: 'review_milestone', detail: 'Review this milestone before preparing another Move.' };
  }

  const { data: response, error: coachError } = await supabase.functions.invoke('goal-coach', {
    body: {
      mode: 'continue-milestone', routineApproved: true,
      goalTitle: goal.title, currentMilestone: milestone.title,
      milestoneDescription: milestone.description ?? '',
      completedMoves: [...completed].reverse().map((m: any) => m.title),
      scheduleSummary: await scheduleSummary(goalId),
      progressEntries: progress,
      userMessage: 'Prepare one safe, ordinary next session INSIDE my already accepted milestone. Respect recorded progress and current readiness. My existing WHEN schedule stays unchanged. If I may have achieved the milestone, or a consequential decision or safety question is involved, request my review instead. Do not invent a new reminder, promise a date, or start recording.',
    },
  });
  if (coachError || response?.error) return { state: 'unavailable', detail: cleanText(response?.error, 200) || coachError?.message || 'Coach unavailable.' };
  if (response?.milestoneReached === true) return { state: 'review_milestone', detail: cleanText(response?.message, 350) || 'Review and confirm this achievement.' };
  // The live Edge Function must explicitly authorize this limited routine mode.
  // Until updated/deployed, no automated AI-written changes are permitted.
  if (response?.routineReady !== true) {
    return { state: 'needs_review', detail: 'Coach approval for routine preparation is not enabled yet.' };
  }
  const proposed = response?.proposedMove;
  const title = cleanText(proposed?.title, 180);
  const steps = Array.isArray(proposed?.steps) ? proposed.steps
    .map((v: unknown) => cleanText(v, 260)).filter(Boolean).slice(0, 5) : [];
  if (!title || steps.length === 0 || !isRoutineSafe(title, steps, progress)) {
    return { state: 'needs_review', detail: 'The next action needs personal review.' };
  }
  if (completed.some((m: any) => cleanText(m.title, 180).toLowerCase() === title.toLowerCase())) {
    return { state: 'needs_review', detail: 'The Coach repeated a completed Move.' };
  }

  // Re-read live status before inserting, so a user-approved manual change or
  // another device's new Move is respected. This check is not a DB transaction.
  const [liveMilestone, liveGoal, livePending, existingActions] = await Promise.all([
    supabase.from('milestones').select('id,status').eq('id', milestone.id).eq('user_id', user.id).single(),
    supabase.from('goals').select('id,status').eq('id', goalId).eq('user_id', user.id).single(),
    supabase.from('actions').select('id').eq('milestone_id', milestone.id).eq('status', 'pending').eq('user_id', user.id).limit(1),
    supabase.from('actions').select('position').eq('goal_id', goalId).eq('user_id', user.id),
  ]);
  if (liveMilestone.error || liveGoal.error || livePending.error || existingActions.error) {
    return { state: 'unavailable', detail: 'Could not verify the latest Path state.' };
  }
  if (liveMilestone.data?.status !== 'active' || liveGoal.data?.status !== 'active') return { state: 'not_active' };
  // Reconfirm consent after the network/AI round-trip. Preference can change
  // while the Coach is generating an action.
  const { data: newestPreference } = await supabase.from('events')
    .select('event_type,metadata').eq('object_id', goalId)
    .in('event_type', ['goal_created','goal_preparation_preference_updated'])
    .order('created_at', { ascending: false }).limit(1);
  const choice = (newestPreference ?? [])[0];
  const newestAllowed = choice?.event_type === 'goal_created'
    ? choice.metadata?.when_context?.auto_prepare_routine
    : choice?.metadata?.enabled;
  if (newestAllowed !== true) return { state: 'needs_review', detail: 'Routine preparation is no longer enabled.' };
  if (livePending.data?.length) return { state: 'ready', actionId: String(livePending.data[0].id) };
  const position = Math.max(-1, ...(existingActions.data ?? []).map((a: any) => Number(a.position ?? -1))) + 1;
  const minutes = proposed.minutes;
  const { data: created, error: insertError } = await supabase.from('actions').insert({
    user_id: user.id, goal_id: goalId, milestone_id: milestone.id,
    title, steps, completed_steps: [], status: 'pending', type: 'task', position,
    estimated_minutes: typeof minutes === 'number' && minutes > 0 && minutes <= 240 ? Math.round(minutes) : null,
  }).select('id').single();
  if (insertError || !created) return { state: 'unavailable', detail: insertError?.message ?? 'Next Move was not saved.' };

  // History is helpful but never required to do the work. No sensitive notes in metadata.
  void supabase.from('events').insert({
    user_id: user.id, object_id: goalId, event_type: 'routine_next_move_prepared',
    metadata: { action_id: created.id, milestone_id: milestone.id, source: 'approved_path_continuation' },
  }).then(({ error }: { error: any }) => { if (error) console.warn('Could not log prepared Next Move:', error.message); });
  void prepareNextMoveLaunch({ goalId, milestoneId: milestone.id, actionId: created.id, actionTitle: title, steps })
    .catch((error: unknown) => console.warn('Could not cache prepared tools:', error));
  return { state: 'prepared', actionId: String(created.id) };
}

/** Single-flight on this device, with a short retry cooldown. */
export function ensureNextMoveReady(goalId: string): Promise<ReadinessResult> {
  if (!goalId) return Promise.resolve({ state: 'not_active' });
  const existing = jobs.get(goalId);
  if (existing) return existing;
  const job = run(goalId).catch((error): ReadinessResult => ({
    state: 'unavailable', detail: error instanceof Error ? error.message : 'Could not prepare the next Move.',
  })).finally(() => { jobs.delete(goalId); });
  jobs.set(goalId, job);
  return job;
}
