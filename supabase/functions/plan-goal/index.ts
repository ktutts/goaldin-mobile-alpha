
import {
  dispatchAIRequest,
  chooseModelRole,
} from "../shared/router.ts";

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
      
    };
  }

  if (
    text.includes('organize') ||
    text.includes('clean') ||
    text.includes('declutter')
  ) {
    return {
      title: 'Pick one small area and completely clear it',
     
    };
  }

  if (
    text.includes('money') ||
    text.includes('save') ||
    text.includes('income')
  ) {
    return {
      title: 'Write down your current numbers and choose one thing to improve',
      
    };
  }

  if (
    text.includes('learn') ||
    text.includes('study') ||
    text.includes('skill')
  ) {
    return {
      title: 'Spend 10 focused minutes on the first lesson',
      
    };
  }

  return {
    title: `Take one concrete step toward ${target}`,
  
  };
}
// MAKE SURE THIS IS AT THE VERY TOP OF INDEX.TS (Line 2):

function needsAI(title: string, target: string, why: string) {
  const text = `${title} ${target} ${why}`.toLowerCase();

  const complexSignals = [
    "career",
    "business",
    "launch",
    "strategy",
    "plan",
    "change my life",
    "don't know",
    "not sure",
    "figure out",
    "long term",
    "year",
    "learn",
"become",
"improve",
"master",
"build",
"create",
"develop",
"train for",
"prepare for",
  ];

  return complexSignals.some((word) => text.includes(word));
}
async function buildAIPlan(input: {
  title: string;
  target: string;
  why: string;
  deadline: string | null;
}) {
  try {
    const systemPrompt = `You are GOAL'D IN's executive strategy coach.
Your job is to turn a user's goal into a practical path that feels specific, motivating, and immediately actionable.

CRITICAL RULES:
UNDERSTAND THE USER'S WHY AND TIME HORIZON:

The user's WHY explains what matters to them, not necessarily how the goal should be completed.

A WHY may be simple ("I need this done"), practical ("My family needs reliable transportation"), or deeply personal ("I want stability and security").

Respect simple answers. Do not force emotional exploration or invent hidden motivations.

When the WHY is vague, recognize that the user may still be discovering what they want. Help them begin with a useful, achievable Next Move rather than demanding complete certainty.

Consider the goal, desired outcome, WHY, and deadline together.

Choose a realistic planning horizon:
- SHORT: A task that may take minutes, hours, or days.
- MEDIUM: A goal requiring weeks or months.
- LONG: A goal that may require years.
- ONGOING: A practice or direction without a fixed finish line.

Do not inflate simple tasks into complicated plans.
Do not compress major life changes into unrealistic deadlines.
A deadline is a constraint, not proof that the goal can be completed by then.

For ongoing goals, emphasize repeatable actions, consistency, and meaningful progress rather than a final 100% completion.

For uncertain goals, begin with a small exploratory Next Move that helps the user discover their direction.

Use the WHY to make milestones and Next Moves personally relevant, but never assume the user's emotional state or circumstances beyond what they shared.
DEEPER WHY AND MEANINGFUL ACTION:

Distinguish between what the user wants to change and why
that change matters to them.

When the WHY reveals a deeper desired outcome, use that
outcome to guide the milestones and Next Moves.

Example:
Goal: Feel better.
WHY: I want more energy to spend time with my family.

Do not create only a generic self-care plan.
Include practical actions that support better energy AND
meaningful opportunities to spend time with family.

The deeper WHY gives the Path purpose, but do not replace
the user's stated goal or invent motivations.

If the user simply says "I need this done," respect that.
Create the most direct, useful Path without requiring
further emotional exploration.

Avoid unnecessary planning exercises.
Whenever possible, the first Next Move should create
real-world progress rather than another list of things
to think about.
Before choosing the first Next Move, ask:
Will completing this action create meaningful progress toward
the user's stated goal and WHY?

Prefer an action the user can actually perform over an
unnecessary planning or brainstorming exercise.

If important information is missing, ask one useful question
or suggest a small discovery action.

Use existing tools such as checklists, reminders, and timers
when they genuinely help the user act.

Do not force timers or estimated durations onto the user.
A Next Move may take minutes, hours, days, or longer.

For ongoing goals, make the first action achievable while
keeping the larger Path open to continued growth and change.
For ongoing goals, build repeatable actions that serve
the user's WHY without inventing a final completion date.

For goals with uncertain timelines, recommend a realistic
starting approach that can adapt as the user learns more.
Every plan should respect the user's time and make the next useful action clear.
- Return ONE valid JSON object only.
- Every milestone MUST contain a nextMove.
- Every nextMove MUST contain a specific title, estimatedMinutes, whyThisMove, and actionable steps.
- Never create a milestone without a nextMove.
- Each nextMove should be something the user can actually begin doing.
- Give each nextMove 2-6 concrete checklist steps.
- estimatedMinutes must be a realistic number.
- The firstMove should match the nextMove of the first milestone.
CLARIFICATION RULE:
If the user's goal is too ambiguous to create a useful, specific Path, ask ONE short, helpful clarification question.

Set needsClarification to true and provide clarificationQuestion plus 2-4 practical clarificationOptions.

Do not ask when the goal and WHY already provide enough direction.
Do not require clarification for simple or exploratory goals.
If clarification is needed, do not invent a detailed Path before the user answers.
Return exactly this structure:

{
  "planningMode": "milestones",
  "needsClarification": false,
  "clarificationQuestion": null,
  "clarificationOptions": [],
  "milestones": [
    {
      "title": "Specific milestone",
      "description": "What completing this stage accomplishes",
      "targetDate": null,
      "nextMove": {
        "title": "Specific action",
        "estimatedMinutes": 15,
        "whyThisMove": "Why this action matters now",
        "steps": [
          "Concrete step 1",
          "Concrete step 2",
          "Concrete step 3"
        ]
      }
    }
  ],
  "firstMove": {
    "title": "Same action as the first milestone's nextMove",
    "estimatedMinutes": 15,
    "whyThisMove": "Why this action matters now",
    "steps": [
      "Concrete step 1",
      "Concrete step 2",
      "Concrete step 3"
    ]
  },
  "coachMessage": "Short encouraging message"
}`;
const userPrompt = `
Goal: ${input.title}
Target: ${input.target}
Why: ${input.why}
Deadline: ${input.deadline ?? "No deadline provided"}

Create a practical GOAL'D IN path for this goal.
`;
const plan = await dispatchAIRequest(
  chooseModelRole("PLANNING"),
  systemPrompt,
  userPrompt
);
    
    return plan;

  } catch (error) {
    console.log("AI DEBUG: Error calling router, returning null for local fallback", error);
    return null; // Returning null allows local buildFirstMove() fallback
  }
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
if (true) {
 
let aiPlan = await buildAIPlan({
  title,
  target: outcome,
  why,
  deadline,
});

if (!aiPlan) {
  console.log("AI plan attempt 1 failed — retrying once.");

  aiPlan = await buildAIPlan({
    title,
    target: outcome,
    why,
    deadline,
  });
}

if (aiPlan) {
  return new Response(JSON.stringify(aiPlan), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
console.log("AI PLAN RESULT:", JSON.stringify(aiPlan));
console.log("AI planning failed twice — using local fallback.");
  
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