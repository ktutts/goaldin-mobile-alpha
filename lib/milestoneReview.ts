/**
 * Completed planned actions make an ACTIVE milestone eligible for review.
 * This is deliberately not proof that the real-world outcome was achieved.
 * Only a deliberate user confirmation can record that milestone as complete.
 */
export function isMilestoneReadyForReview(
  milestone: { id: string; status: string },
  actions: ReadonlyArray<{ milestone_id?: string | null; status: string }>
): boolean {
  if (milestone.status !== 'active') return false;
  const milestoneActions = actions.filter((action) => action.milestone_id === milestone.id);
  return milestoneActions.length > 0 &&
    milestoneActions.every((action) => action.status === 'completed');
}
