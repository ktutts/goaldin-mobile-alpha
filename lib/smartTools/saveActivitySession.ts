import { supabase } from '../supabase';
import type { ActivitySession } from './types';

export async function saveActivitySession(
  session: ActivitySession
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to record activity.');
  }

  const { error } = await supabase
    .from('activity_sessions')
    .upsert({
      id: session.id,
      user_id: user.id,
      goal_id: session.goalId,
      milestone_id: session.milestoneId,
      action_id: session.actionId,
      status: session.status,
      started_at: session.startedAt ?? null,
      ended_at: session.endedAt ?? null,
      metrics: session.metrics,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}