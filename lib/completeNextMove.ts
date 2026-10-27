import { supabase } from './supabase';

export type CompleteNextMoveResult =
  | {
      type: 'NEXT_MOVE';
      completedMoveId: string;
    }
    | {
    type: 'MILESTONE_READY';
    completedMoveId: string;
    milestoneId: string;
  }
  | {
      type: 'MILESTONE_ADVANCED';
      completedMoveId: string;
      completedMilestoneId: string;
      nextMilestoneId: string;
    }
  | {
      type: 'GOAL_COMPLETE';
      completedMoveId: string;
      completedMilestoneId?: string;
    };

export async function completeNextMove(
  actionId: string
): Promise<CompleteNextMoveResult> {
  const completedAt = new Date().toISOString();

  // Only a pending action may be completed. Do not complete it twice.
  const { data: completedMove, error: actionError } = await supabase
    .from('actions')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', actionId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (actionError) {
    throw new Error(actionError.message);
  }
  if (!completedMove) {
    throw new Error('This Next Move was already completed or could not be found.');
  }

  // Other pending actions on the same milestone take precedence.
  if (!completedMove.milestone_id) {
    return { type: 'NEXT_MOVE', completedMoveId: completedMove.id };
  }

  const { data: pendingMoves, error: pendingError } = await supabase
    .from('actions')
    .select('id')
    .eq('goal_id', completedMove.goal_id)
    .eq('milestone_id', completedMove.milestone_id)
    .eq('status', 'pending')
    .order('position', { ascending: true })
    .limit(1);

  if (pendingError) {
    throw new Error(pendingError.message);
  }

  if ((pendingMoves ?? []).length > 0) {
    return { type: 'NEXT_MOVE', completedMoveId: completedMove.id };
  }

  const { data: milestone, error: milestoneError } = await supabase
    .from('milestones')
    .select('id, status')
    .eq('id', completedMove.milestone_id)
    .single();

  if (milestoneError || !milestone) {
    throw new Error(milestoneError?.message ?? 'Could not load milestone.');
  }

  // Important: all the planned actions are checked, but that DOES NOT mean
  // the milestone outcome has been achieved. The user must review it.
  // Never mark the milestone or goal complete from this action alone.
  return {
    type: 'MILESTONE_READY',
    completedMoveId: completedMove.id,
    milestoneId: milestone.id,
  };
}
