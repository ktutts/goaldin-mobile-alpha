import type { GoalHorizon, PlanningMode } from '@/types/models';

export type GoalClassification = {
  horizon: GoalHorizon;
  planningMode: PlanningMode;
};

export type MilestoneDraft = {
  title: string;
  description: string | null;
  weight: number;
  position: number;
};

type ClassifyGoalInput = {
  title: string;
  deadline?: string | null;
};

type BuildMilestoneInput = {
  title: string;
  outcome?: string | null;
  why?: string | null;
  deadline?: string | null;
  horizon: GoalHorizon;
  planningMode: PlanningMode;
};

function daysUntil(deadline?: string | null): number | null {
  if (!deadline) return null;

  const target = new Date(deadline);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const now = new Date();

  const difference = target.getTime() - now.getTime();

  return Math.ceil(difference / (1000 * 60 * 60 * 24));
}

export function classifyGoal(
  input: ClassifyGoalInput
): GoalClassification {
  const title = input.title.toLowerCase();
  const days = daysUntil(input.deadline);

  // Very short goal — finish it now.
  if (days !== null && days <= 1) {
    return {
      horizon: 'session',
      planningMode: 'finish',
    };
  }

  // Short goal — finish within a few days.
  if (days !== null && days <= 7) {
    return {
      horizon: 'week',
      planningMode: 'milestones',
    };
  }

  // Longer goals that naturally change over time.
  const evolvingKeywords = [
    'shape',
    'fitness',
    'lose weight',
    'lose fat',
    'weight loss',
    'muscle',
    'stronger',
    'health',
    'run',
    '5k',
    '10k',
    'marathon',
    'habit',
    'sleep',
    'business',
    'save',
    'debt',
  ];

  const isEvolving = evolvingKeywords.some((word) =>
    title.includes(word)
  );

  if (isEvolving) {
    return {
      horizon: 'evolving',
      planningMode: 'weekly_replan',
    };
  }

  // Longer defined goal/project.
  if (days !== null && days > 7) {
    return {
      horizon: 'project',
      planningMode: 'milestones',
    };
  }

  // No deadline yet.
  return {
    horizon: 'project',
    planningMode: 'milestones',
  };
}

export function buildMilestoneDrafts(
  input: BuildMilestoneInput
): MilestoneDraft[] {
  const {
    title,
    outcome,
    why,
    deadline,
    horizon,
    planningMode,
  } = input;

  const target = outcome?.trim() || title.trim();

  const reason = why?.trim()
    ? `Why this matters: ${why.trim()}`
    : null;

  const deadlineText = deadline
    ? `Target date: ${deadline}`
    : null;

  const description = [reason, deadlineText]
    .filter(Boolean)
    .join(' • ') || null;

  /*
   * QUICK GOAL
   * Example:
   * Make a birthday cake tonight.
   */
  if (horizon === 'session') {
    return [
      {
        title: `Finish: ${target}`,
        description,
        weight: 100,
        position: 0,
      },
    ];
  }

  /*
   * EVOLVING GOAL
   *
   * Example:
   * Get in shape
   * Lose 30 pounds by June 1
   * Why: cruise
   *
   * We DON'T pretend to know the entire path today.
   * We establish the target, execute this week,
   * measure what happened, then replan.
   */
  if (
    horizon === 'evolving' ||
    planningMode === 'weekly_replan'
  ) {
    return [
      {
        title: `Define the target: ${target}`,
        description,
        weight: 10,
        position: 0,
      },
      {
        title: 'Complete this week’s plan',
        description:
          'Focus on the actions that move the goal forward this week.',
        weight: 30,
        position: 1,
      },
      {
        title: 'Review results and adjust',
        description:
          'Measure what happened, keep what worked, and change what did not.',
        weight: 20,
        position: 2,
      },
      {
        title: `Reach: ${target}`,
        description,
        weight: 40,
        position: 3,
      },
    ];
  }

  /*
   * ONE-WEEK GOAL
   */
  if (horizon === 'week') {
    return [
      {
        title: `Define exactly what done means`,
        description,
        weight: 20,
        position: 0,
      },
      {
        title: `Make the first meaningful move`,
        description: `Start moving toward: ${target}`,
        weight: 30,
        position: 1,
      },
      {
        title: `Finish: ${target}`,
        description,
        weight: 50,
        position: 2,
      },
    ];
  }

  /*
   * PROJECT / LONGER DEFINED GOAL
   *
   * Example:
   * Build a website
   * Launch an app
   * Remodel the garage
   */
  return [
    {
      title: `Define the finish line`,
      description,
      weight: 10,
      position: 0,
    },
    {
      title: `Reach the first meaningful milestone`,
      description: `Move ${target} from an idea into measurable progress.`,
      weight: 25,
      position: 1,
    },
    {
      title: `Reach the halfway point`,
      description: `Review progress and adjust the remaining path.`,
      weight: 30,
      position: 2,
    },
    {
      title: `Finish: ${target}`,
      description,
      weight: 35,
      position: 3,
    },
  ];
}
