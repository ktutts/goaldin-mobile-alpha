import { supabase } from './supabase';

export async function confirmMilestone(milestoneId: string) {
  if (!milestoneId) {
    throw new Error('Milestone ID is required.');
  }

  const { data: milestone, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('id', milestoneId)
    .single();

  if (error || !milestone) {
    throw new Error(error?.message ?? 'Milestone not found.');
  }
const { count, error: actionsError } = await supabase
  .from('actions')
  .select('id', { count: 'exact', head: true })
  .eq('milestone_id', milestoneId)
  .neq('status', 'completed');

if (actionsError) {
  throw new Error(actionsError.message);
}

if ((count ?? 0) > 0) {
  throw new Error(
    'Finish the remaining Next Moves before confirming this milestone.'
  );
}
const { data: nextMilestone, error: nextError } = await supabase
  .from('milestones')
  .select('id')
  .eq('goal_id', milestone.goal_id)
  .gt('position', milestone.position)
  .neq('status', 'completed')
  .order('position', { ascending: true })
  .limit(1)
  .maybeSingle();

if (nextError) {
  throw new Error(nextError.message);
}
 const confirmedAt = new Date().toISOString();
if (milestone.confirmed_at) {
  throw new Error('This milestone is already confirmed.');
}
const { data: confirmedMilestone, error: confirmError } =
  await supabase
    .from('milestones')
    .update({
      status: 'completed',
      completed_at: confirmedAt,
      confirmed_at: confirmedAt,
      first_confirmed_at:
        milestone.first_confirmed_at ?? confirmedAt,
    })
    .eq('id', milestoneId)
    .select('*')
    .single();

if (confirmError || !confirmedMilestone) {
  throw new Error(
    confirmError?.message ?? 'Could not confirm milestone.'
  );
}


if (nextMilestone) {
    const { data: plannedMove, error: moveError } = await supabase
  .from('actions')
  .select('id, title, steps')
  .eq('milestone_id', nextMilestone.id)
  .eq('status', 'pending')
  .order('position', { ascending: true })
  .limit(1)
  .maybeSingle();

if (moveError) {
  throw new Error(moveError.message);
}

if (!plannedMove || !plannedMove.title?.trim()) {
  throw new Error(
    'Your next milestone needs a Next Move. Open its workspace to set one.'
  );
}
const { error: clearError } = await supabase
  .from('milestones')
  .update({ status: 'pending' })
  .eq('goal_id', milestone.goal_id)
  .eq('status', 'active')
  .neq('id', nextMilestone.id);

if (clearError) {
  throw new Error(clearError.message);
}
  const { error: activateError } = await supabase
    .from('milestones')
    .update({ status: 'active' })
    .eq('id', nextMilestone.id);

  if (activateError) {
    throw new Error(activateError.message);
  }
}
return confirmedMilestone;
}