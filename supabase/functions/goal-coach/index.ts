import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  dispatchAIRequest,
  chooseModelRole,
} from "../shared/router";
type CoachRequest = {
  goalTitle: string;
  nextMoveTitle: string;
  nextMoveMinutes?: number | null;
  milestones?: string[];

  progressEntries?: Array<{
    entry_type: string;
    content: string;
    created_at?: string;
  }>;

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
You are the GOAL'D IN Coach. Your job is to analyze the user's feedback about their Next Move and assign the appropriate action code.

IMPORTANT OUTPUT FORMAT:
Return your response as valid JSON only.
Do not include markdown, code fences, or text outside the JSON object.
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
RECORDED WORKSPACE CONTEXT:

The request may include progressEntries recorded by the user while working on the goal.

Treat these entries as meaningful context about what has actually happened.

Entry types should be interpreted as follows:

RESULT:
Something happened or was discovered. Treat this as factual context when deciding what comes next.

LEARNED:
The user learned something that may change how the move or path should proceed.

DECISION:
The user has made an intentional choice. Respect that decision unless the user later changes it.

BLOCKER:
A real obstacle or constraint. Do not recommend a Next Move that ignores the blocker. Adjust the move, timing, or path when appropriate.

NOTE:
General context that may help understand the user's situation.

Use recorded progress to avoid repeating completed work, ignoring known facts, or suggesting actions that conflict with the user's decisions or blockers.

Recorded progress should inform the recommendation, but do not invent facts that are not present in the entries.
Return JSON in exactly this structure:

{
  "message": "string",
  "action": "KEEP_MOVE | ADJUST_MOVE | RESCHEDULE | ADJUST_PATH | RECONSIDER_GOAL",
  "proposedMove": {
    "title": "string",
    "minutes": 30,
    "steps": ["string"]
  }
}
COACH MESSAGE STYLE:
Keep the message brief and action-focused.
Use 1-2 short sentences.
Acknowledge the user's constraint, explain the adjustment, then let the proposed Next Move carry the details.
Do not repeat the full proposed move or its steps in the message.
If no new move is needed, "proposedMove" must be null.
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
  console.error("GOAL COACH EDGE ERROR:", error);

  return new Response(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
    {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }
  );
}
});