import "jsr:@supabase/functions-js/edge-runtime.d.ts";
function buildFirstMove(title: string, target: string) {
  const text = `${title} ${target}`.toLowerCase();

  if (
    text.includes('strong') ||
    text.includes('muscle') ||
    text.includes('fitness') ||
    text.includes('workout')
  ) {
    return {
      title: 'Complete 3 sets of a basic strength exercise',
      estimatedMinutes: 10,
    };
  }

  if (
    text.includes('organize') ||
    text.includes('clean') ||
    text.includes('declutter')
  ) {
    return {
      title: 'Pick one small area and completely clear it',
      estimatedMinutes: 10,
    };
  }

  if (
    text.includes('money') ||
    text.includes('save') ||
    text.includes('income')
  ) {
    return {
      title: 'Write down your current numbers and choose one thing to improve',
      estimatedMinutes: 10,
    };
  }

  if (
    text.includes('learn') ||
    text.includes('study') ||
    text.includes('skill')
  ) {
    return {
      title: 'Spend 10 focused minutes on the first lesson',
      estimatedMinutes: 10,
    };
  }

  return {
    title: `Take one concrete step toward ${target}`,
    estimatedMinutes: 10,
  };
}
async function buildAIPlan(input: {
  title: string;
  outcome: string;
  why: string;
  deadline: string | null;
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
  console.log("AI DEBUG: OPENAI_API_KEY missing");
  return null;
}

console.log("AI DEBUG: key found, calling OpenAI");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `
You are the coaching engine for GOAL'D IN.

Your job is to turn a user's goal into a practical path that feels specific, motivating, and immediately useful.

Rules:
- Do not give generic filler.
- Make milestones concrete and recognizable.
- The first move should be something the user can actually do next.
- Keep the first move small enough to reduce friction.
- Ask for clarification only when the goal is too vague to plan responsibly.
- CoachMessage should sound concise, confident, supportive, and action-focused.
- Do not sound clinical, corporate, or overly motivational.
- Preserve the user's intent.
- Prefer progress over perfection.
- Make the first move concrete and specific to the actual goal, not generic planning language.
- The first move should answer: "What can this person actually do next to move this specific goal forward?"
- When useful, make the first move an assessment, checklist, preparation step, practice session, decision, purchase, conversation, or piece of work.
- Consider what the move actually requires: time, money, tools, materials, information, skills, people, or professional help.
- Only surface resources that are relevant to this goal and this move. Do not add unnecessary complexity.
- A move may have a suggested target date when timing would help the user reach the next milestone, but do not make every move require a deadline.
- Treat the plan as adaptable. If a move cannot be completed, does not work, or circumstances change, the plan should be able to change rather than treating that as failure.
- Milestones must describe meaningful goal-specific outcomes. Avoid generic milestone names such as "Define the finish line", 
  "Reach the first meaningful milestone", "Reach the halfway point", or "Complete the goal" when a more specific outcome can be identified.
- Distinguish simple tasks from multi-step projects.
- If the goal is a multi-step project, create enough milestones to represent the real phases of work. Usually 4 to 7 milestones.
- Do not use a single milestone for a multi-step project such as building, restoring, renovating, training for an event, launching something, or completing a long-term transformation.
- A firstMove completes only the immediate action toward the first milestone. Completing firstMove must not imply the entire goal is complete.
- Each milestone should represent a meaningful phase or outcome, not a single tiny task.
- The final milestone should represent the actual finished result of the goal.- 
firstMove must be the most useful concrete action the user can take next, not a generic planning statement.
- firstMove should directly advance the first milestone.
- Use the user's stated barriers when choosing firstMove. If time, money, tools, parts, know-how, or other constraints were provided, choose a move that accounts for them.
- Avoid firstMove titles such as "Define what finished looks like", "Define the goal", "Make a plan", or "Get started" when the goal provides enough context for a more specific action.
- Prefer an observable action: measure, inspect, photograph, list, call, research, practice, compare, gather, schedule, buy, repair, write, test, or complete something specific.
- firstMove should normally be completable in one sitting and should make the next decision easier.- 
- firstMove.steps should be a short practical checklist for completing firstMove.
- Use 2 to 6 steps when a checklist is useful.
- For very simple moves, steps may be an empty array.
- Each step should be concrete, observable, and specific to the current goal.
- Do not repeat the firstMove title as a step.
- Steps should help the user finish the move, not describe later milestones.
Return JSON only.
              `.trim(),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(input),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "goal_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              normalizedTitle: { type: "string" },
              outcome: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              horizon: {
                type: "string",
                enum: ["short", "medium", "long"],
              },
              planningMode: {
                type: "string",
                enum: ["task", "timed", "milestone"],
              },
              needsClarification: { type: "boolean" },
              clarificationQuestion: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              clarificationOptions: {
                type: "array",
                items: { type: "string" },
              },
              milestones: {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    weight: { type: "number" },
                    position: { type: "number" },
                  },
                  required: [
                    "title",
                    "description",
                    "weight",
                    "position",
                  ],
                },
              },
              firstMove: {
                anyOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      estimatedMinutes: {
                        anyOf: [{ type: "number" }, { type: "null" }],
                      },
                      whyThisMove: {
                        anyOf: [{ type: "string" }, { type: "null" }],
                      },
                      steps: {
  type: "array",
  items: { type: "string" },
},
                    },
                    required: [
                      "title",
                      "estimatedMinutes",
                      "whyThisMove",
                      "steps",
                    ],
                  },
                  { type: "null" },
                ],
              },
              coachMessage: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
            },
            required: [
              "normalizedTitle",
              "outcome",
              "horizon",
              "planningMode",
              "needsClarification",
              "clarificationQuestion",
              "clarificationOptions",
              "milestones",
              "firstMove",
              "coachMessage",
            ],
          },
        },
      },
      store: false,
    }),
  });

  if (!response.ok) {
    console.log("OpenAI planner failed:", response.status);
    return null;
  }

  const result = await response.json();

  const text =
  result?.output
    ?.flatMap((item: any) => item.content ?? [])
    ?.find((item: any) => item.type === "output_text")
    ?.text ?? null;

if (!text) {
  console.log("AI DEBUG: response succeeded but no output_text found");
  return null;
}

  return JSON.parse(text);
}
Deno.serve(async (req) => {
  try {
    const body = await req.json();

    const title = body?.title?.trim() || "";
    const outcome = body?.outcome?.trim() || "";
    const why = body?.why?.trim() || "";
    const deadline = body?.deadline || null;
    if (!title) {
      return new Response(
        JSON.stringify({ error: "Missing goal title" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
const aiPlan = await buildAIPlan({
  title,
  outcome,
  why,
  deadline,
});

if (aiPlan) {
  return new Response(JSON.stringify(aiPlan), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
    const target = outcome || title;
function buildSmartMilestones(
  title: string,
  target: string,
  deadline?: string | null
) {
  const text = `${title} ${target}`.toLowerCase();
  const goalName = target?.trim() || title.trim();

  // PUSH-UP GOALS
  if (text.includes('pushup') || text.includes('push up')) {
    return [
      {
        title: 'Complete your first 25 pushups',
        description: 'Start with a manageable first set.',
        weight: 33,
        position: 0,
      },
      {
        title: 'Reach 50 pushups',
        description: 'Build volume and consistency.',
        weight: 33,
        position: 1,
      },
      {
        title: 'Reach 75 pushups',
        description: 'Finish the final progression.',
        weight: 34,
        position: 2,
      },
    ];
  }

  // STRENGTH / FITNESS
  if (
    text.includes('strong') ||
    text.includes('strength') ||
    text.includes('muscle') ||
    text.includes('fitness') ||
    text.includes('workout')
  ) {
    return [
      {
        title: 'Establish your starting strength',
        description: 'Complete a simple strength session and record what you can do today.',
        weight: 33,
        position: 0,
      },
      {
        title: 'Build consistent strength',
        description: 'Complete several focused strength sessions and increase the challenge.',
        weight: 33,
        position: 1,
      },
      {
        title: `Prove your progress toward ${goalName}`,
        description: 'Repeat your starting test and beat your original result.',
        weight: 34,
        position: 2,
      },
    ];
  }

  // CLEAN / ORGANIZE
  if (
    text.includes('clean') ||
    text.includes('organize') ||
    text.includes('declutter')
  ) {
    return [
      {
        title: 'Clear one small area completely',
        description: 'Choose a visible area and finish it before moving on.',
        weight: 33,
        position: 0,
      },
      {
        title: 'Complete the main problem areas',
        description: 'Work through the spaces creating the most clutter or friction.',
        weight: 33,
        position: 1,
      },
      {
        title: 'Create a simple system to keep it organized',
        description: 'Give important items a permanent place and reset the space.',
        weight: 34,
        position: 2,
      },
    ];
  }

  // MONEY
  if (
    text.includes('money') ||
    text.includes('save') ||
    text.includes('income') ||
    text.includes('budget')
  ) {
    return [
      {
        title: 'Know your starting numbers',
        description: 'Write down the numbers that matter for this goal.',
        weight: 33,
        position: 0,
      },
      {
        title: 'Make the first measurable improvement',
        description: 'Take one action that moves the number in the right direction.',
        weight: 33,
        position: 1,
      },
      {
        title: `Reach your first meaningful win toward ${goalName}`,
        description: 'Measure the result and decide the next target.',
        weight: 34,
        position: 2,
      },
    ];
  }

  // LEARNING
  if (
    text.includes('learn') ||
    text.includes('study') ||
    text.includes('skill')
  ) {
    return [
      {
        title: 'Complete the first focused lesson',
        description: 'Learn one useful concept and apply it immediately.',
        weight: 33,
        position: 0,
      },
      {
        title: 'Practice until you can use it',
        description: 'Repeat the skill through real practice instead of only studying.',
        weight: 33,
        position: 1,
      },
      {
        title: `Demonstrate progress in ${goalName}`,
        description: 'Complete something that proves what you have learned.',
        weight: 34,
        position: 2,
      },
    ];
  }

  // GENERAL FALLBACK
  return [
    {
      title: `Define the first clear win for ${goalName}`,
      description: 'Turn the goal into one result you can clearly recognize as progress.',
      weight: 33,
      position: 0,
    },
    {
      title: `Create measurable progress toward ${goalName}`,
      description: 'Complete the next meaningful action and build momentum.',
      weight: 33,
      position: 1,
    },
    {
      title: `Complete the result for ${goalName}`,
      description: deadline
        ? `Finish the goal by ${deadline}.`
        : 'Finish the result you committed to.',
      weight: 34,
      position: 2,
    },
  ];
}
const plan = {
  normalizedTitle: title,
  outcome: outcome || null,

  horizon: "project",
  planningMode: "milestones",

  needsClarification: false,
  clarificationQuestion: null,
  clarificationOptions: [],

  milestones: buildSmartMilestones(title, target, deadline),

  firstMove: buildFirstMove(title, target),
  coachMessage:
  `We're starting with one clear move toward ${target || title}. Keep it simple, get the first win, then we'll build from there.`,
};

return new Response(JSON.stringify(plan), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

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