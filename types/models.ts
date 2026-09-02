export type Goal = {
  id: string;
  user_id: string;
  title: string;
  status: 'active' | 'completed' | 'paused' | 'archived';
  source?: string | null;
  target_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;outcome?: string | null;
why?: string | null;
target?: string | null;
deadline?: string | null;

horizon?: GoalHorizon | null;
planning_mode?: PlanningMode | null;
};

export type Action = {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'completed' | 'skipped';
  estimated_minutes: number | null;
  type?: 'task' | 'timed' | 'scheduled' | 'milestone';
  position: number;
  completed_at: string | null;

  milestone_id?: string | null;
  milestone_progress?: number | null;
};

export type Win = {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  summary: string | null;
  created_at: string;
};

export type Capacity = {
  id: string;
  user_id: string;
  date: string;
  level: 'high' | 'medium' | 'low';
  source: 'manual' | 'automatic';
  metadata: Record<string, unknown> | null;
  created_at: string;
};
export type CapacityLevel = 'high' | 'medium' | 'low';

export type MilestoneStatus =
  | 'pending'
  | 'active'
  | 'completed';

export type Milestone = {
  id: string;
  goal_id: string;

  title: string;
  description?: string | null;

  // How much this milestone contributes to the entire goal.
  // All milestones for a goal should total about 100.
  weight: number;

  position: number;
  status: MilestoneStatus;

  created_at?: string;
};
  export type GoalHorizon =
  | 'session'
  | 'day'
  | 'week'
  | 'project'
  | 'evolving';

export type PlanningMode =
  | 'finish'
  | 'milestones'
  | 'weekly_replan';
  
