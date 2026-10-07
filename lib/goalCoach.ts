import { supabase } from "@/lib/supabase";

export type GoalCoachResponse = {
  message: string;
  action:
    | "KEEP_MOVE"
    | "ADJUST_MOVE"
    | "RESCHEDULE"
    | "ADJUST_PATH"
    | "RECONSIDER_GOAL";
moveStatus: "unchanged" | "completed" | "needs_adaptation";
completedSteps?: string[];
 recordedProgress?: {
  entryType:
    | "result"
    | "learned"
    | "decision"
    | "blocker"
    | "need"
    | "note";
  content: string;
} | null;
need?: {
  title: string;
  category?: string | null;
  status: "open" | "resolved";
  solutionType?: "product" | "service" | "information" | "person" | "other";
} | null;
  proposedMove?: {
    title: string;
    minutes: number | null;
    steps: string[];
  } | null;

};
export async function getGoalCoachResponse(input: {
  goalTitle: string;
  nextMoveTitle: string;
  nextMoveMinutes?: number | null;
  nextMoveSteps?: string[];
completedSteps?: string[];
  milestones?: string[];

  progressEntries?: Array<{
    entry_type: string;
    content: string;
    created_at?: string;
  }>;

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