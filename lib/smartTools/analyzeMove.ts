import type {
  SmartToolsContext,
  ToolSuggestion,
} from './types';

export function analyzeMove(
  context: SmartToolsContext
): ToolSuggestion[] {
  const suggestions: ToolSuggestion[] = [];

  const durationPattern =
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;

  function extractDurations(text: string): number[] {
    const durations: number[] = [];

    for (const match of text.matchAll(durationPattern)) {
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();

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

  // Prefer specific checklist steps over a general
  // duration mentioned in the Next Move title.
  context.steps.forEach((step, index) => {
    const durations = extractDurations(step);

    durations.forEach((seconds, durationIndex) => {
      suggestions.push({
        id: `step-${index}-timer-${durationIndex}`,
        type: 'timer',
        label: step,
        reason: 'Duration identified in checklist',
        sourceStepIndex: index,
        suggestedSeconds: seconds,
        editable: true,
      });
    });
  });

  // Use the overall duration when no individual
  // step durations were identified.
  if (suggestions.length === 0) {
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

  return suggestions;
}