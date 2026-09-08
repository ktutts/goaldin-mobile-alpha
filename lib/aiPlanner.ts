import { supabase } from '@/lib/supabase';
import type { GoalHorizon, PlanningMode } from '@/types/models';
import type { MilestoneDraft } from '@/lib/goalPlanner';

export type AIPlan = {
  normalizedTitle: string;
  outcome: string | null;

  horizon: GoalHorizon;
  planningMode: PlanningMode;

  needsClarification: boolean;
  clarificationQuestion: string | null;
  clarificationOptions: string[];

  milestones: MilestoneDraft[];

  firstMove: {
    title: string;
    estimatedMinutes: number | null;
    whyThisMove: string | null;
  } | null;

  coachMessage: string | null;
};
export async function getAIPlan(input: {
  title: string;
  outcome?: string | null;
  why?: string | null;
  deadline?: string | null;
}): Promise<AIPlan | null> {
  try {
    const { data, error } = await supabase.functions.invoke('plan-goal', {
      body: input,
    });

    if (error || !data) {
      console.log('AI planner unavailable — using local planner.');
      return null;
    }

    return data as AIPlan;
  } catch (error) {
    console.log('AI planner failed — using local planner.', error);
    return null;
  }
}