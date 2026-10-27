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
suggestedCompletedSteps?: string[];
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

// Multi-step programs are DRAFTS, not ordinary single Next Move coaching.
// A caller must show the proposal and obtain user approval before saving it.
export type GoalProgramMove = { title: string; steps: string[]; minutes: number | null };
export type GoalProgramPhase = { title: string; description: string; moves: GoalProgramMove[] };
export type CoachEvidence = {
  title: string;
  organization: string;
  url: string;
  note: string;
  origin: 'curated' | 'search';
};
export type CoachScheduleAdvice = {
  headline: string;
  explanation: string;
  optionalChange: string;
  permissionRequired: true;
};
export type GoalProgram = {
  title: string;
  summary: string;
  estimatedWeeks: number | null;
  phases: GoalProgramPhase[];
  scheduleAdvice?: CoachScheduleAdvice | null;
  sources?: CoachEvidence[];
  researchStatus?: 'curated' | 'live' | 'unavailable';
};

export async function getGoalProgramProposal(input: {
  goalTitle: string;
  userMessage: string;
  goalKind?: 'finite' | 'ongoing';
  currentMilestone?: string;
  existingMilestones?: string[];
  scheduleSummary?: string;
  researchOptIn?: boolean;
  kneeReadiness?: 'still' | 'better' | 'unsure';
  progressEntries?: Array<{ entry_type: string; content: string; created_at?: string }>;
}): Promise<GoalProgram | null> {
  try {
    const { data, error } = await supabase.functions.invoke('goal-coach', {
      body: { mode: 'program-plan', ...input },
    });
    if (error || !data || data.error) {
      console.warn('Could not request a goal program:', error ?? data?.error);
      return null;
    }
    const plan = data.program;
    if (!plan || typeof plan.title !== 'string' || !Array.isArray(plan.phases) ||
      plan.phases.length === 0 || !plan.phases.every((phase: any) =>
        typeof phase.title === 'string' && Array.isArray(phase.moves) &&
        phase.moves.length > 0 && phase.moves.every((move: any) =>
          typeof move.title === 'string' && Array.isArray(move.steps)))) return null;
    return plan as GoalProgram;
  } catch (error) {
    console.warn('Goal program request failed:', error);
    return null;
  }
}


// A request for help RIGHT NOW is not a request for a multi-week program.
// This produces one reviewable action. It never saves or starts anything.
export type QuickMoveProposal = {
  milestoneTitle: string;
  milestonePurpose: string;
  move: { title: string; steps: string[]; minutes: number | null };
  note: string;
  activityMinutes: number;
  totalMinutes: number | null;
};
export async function getQuickMoveProposal(input: {
  goalTitle: string;
  userMessage: string;
  activityMinutes: number;
  kneeReadiness?: 'still' | 'better' | 'unsure';
  lastMilestone?: string;
  previousActions?: string[];
  progressEntries?: Array<{ entry_type: string; content: string; created_at?: string }>;
}): Promise<QuickMoveProposal | null> {
  try {
    const { data, error } = await supabase.functions.invoke('goal-coach', {
      body: { mode: 'quick-move', ...input },
    });
    if (error || data?.error) {
      console.warn('Quick move unavailable:', error ?? data?.error);
      return null;
    }
    const proposal = data?.proposal;
    if (!proposal || typeof proposal.milestoneTitle !== 'string' ||
      !proposal.milestoneTitle.trim() || typeof proposal.move?.title !== 'string' ||
      !proposal.move.title.trim() || !Array.isArray(proposal.move?.steps) ||
      !proposal.move.steps.every((item: unknown) => typeof item === 'string')) return null;
    return proposal as QuickMoveProposal;
  } catch (error) {
    console.warn('Quick move failed:', error);
    return null;
  }
}
