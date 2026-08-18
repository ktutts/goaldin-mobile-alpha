import { Action, Milestone } from '@/types/models';

export type Pace = 'high' | 'medium' | 'low';

export type AdaptiveMove = {
  title: string;
  minutes: number;
  actionIds: string[];
  milestoneId?: string;
  milestoneTitle?: string;
  explanation: string;
};

function minutesFor(action: Action) {
  return action.estimated_minutes ?? 10;
}

export function getAdaptiveMove({
  actions,
  milestones,
  pace,
}: {
  actions: Action[];
  milestones: Milestone[];
  pace: Pace;
}): AdaptiveMove | null {
  const pending = actions
    .filter((a) => a.status === 'pending')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  if (!pending.length) return null;

  // Find the current active milestone.
  const activeMilestone =
    milestones.find((m) => m.status === 'active') ??
    milestones
      .filter((m) => m.status !== 'completed')
      .sort((a, b) => a.position - b.position)[0];

  // Prefer actions belonging to that milestone.
  const milestoneActions = activeMilestone
    ? pending.filter(
        (action) => action.milestone_id === activeMilestone.id
      )
    : pending;

  const candidates =
    milestoneActions.length > 0 ? milestoneActions : pending;

  // LIGHT:
  // smallest meaningful piece of the current milestone
  if (pace === 'low') {
    const action = candidates[0];

    return {
      title: action.title,
      minutes: Math.min(minutesFor(action), 10),
      actionIds: [action.id],
      milestoneId: activeMilestone?.id,
      milestoneTitle: activeMilestone?.title,
      explanation: 'Smallest useful move that still advances the goal.',
    };
  }

  // STEADY:
  // one normal action
  if (pace === 'medium') {
    const action = candidates[0];

    return {
      title: action.title,
      minutes: minutesFor(action),
      actionIds: [action.id],
      milestoneId: activeMilestone?.id,
      milestoneTitle: activeMilestone?.title,
      explanation: 'A solid move that keeps the plan on pace.',
    };
  }

  // PUSH:
  // group enough consecutive actions to create a meaningful session
  const selected: Action[] = [];
  let totalMinutes = 0;

  for (const action of candidates) {
    selected.push(action);
    totalMinutes += minutesFor(action);

    // Aim roughly for a 30–60 minute meaningful push.
    if (totalMinutes >= 30) break;
  }

  if (selected.length === 1) {
    return {
      title: selected[0].title,
      minutes: Math.max(minutesFor(selected[0]), 20),
      actionIds: [selected[0].id],
      milestoneId: activeMilestone?.id,
      milestoneTitle: activeMilestone?.title,
      explanation: 'A bigger push through the current milestone.',
    };
  }

  return {
    title:
      activeMilestone?.title
        ? `Push through: ${activeMilestone.title}`
        : `Complete ${selected.length} moves`,
    minutes: totalMinutes,
    actionIds: selected.map((a) => a.id),
    milestoneId: activeMilestone?.id,
    milestoneTitle: activeMilestone?.title,
    explanation: `${selected.length} moves grouped into one focused push.`,
  };
}
export function calculateGoalProgress(
  milestones: Milestone[],
  actions: Action[]
) {
  if (!milestones.length) {
    // Backward compatibility for old goals.
    const completed = actions.filter(
      (a) => a.status === 'completed'
    ).length;

    if (!actions.length) return 0;

    return Math.round((completed / actions.length) * 100);
  }

  let total = 0;

  for (const milestone of milestones) {
    const milestoneActions = actions.filter(
      (action) => action.milestone_id === milestone.id
    );

    // Completed milestone earns its entire weight.
    if (milestone.status === 'completed') {
      total += milestone.weight;
      continue;
    }

    if (!milestoneActions.length) continue;

    const completedActions = milestoneActions.filter(
      (action) => action.status === 'completed'
    ).length;

    const milestoneCompletion =
      completedActions / milestoneActions.length;

    total += milestone.weight * milestoneCompletion;
  }

  return Math.max(0, Math.min(100, Math.round(total)));
}