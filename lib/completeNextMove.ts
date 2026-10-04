import { supabase } from './supabase';

export type CompleteNextMoveResult =
  | {
      type: 'NEXT_MOVE';
      completedMoveId: string;
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

  const { data: completedMove, error: actionError } = await supabase
    .from('actions')
    .update({
      status: 'completed',
      completed_at: completedAt,
    })
    .eq('id', actionId)
    .select('*')
    .single();

  if (actionError || !completedMove) {
    throw new Error(
      actionError?.message ?? 'Could not complete Next Move.'
    );
  }

  const { data: pendingMoves, error: pendingError } = await supabase
  .from('actions')
  .select('*')
  .eq('goal_id', completedMove.goal_id)
  .eq('milestone_id', completedMove.milestone_id)
  .eq('status', 'pending')
  .neq('id', completedMove.id)
  .order('position', { ascending: true });

if (pendingError) {
  throw new Error(pendingError.message);
}

const upcomingMove = pendingMoves?.[0];

if (upcomingMove) {
  return {
    type: 'NEXT_MOVE',
    completedMoveId: completedMove.id,
  };
}

// No pending moves remain.
// Now determine whether this milestone is finished.
const currentMilestoneId = completedMove.milestone_id;

if (!currentMilestoneId) {
  return {
    type: 'NEXT_MOVE',
    completedMoveId: completedMove.id,
  };
}

const { data: currentMilestone, error: milestoneError } = await supabase
  .from('milestones')
  .select('*')
  .eq('id', currentMilestoneId)
  .single();

if (milestoneError || !currentMilestone) {
  throw new Error(
    milestoneError?.message ?? 'Could not load current milestone.'
  );
}

const { data: nextMilestone, error: nextMilestoneError } = await supabase
  .from('milestones')
  .select('*')
  .eq('goal_id', completedMove.goal_id)
  .gt('position', currentMilestone.position)
  .neq('status', 'completed')
  .order('position', { ascending: true })
  .limit(1)
  .maybeSingle();

if (nextMilestoneError) {
  throw new Error(nextMilestoneError.message);
}

if (nextMilestone) {const { error: completeMilestoneError } = await supabase
  .from('milestones')
  .update({
    status: 'completed',
    completed_at: completedAt,
  })
  .eq('id', currentMilestone.id);

if (completeMilestoneError) {
  throw new Error(completeMilestoneError.message);
}

const { error: activateMilestoneError } = await supabase
  .from('milestones')
  .update({
    status: 'active',
  })
  .eq('id', nextMilestone.id);

if (activateMilestoneError) {
  throw new Error(activateMilestoneError.message);
}
let { data: newMove, error: newMoveError } = await supabase
  .from('actions')
  .select('*')
  .eq('goal_id', completedMove.goal_id)
  .eq('milestone_id', nextMilestone.id)
  .eq('status', 'pending')
  .order('position', { ascending: true })
  .limit(1)
  .maybeSingle();

if (newMoveError) {
  throw new Error(newMoveError.message);
}

if (!newMove) {
  const { data: createdMove, error: createMoveError } = await supabase
    .from('actions')
    .insert({
      user_id: completedMove.user_id,
      goal_id: completedMove.goal_id,
      milestone_id: nextMilestone.id,
      title: nextMilestone.title,
      status: 'pending',
      estimated_minutes: 10,
      type: 'task',
      position: Number(completedMove.position ?? 0) + 1,
    })
    .select()
    .single();

  if (createMoveError || !createdMove) {
    throw new Error(
      createMoveError?.message ?? 'Could not create the next move.'
    );
  }

  newMove = createdMove;
}
  return {
    type: 'MILESTONE_ADVANCED',
    completedMoveId: completedMove.id,
    completedMilestoneId: currentMilestone.id,
    nextMilestoneId: nextMilestone.id,
  };
}

const { error: finalMilestoneError } = await supabase
  .from('milestones')
  .update({
    status: 'completed',
    completed_at: completedAt,
  })
  .eq('id', currentMilestone.id);

if (finalMilestoneError) {
  throw new Error(finalMilestoneError.message);
}

const { error: goalError } = await supabase
  .from('goals')
  .update({
    status: 'completed',
    completed_at: completedAt,
  })
  .eq('id', completedMove.goal_id);

if (goalError) {
  throw new Error(goalError.message);
}

return {
  type: 'GOAL_COMPLETE',
  completedMoveId: completedMove.id,
  completedMilestoneId: currentMilestone.id,
};
}