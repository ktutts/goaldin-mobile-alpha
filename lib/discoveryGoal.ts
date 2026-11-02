import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getAIPlan } from '@/lib/aiPlanner';
import { buildMilestoneDrafts, classifyGoal } from '@/lib/goalPlanner';
import type { CoachDiscovery } from '@/lib/discoveryCoach';

// A confirmed Discovery can become a goal without another WHAT/WHY/WHEN form.
// No deadline, reminder or schedule is created without user consent.
export async function createDiscoveryGoal(discovery: CoachDiscovery): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to create a goal.');
  const title = discovery.title.trim().slice(0, 160);
  if (!title) throw new Error('This discovery needs a title.');
  const key = `goaldin-discovery-goal-${user.id}-${title.toLowerCase()}`;
  const existingId = await AsyncStorage.getItem(key);
  if (existingId) {
    const { data } = await supabase.from('goals').select('id').eq('id', existingId).eq('user_id', user.id).maybeSingle();
    if (data?.id) return data.id;
  }
  const why = `Suggested by GOAL'D IN Discovery. ${discovery.idea}`;
  const ai = await getAIPlan({ title, outcome: null, why, deadline: null, schedule: null });
  const classification = ai ? { horizon: ai.horizon, planningMode: ai.planningMode } : classifyGoal({ title, deadline: null });
  const drafts = ai?.milestones?.length ? ai.milestones : buildMilestoneDrafts({
    title, outcome: '', why, deadline: null, horizon: classification.horizon, planningMode: classification.planningMode,
  });
  if (!drafts.length) throw new Error('The Coach could not build a Path. Please try again.');
  const { data: goal, error } = await supabase.from('goals').insert({
    user_id: user.id, title, status: 'active', is_practice: false,
  }).select('id').single();
  if (error || !goal) throw new Error(error?.message || 'Could not create goal.');
  // Save the ID immediately so retrying after a partial failure never creates a duplicate.
  await AsyncStorage.setItem(key, goal.id);
  const { data: milestones, error: mError } = await supabase.from('milestones').insert(drafts.map((m, position) => ({
    user_id: user.id, goal_id: goal.id, title: m.title, description: m.description ?? null,
    weight: Math.max(1, Math.min(100, Math.round(Number(m.weight)) || 1)), position,
    status: position === 0 ? 'active' : 'pending',
  }))).select('id,position,title,description');
  if (mError || !milestones?.length) throw new Error(`Goal saved, but Path setup needs attention: ${mError?.message || 'no milestones'}`);
  const first = ai?.firstMove;
  const { error: aError } = await supabase.from('actions').insert([...milestones].sort((a,b) => a.position-b.position).map((m, index) => {
    const move = index === 0 ? first : drafts[m.position]?.nextMove;
    return { user_id: user.id, goal_id: goal.id, milestone_id: m.id,
      title: move?.title?.trim() || m.description?.trim() || m.title,
      status: 'pending', estimated_minutes: move?.estimatedMinutes ?? null,
      steps: move?.steps ?? [], type: 'task', position: index };
  }));
  if (aError) throw new Error(`Goal saved, but its Next Moves need attention: ${aError.message}`);
  await supabase.from('events').insert({ user_id: user.id, object_id: goal.id, event_type: 'goal_created',
    metadata: { title, source: 'discovery', discovery_idea: discovery.idea,
      when_context: { version: 1, goal_type_choice: 'undecided', target_date: null,
        schedule_type: null, schedule_days: [], typed_schedule: null, auto_prepare_routine: true } } });
  await AsyncStorage.setItem(`goaldin-auto-prepare-${goal.id}`, 'true');
  return goal.id;
}
