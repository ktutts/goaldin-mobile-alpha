import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  dispatchAIRequest,
  chooseModelRole,
} from "../shared/router";

type ScheduleRequest = {
  goalTitle: string;
  why?: string;
  barriers?: string[];
};

Deno.serve(async (req) => {
  try {
    const input: ScheduleRequest = await req.json();

    const systemPrompt = `
You are the GOAL'D IN scheduling coach.

Your job is to suggest a realistic schedule that helps the user actually make progress on their goal.

Consider:
- the goal
- why it matters
- anything the user says could get in the way

Choose a schedule that is simple and sustainable.

Return JSON only in exactly this shape:

{
  "type": "once" | "repeat",
  "days": [1, 2, 3],
  "time": "18:00",
  "reason": "Short explanation of why this schedule fits."
}

DAY NUMBERS:
1 = Sunday
2 = Monday
3 = Tuesday
4 = Wednesday
5 = Thursday
6 = Friday
7 = Saturday

RULES:
- Use "repeat" for goals that normally require repeated action, such as fitness, learning, habits, training, or ongoing projects.
- Use "once" when one scheduled session is the appropriate next action.
- For repeating schedules, choose realistic days rather than automatically scheduling every day.
- Use a 24-hour HH:MM time.
- Keep the reason short and practical.
- Do not include markdown.
- Do not include any text outside the JSON.
`;

    const userPrompt = JSON.stringify(input);

    const role = chooseModelRole("COACHING");

    const response = await dispatchAIRequest(
      role,
      systemPrompt,
      userPrompt
    );

    const raw =
      typeof response === "string"
        ? response
        : JSON.stringify(response);

    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const schedule = JSON.parse(cleaned);

    return new Response(JSON.stringify(schedule), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Suggested schedule error:", error);

    return new Response(
      JSON.stringify({
        error: "Unable to create suggested schedule",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
});