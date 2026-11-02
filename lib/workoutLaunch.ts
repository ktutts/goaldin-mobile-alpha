import AsyncStorage from '@react-native-async-storage/async-storage';
import { prepareWorkout, type WorkoutPreparation } from './workoutPreparation';

/** A preview/launch handoff, not permission to start sensors or activity logging. */
export type PreparedMove = {
  goalId: string;
  milestoneId: string;
  actionId: string;
  actionTitle: string;
  createdAt: string;
  workout: WorkoutPreparation | null;
  userMustPressStart: true;
};
export const preparedMoveKey = (actionId: string) => `goaldin-prepared-next-move-${actionId}`;
export async function prepareNextMoveLaunch(input: {
  goalId: string;
  milestoneId: string;
  actionId: string;
  actionTitle: string;
  steps: string[];
}): Promise<PreparedMove> {
  const prepared: PreparedMove = {
    goalId: input.goalId, milestoneId: input.milestoneId,
    actionId: input.actionId, actionTitle: input.actionTitle,
    createdAt: new Date().toISOString(), workout: prepareWorkout(input.steps),
    userMustPressStart: true,
  };
  // An optional prepared preview; the Workspace must independently load the
  // current action from Supabase and validate ownership/status before starting.
  await AsyncStorage.setItem(preparedMoveKey(input.actionId), JSON.stringify(prepared));
  return prepared;
}
export async function readPreparedMove(actionId: string): Promise<PreparedMove | null> {
  try {
    const raw = await AsyncStorage.getItem(preparedMoveKey(actionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreparedMove;
    if (parsed.actionId !== actionId || !parsed.userMustPressStart) return null;
    // Reject stale previews; the Workspace still checks the current action.
    if (Date.now() - Date.parse(parsed.createdAt) > 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}
