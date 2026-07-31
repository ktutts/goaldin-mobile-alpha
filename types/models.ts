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
  status: 'pending' | 'completed' | 'skipped';
  estimated_minutes: number | null;
  position: number;
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
