export type Goal = {
  id: string;
  user_id: string;
  title: string;
  status: 'active' | 'completed' | 'paused';
  target_date: string | null;
  created_at: string;
};

export type Action = {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  status: 'todo' | 'done' | 'skipped';
  estimate_minutes: number | null;
  sort_order: number;
  completed_at: string | null;
};

export type Win = {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  summary: string | null;
  created_at: string;
};
