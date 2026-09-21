import { supabase } from "@/lib/supabase";

export type GoalCoachResponse = {
  message: string;
  action:
    | "KEEP_MOVE"
    | "ADJUST_MOVE"
    | "RESCHEDULE"
    | "ADJUST_PATH"
    | "RECONSIDER_GOAL";

  proposedMove?: {
    title: string;
    minutes: number | null;
    steps: string[];
  } | null;
};export async function getGoalCoachResponse(input: {
  goalTitle: string;
  nextMoveTitle: string;
  nextMoveMinutes?: number | null;
  milestones?: string[];
  userMessage: string;
}): Promise<GoalCoachResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke("goal-coach", {
      body: input,
    });

    if (error || !data) {
      console.log("GOAL'D IN Coach unavailable.", error);
      return null;
    }

    return data as GoalCoachResponse;
  } catch (error) {
    console.log("GOAL'D IN Coach failed.", error);
    return null;
  }
}