import type {
  SmartToolsContext,
  ToolSuggestion,
} from './types';

export function analyzeMove(
  context: SmartToolsContext
): ToolSuggestion[] {
  const suggestions: ToolSuggestion[] = [];
  const timerStages: { label: string; seconds: number }[] = [];
  const nextMoveText = context.nextMoveTitle.toLowerCase();

const isPlanningMove =
  /\b(plan|planning|choose|decide|schedule|outline|prepare)\b/i.test(
    nextMoveText
  );

 context.steps.forEach((step) => {
  const durations = extractDurations(step);

  if (!isPlanningMove) {
    durations.forEach((seconds) => {
      timerStages.push({
        label: step,
        seconds,
      });
    });
  }
});


  const durationPattern =
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;

  function extractDurations(text: string): number[] {
    const durations: number[] = [];

    for (const match of text.matchAll(durationPattern)) {
      const amount = Number(match[1]);
      const unit = match[2]?.toLowerCase();

if (!unit) continue;

      const seconds = unit.startsWith('h')
        ? amount * 3600
        : unit.startsWith('s')
          ? amount
          : amount * 60;

      if (seconds > 0) {
        durations.push(Math.round(seconds));
      }
    }

    return durations;
  }
context.steps.forEach((step) => {
  const durations = extractDurations(step);

  if (!isPlanningMove && durations.length > 0) {
  timerStages.push({
    label: step,
    seconds: Math.max(...durations),
  });
}
});
  // Prefer specific checklist steps over a general
  // duration mentioned in the Next Move title.


  // Use the overall duration when no individual
  // step durations were identified.
  if (!isPlanningMove && timerStages.length === 0 && suggestions.length === 0) {
    const durations = extractDurations(
      context.nextMoveTitle
    );

    durations.forEach((seconds, index) => {
      suggestions.push({
        id: `move-timer-${index}`,
        type: 'timer',
        label: context.nextMoveTitle,
        reason: 'Duration identified in Next Move',
        suggestedSeconds: seconds,
        editable: true,
      });
    });
  }
if (timerStages.length > 0) {
  const totalSeconds = timerStages.reduce(
    (total, stage) => total + stage.seconds,
    0
  );

  suggestions.push({
    id: 'guided-timer',
    type: 'timer',
    label: timerStages.length > 1 ? 'Guided timer' : timerStages[0].label,
    reason:
      timerStages.length > 1
        ? 'Timed stages identified in checklist'
        : 'Timed activity identified in checklist',
    suggestedSeconds: totalSeconds,
    timerStages,
    editable: true,
  });
}
  // Recognize potentially useful equipment.

  const activityText = [
    context.goalTitle,
    context.milestoneTitle,
    context.nextMoveTitle,
    ...context.steps,
  ].join(' ').toLowerCase();

  if (/\b(rowing|rower|ergometer|concept2)\b/.test(activityText)) {
    suggestions.push({
      id: 'rowing-equipment',
      type: 'equipment',
      label: 'Rowing machine',
      reason: 'Rowing activity identified',
      editable: false,
    });
  }

  if (
    /\b(workout|running|cycling|rowing|cardio|training)\b/
      .test(activityText)
  ) {
    suggestions.push({
      id: 'activity-tracking',
      type: 'activity_tracking',
      label: 'Track activity',
      reason: 'Physical activity identified',
      editable: false,
    });
  }
// Proactively offer guidance when the user may need direction.
const needsGuidance =
  /\b(how do i|how to|where do i start|don't know|dont know|not sure|beginner|first time|help me|what should i|no experience)\b/i.test(
    activityText
  );

if (needsGuidance) {
  suggestions.push({
    id: 'proactive-guidance',
    type: 'guidance',
    label: 'HELP ME FIGURE THIS OUT',
    reason: 'The user may benefit from guidance before taking action',
    editable: false,
  });
}
  return suggestions;
}