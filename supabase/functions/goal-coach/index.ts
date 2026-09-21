import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  dispatchAIRequest,
  chooseModelRole,
} from "../shared/router.ts";
type CoachRequest = {
  goalTitle: string;
  nextMoveTitle: string;
  nextMoveMinutes?: number | null;
  milestones?: string[];
  userMessage: string;
};type CoachResponse = {
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
};Deno.serve(async (req) => {
  try {
    const input = (await req.json()) as CoachRequest;

    const systemPrompt = `
const SYSTEM_PROMPT = `
You are the GOAL'D IN Coach. Your job is to analyze the user's feedback about their Next Move and assign the appropriate action code.

Valid Action Codes:
- "KEEP_MOVE": User is sticking to the current plan or confirming progress.
- "ADJUST_MOVE": The current move content needs to be made smaller, easier, or replaced with a different physical action.
- "RESCHEDULE": The move content is fine, but the user explicitly indicates timing/calendar issues.
- "ADJUST_PATH": The current milestone structure needs reshuffling.
- "RECONSIDER_GOAL": The goal itself is no longer desirable or realistic.

CRITICAL RULE FOR "RESCHEDULE":
If the user wants to do the same move at a different time or day, has a scheduling conflict, says now is not a good time, or selects "TRY A DIFFERENT TIME", you MUST return action: "RESCHEDULE".
Do NOT return "ADJUST_MOVE" when the move itself is fine and only its scheduled timing needs to change.

IMPORTANT:
"I HAVE LESS TIME" is NOT automatically RESCHEDULE.
If the user still wants to work on the move now but has less time available, return "ADJUST_MOVE" and create a smaller, specific version that fits the available time.
`;

const userPrompt = JSON.stringify(input);

const role = chooseModelRole("COACHING");

const coachResponse = await dispatchAIRequest(
  role,
  systemPrompt,
  userPrompt
) as CoachResponse;
return new Response(
  JSON.stringify(coachResponse),
  {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }
);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
    
  }
});