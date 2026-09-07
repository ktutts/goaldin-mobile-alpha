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