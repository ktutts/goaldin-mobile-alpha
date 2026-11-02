/**
 * Conservative translation of an approved Next Move into guided timer stages.
 * No timer, notifications, activity recording or sensors start in this module.
 * Ambiguous directions return null so the user can set a manual timer.
 */
export type GuidedStageKind = 'warmup' | 'run' | 'walk' | 'cooldown' | 'activity';
export type GuidedStage = {
  title: string;
  kind: GuidedStageKind;
  durationSeconds: number;
};
export type WorkoutPreparation = {
  stages: GuidedStage[];
  totalSeconds: number;
  heartRateOptional: true;
  startsRecordingAutomatically: false;
};

function durationSeconds(value: string, unit: string): number | null {
  const qty = Number(value);
  const seconds = /^(?:s|sec)/i.test(unit) ? qty : qty * 60;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 4 * 3600) return null;
  return Math.round(seconds);
}

const TIME = '(\\d+(?:\\.\\d+)?)\\s*(?:-\\s*)?(minutes?|mins?|seconds?|secs?)\\b';
function matchTimedSegment(text: string, prefix: RegExp): number | null {
  const match = prefix.exec(text);
  return match ? durationSeconds(match[1], match[2]) : null;
}
function warmupSeconds(text: string): number | null {
  return matchTimedSegment(text,
    new RegExp('\\bwarm\\s*[- ]?up\\b.{0,65}?' + TIME, 'i')) ??
    matchTimedSegment(text,
      new RegExp('\\b' + TIME + '.{0,45}?\\bwarm\\s*[- ]?up\\b', 'i'));
}
function cooldownSeconds(text: string): number | null {
  return matchTimedSegment(text,
    new RegExp('\\bcool\\s*[- ]?down\\b.{0,65}?' + TIME, 'i')) ??
    matchTimedSegment(text,
      new RegExp('\\b' + TIME + '.{0,45}?\\bcool\\s*[- ]?down\\b', 'i'));
}
function stage(title:string, kind:GuidedStageKind, seconds:number):GuidedStage {
  return {title, kind, durationSeconds:seconds};
}
function parseIntervals(text:string): GuidedStage[] | null {
  const runSeconds = matchTimedSegment(text, new RegExp('\\b(?:run|jog)\\s+(?:for\\s+)?' + TIME, 'i'));
  const walkSeconds = matchTimedSegment(text, new RegExp('\\bwalk\\s+(?:for\\s+)?' + TIME, 'i'));
  if (!runSeconds || !walkSeconds) return null;
  const roundsMatch = text.match(/\brepeat(?:\s+(?:this|the|sequence|intervals?))*\s+(\d+)\s*(?:times|rounds|cycles)\b/i)
    ?? text.match(/\b(\d+)\s*(?:rounds|cycles|repetitions)\b/i);
  const targetSeconds = matchTimedSegment(text,
    new RegExp('\\brepeat\\s+(?:this\\s+)?(?:sequence\\s+)?for\\s+' + TIME, 'i'));
  const cycleSeconds = runSeconds + walkSeconds;
  const rounds = roundsMatch ? Number(roundsMatch[1])
    : targetSeconds ? targetSeconds / cycleSeconds : NaN;
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 60) return null;
  const result:GuidedStage[] = [];
  for (let i = 0; i < rounds; i++) {
    result.push(stage(`Run · ${i + 1}/${rounds}`, 'run', runSeconds));
    result.push(stage(`Walk · ${i + 1}/${rounds}`, 'walk', walkSeconds));
  }
  return result;
}

/** Only unambiguous stages; never invent a workout or infer medical readiness. */
export function prepareWorkout(steps: string[]): WorkoutPreparation | null {
  if (!Array.isArray(steps) || steps.length < 2) return null;
  const lines = steps.map(x => String(x ?? '').trim()).filter(Boolean);
  const warm = lines.find(x => /\bwarm\s*[- ]?up\b/i.test(x));
  const cool = lines.find(x => /\bcool\s*[- ]?down\b/i.test(x));
  if (!warm || !cool || warm === cool) return null;
  const warmSeconds = warmupSeconds(warm);
  const coolSeconds = cooldownSeconds(cool);
  if (!warmSeconds || !coolSeconds) return null;
  const middle = lines.filter(x => x !== warm && x !== cool &&
    !/^(?:record|note|reflect|check|assess|log|stop if|listen to)\b/i.test(x));
  if (middle.length !== 1) return null;
  const activity = middle[0];
  let stages:GuidedStage[] | null = null;
  if (/\b(?:repeat|rounds?|cycles?)\b/i.test(activity)) {
    if (!/\b(?:run|jog)\b/i.test(activity) || !/\bwalk\b/i.test(activity)) return null;
    stages = parseIntervals(activity);
  } else {
    const match = activity.match(new RegExp('^\\s*(run|jog|walk|cycle|ride|row)\\s+(?:for\\s+)?' + TIME, 'i'));
    if (!match) return null;
    const seconds = durationSeconds(match[2], match[3]);
    if (!seconds) return null;
    const kind:GuidedStageKind = /^(?:run|jog)$/i.test(match[1]) ? 'run'
      : /^walk$/i.test(match[1]) ? 'walk' : 'activity';
    stages = [stage('Main activity',kind,seconds)];
  }
  if (!stages?.length) return null;
  const all = [stage('Warm up · walk','warmup',warmSeconds),...stages,
    stage('Cool down · walk','cooldown',coolSeconds)];
  const totalSeconds = all.reduce((sum,item) => sum + item.durationSeconds,0);
  if (!totalSeconds || totalSeconds > 4*3600) return null;
  return {stages: all,totalSeconds,heartRateOptional:true,startsRecordingAutomatically:false};
}

/** Compatible with Smart Tools TimerStage (label, seconds). */
export function toSmartToolTimerStages(workout: WorkoutPreparation): Array<{label:string;seconds:number}> {
  return workout.stages.map(item => ({label:item.title,seconds:item.durationSeconds}));
}
