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
  estimatedMinutes?: number | null;
  whyThisMove: string | null;
  steps: string[];
} | null;
  coachMessage: string | null;
};
export async function getAIPlan(input: {
  title: string;
  outcome?: string | null;
  why?: string | null;
  deadline?: string | null;
  schedule?: string | null;
}): Promise<AIPlan | null> {
  try {
    // The current goal-it screen appends WHEN choices to WHY for compatibility.
    // Split them before submitting so the Coach can distinguish motivation
    // from timing, experience and the user's existing decisions.
    const marker = 'WHEN CONTEXT — user choices (do not treat suggestions as facts):';
    const combinedWhy = input.why ?? '';
    const whenStart = combinedWhy.indexOf(marker);
    const userWhy = whenStart >= 0 ? combinedWhy.slice(0, whenStart).trim() : combinedWhy.trim();
    const whenContext = whenStart >= 0 ? combinedWhy.slice(whenStart).trim() : '';

    const { data, error } = await supabase.functions.invoke('plan-goal', {
      body: {
        ...input,
        why: userWhy || null,
        whenContext: whenContext || null,
      },
    });

    if (error || !data) {
  console.log('AI planner unavailable — using local planner.', error ?? data?.error ?? 'No data');
  return null;
}
// Keep full plan and personal WHY out of routine production logs.
    return data as AIPlan;
  } catch (error) {
    console.log('AI planner failed — using local planner.', error);
    return null;
  }
}
export async function getWhySuggestions(
  title: string
): Promise<string[]> {
  if (!title.trim()) return [];

  try {
    const { data, error } = await supabase.functions.invoke(
      'plan-goal',
      {
        body: {
          mode: 'why-suggestions',
          title: title.trim(),
        },
      }
    );

    if (error || !Array.isArray(data?.suggestions)) {
      console.log('WHY suggestions unavailable:', error);
      return [];
    }

    return data.suggestions
      .filter(
        (item: unknown): item is string =>
          typeof item === 'string' && item.trim().length > 0
      )
      .map((item: string) => item.trim())
      .slice(0, 5);
  } catch (error) {
    console.log('Could not load WHY suggestions:', error);
    return [];
  }
}