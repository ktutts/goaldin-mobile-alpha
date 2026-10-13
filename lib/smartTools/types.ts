export type SmartToolType =
  | 'timer'
  | 'interval_timer'
  | 'reminder'
  | 'activity_tracking'
  | 'equipment'
  | 'progress_record';

export type ActivityMetric =
  | 'duration_seconds'
  | 'distance_meters'
  | 'heart_rate_bpm'
  | 'pace_seconds_per_500m'
  | 'repetitions'
  | 'calories'
  | 'notes';

export type ToolSuggestion = {
  id: string;
  type: SmartToolType;
  label: string;
  reason: string;
  sourceStepIndex?: number;
  suggestedSeconds?: number;
  editable: boolean;
};

export type ActivitySession = {
  id: string;
  goalId: string;
  milestoneId: string;
  actionId: string;
  status: 'ready' | 'active' | 'paused' | 'completed';
  startedAt?: string;
  endedAt?: string;
  metrics: Partial<Record<ActivityMetric, number | string>>;
};

export type ConnectedDevice = {
  id: string;
  name: string;
  type: 'heart_rate' | 'rowing_machine' | 'fitness_sensor' | 'other';
  connected: boolean;
  supportedMetrics: ActivityMetric[];
};

export type SmartToolsContext = {
  goalTitle: string;
  milestoneTitle: string;
  nextMoveTitle: string;
  steps: string[];
  availableDevices: ConnectedDevice[];
};