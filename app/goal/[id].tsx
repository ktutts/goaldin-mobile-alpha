import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, Goal } from '@/types/models';
import { confirmMilestone } from '../../lib/confirmMilestone';
import GoalStageRing from '../../components/GoalStageRing';
import GoalTimePicker from '../../components/GoalTimePicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCapacityForDate, capacityLabels } from '@/lib/capacity';
import Constants from 'expo-constants';
import { getGoalCoachResponse, getGoalProgramProposal, getQuickMoveProposal } from "@/lib/goalCoach";
import type { CoachEvidence, CoachScheduleAdvice } from "@/lib/goalCoach";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';


type NewMoveDraft = { title: string; steps: string[]; minutes: number | null };
// A proposal is only a draft until the user approves it.
type NewMilestoneDraft = {
  title: string;
  description: string;
  moves: NewMoveDraft[];
};
type DayTime = { day: number; times: string[] };
type SavedGoalSchedule = {
  version: 2;
  dayTimes: DayTime[];
  notificationIds: string[];
};
// Time-only pickers start at a predictable, editable 12:00 AM rather than
// the current hour/minute. Previously saved times are never changed.
function defaultTimePickerDate(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Canonical clock values use 24-hour HH:mm; old versions also saved display times.
function clock24(value: string): string | null {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour < 0) return null;
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function clockLabel(value: string): string {
  const time = clock24(value);
  if (!time) return value;
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function cleanDayTimes(value: unknown): DayTime[] {
  if (!Array.isArray(value)) return [];
  const results = new Map<number, Set<string>>();
  for (const item of value) {
    const day = Number(item?.day);
    if (!Number.isInteger(day) || day < 1 || day > 7) continue;
    const times = Array.isArray(item?.times) ? item.times : [];
    const bucket = results.get(day) ?? new Set<string>();
    for (const raw of times) {
      if (typeof raw !== 'string') continue;
      const normalized = clock24(raw);
      if (normalized) bucket.add(normalized);
    }
    results.set(day, bucket);
  }
  return [...results].sort(([a], [b]) => a - b).map(([day, times]) => ({
    day, times: [...times].sort(),
  }));
}
function readStoredDayTimes(value: any): DayTime[] {
  if (Array.isArray(value?.dayTimes)) return cleanDayTimes(value.dayTimes);
  if (Array.isArray(value?.schedule_days)) return cleanDayTimes(value.schedule_days);
  // Backward compatibility with the original detail screen's shared times model.
  if (Array.isArray(value?.days) && Array.isArray(value?.times)) {
    return cleanDayTimes(value.days.map((day: number) => ({day, times: value.times})));
  }
  return [];
}
const getNotifications = async () => {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
};


export default function GoalDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [suggestedCompletedSteps, setSuggestedCompletedSteps] =
  useState<string[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [moveStarted, setMoveStarted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
const [showCoachInput, setShowCoachInput] = useState(false);
  const [showReminderMenu, setShowReminderMenu] = useState(false);
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
  const [editingDayTimes, setEditingDayTimes] = useState<DayTime[]>([]);
  const [activeReminderDay, setActiveReminderDay] = useState<number | null>(null);
  const [savingReminder, setSavingReminder] = useState(false);
  const [pendingTime, setPendingTime] = useState<Date>(defaultTimePickerDate);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [savedSchedule, setSavedSchedule] = useState<SavedGoalSchedule | null>(null);
  const [legacyScheduleUntracked, setLegacyScheduleUntracked] = useState(false);
  const [showScheduleSavedModal, setShowScheduleSavedModal] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showGoalCardChecklist, setShowGoalCardChecklist] = useState(false);
  const [showGoalCardCoachOptions, setShowGoalCardCoachOptions] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState('10');
  const [showMilestoneConfirmed, setShowMilestoneConfirmed] = useState(false);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachThinking, setCoachThinking] = useState(false);
  const [adaptedMove, setAdaptedMove] = useState<{
  title: string;
  minutes: number;
  steps: string[];
} | null>(null);
const [adaptedCompletedSteps, setAdaptedCompletedSteps] = useState<number[]>([]);
  const [showObstacleMenu, setShowObstacleMenu] = useState(false);
  const [showChangedMenu, setShowChangedMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showMoveCheckMenu, setShowMoveCheckMenu] = useState(false);
  const [showBetterMoveMenu, setShowBetterMoveMenu] = useState(false);
  const [coachInput, setCoachInput] = useState('');
  const [adaptationCompleted, setAdaptationCompleted] = useState(false);
  // Coach suggestions are drafts until the user explicitly approves them.
  const [continuationDraft, setContinuationDraft] = useState<NewMoveDraft | null>(null);
  const [continuationNote, setContinuationNote] = useState('');
  const [continuationLoading, setContinuationLoading] = useState(false);
  const [continuationSaving, setContinuationSaving] = useState(false);
  const continuationSaveLock = useRef(false);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  // When every milestone is confirmed but the GOAL is still active, propose
  // new milestones instead of leaving the user at a dead end.
  const [pathDraft, setPathDraft] = useState<NewMilestoneDraft[] | null>(null);
  const [pathSummary, setPathSummary] = useState('');
  const [pathScheduleAdvice, setPathScheduleAdvice] = useState<CoachScheduleAdvice | null>(null);
  const [pathSources, setPathSources] = useState<CoachEvidence[]>([]);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showScheduleReason, setShowScheduleReason] = useState(false);
  const [showPathSummary, setShowPathSummary] = useState(false);
  const [showPathContext, setShowPathContext] = useState(false);
  // When a saved health-related blocker may change the next action, the Coach
  // asks one useful question instead of treating old notes as a permanent fact.
  const [readinessPromptVisible, setReadinessPromptVisible] = useState(false);
  const [kneeReadiness, setKneeReadiness] = useState<'still' | 'better' | 'unsure' | null>(null);
  // User-initiated sharing. No private WHY, notes, schedule, health data or
  // recipients are exposed without an explicit choice.
  const [showJourneyShare, setShowJourneyShare] = useState(false);
  const [shareGoalName, setShareGoalName] = useState(false);
  const [shareJourneyProgress, setShareJourneyProgress] = useState(false);
  const [allowPublicResearch, setAllowPublicResearch] = useState(false);
  const [selectedPathPhases, setSelectedPathPhases] = useState<number[]>([]);
  const [expandedPathPhase, setExpandedPathPhase] = useState<number | null>(0);
  const [pathPreference, setPathPreference] = useState('');
  // A user asking for a push NOW is not asking to regenerate an entire Path.
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [quickMinutes, setQuickMinutes] = useState('5');
  const [quickRequest, setQuickRequest] = useState('I have time now and want one useful action toward my goal.');
  const [quickDraft, setQuickDraft] = useState<NewMilestoneDraft | null>(null);
  const [quickCoachNote, setQuickCoachNote] = useState('');
  const [quickTotalMinutes, setQuickTotalMinutes] = useState<number | null>(null);
  const [quickThinking, setQuickThinking] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const [pathThinking, setPathThinking] = useState(false);
  const [pathSaving, setPathSaving] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const pathSaveLock = useRef(false);
  const [savingAdjustedMove, setSavingAdjustedMove] = useState(false);
  const submitCoachInput = async () => {
  const response = coachInput.trim();
  if (!response || coachThinking) return;

  setCoachThinking(true);

  try {
    let workspaceProgress: any[] = [];

if (workspaceMilestone?.id) {
  const { data: progressData, error: progressError } = await supabase
    .from('progress_entries')
    .select('entry_type, content, created_at')
    .eq('milestone_id', workspaceMilestone.id)
    .order('created_at', { ascending: true })
    .limit(20);

  if (progressError) {
    console.error(
      'Could not load workspace progress for coach:',
      progressError
    );
  } else {
    workspaceProgress = progressData ?? [];
  }
}
    const aiResponse = await getGoalCoachResponse({
      goalTitle: goal?.title ?? '',
      nextMoveTitle: displayedMoveTitle ?? '',
      nextMoveMinutes: displayedMoveMinutes ?? null,
      nextMoveSteps: displayedMoveSteps,
completedSteps: Array.isArray(nextPending?.completed_steps)
  ? nextPending.completed_steps
  : [],
      milestones: milestones.map((m) => m.title),
      progressEntries: workspaceProgress ?? [],
      userMessage: response,
    });

    if (!aiResponse) {
      setCoachMessage(
        "I couldn't reach the coach right now. Your progress is still saved."
      );
      return;
    }
if (aiResponse.recordedProgress && workspaceMilestone?.id) {
  const {
  data: { user },
} = await supabase.auth.getUser();
if (
  aiResponse.need &&
  !aiResponse.recordedProgress &&
  workspaceMilestone?.id
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error: needError } = await supabase
      .from('progress_entries')
      .insert({
        user_id: user.id,
        goal_id: goal?.id,
        milestone_id: workspaceMilestone.id,
        action_id: nextPending?.id ?? null,
        entry_type: 'note',
        content: aiResponse.need.title,
        metadata: {
          need: aiResponse.need,
        },
      });

    if (needError) {
      console.error('Could not record need:', needError);
    } else {
      console.log('NEED RECORDED:', aiResponse.need);
    }
  }
}
if (!user) {
  console.error('Could not record progress: no authenticated user');
  return;
}
  const { error: recordError } = await supabase
    .from('progress_entries')
    .insert({
  user_id: user.id,
  goal_id: goal?.id,
  milestone_id: workspaceMilestone.id,
  action_id: nextPending?.id ?? null,
  entry_type: aiResponse.recordedProgress.entryType,
  content: aiResponse.recordedProgress.content,
  metadata: aiResponse.need
  ? {
      need: aiResponse.need,
    }
  : {},
});

  if (recordError) {
    console.error('Could not record progress:', recordError);
  } else {
    console.log(
      'PROGRESS RECORDED:',
      aiResponse.recordedProgress
    );
  }
}
if (aiResponse.suggestedCompletedSteps?.length) {
  const validSuggestions = aiResponse.suggestedCompletedSteps.filter(
    (step: string) =>
      displayedMoveSteps.includes(step) &&
      !nextPending?.completed_steps?.includes(step)
  );

  setSuggestedCompletedSteps(validSuggestions);
} else {
  setSuggestedCompletedSteps([]);
}
   if (aiResponse.proposedMove) {
  const completedSteps = Array.isArray(nextPending?.completed_steps)
  ? nextPending.completed_steps
  : [];

const remainingSteps = aiResponse.proposedMove.steps ?? [];

const updatedMove = {
  ...aiResponse.proposedMove,
minutes: 0,
  steps: [
    ...completedSteps,
    ...remainingSteps.filter(
      (step: string) => !completedSteps.includes(step)
    ),
  ],
};

  setAdaptedMove(updatedMove);
  // Do NOT update Supabase here. Show the draft and obtain approval first.
}

    setCoachMessage(aiResponse.message);
    // Clean up Course Correction after a successful coach response
    setCoachInput('');
    setShowChangedMenu(false);
  } catch (error) {
    console.error('GOAL COACH ERROR:', error);
    setCoachMessage("I couldn't reach the coach right now. Try again.");
  } finally {
    setCoachThinking(false);
  }
};
  const [coachListening, setCoachListening] = useState(false);

useSpeechRecognitionEvent('start', () => {
  setCoachListening(true);
});

useSpeechRecognitionEvent('end', () => {
  setCoachListening(false);
});

useSpeechRecognitionEvent('result', (event) => {
  const spokenText = event.results?.[0]?.transcript?.trim();

  if (!spokenText) return;

  setCoachInput((current) => {
    const existing = current.trim();

    return existing
      ? `${existing} ${spokenText}`
      : spokenText;
  });
});
const startCoachListening = async () => {
  const permission =
    await ExpoSpeechRecognitionModule.requestPermissionsAsync();

  if (!permission.granted) {
    Alert.alert(
      'Microphone permission needed',
      "Allow microphone access to tell GOAL'D IN what happened."
    );
    return;
  }

  ExpoSpeechRecognitionModule.start({
    lang: 'en-US',
    interimResults: true,
    continuous: false,
  });
};
  const deleteGoal = () => {
  if (!goalId) return;
 

  Alert.alert(
    'Delete Goal?',
    'This will permanently delete this goal and its moves. This cannot be undone.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('goals')
            .delete()
            .eq('id', goalId);

          if (error) {
            Alert.alert('Could not delete goal', error.message);
            return;
          }

          router.replace('/today' as any);
        },
      },
    ]
  );
};
const archiveGoal = async () => {
  if (!goalId) return;

  const { error } = await supabase
    .from('goals')
    .update({
  status: 'archived',
  archived_at: new Date().toISOString(),
})
    .eq('id', goalId);

  if (error) {
    Alert.alert('Could not archive achievement', error.message);
    return;
  }

  router.replace('/today' as any);
};
const journeyShareText = () => {
  const lines = ["I'm making meaningful progress with GOAL'D IN."];
  if (shareGoalName && goal?.title) lines.push(`My goal: ${goal.title}`);
  if (shareJourneyProgress) {
    const confirmed = milestones.filter((m) => m.status === 'completed').length;
    lines.push(`${confirmed} milestone${confirmed === 1 ? '' : 's'} reached on my journey.`);
  }
  lines.push('Stay Ready. Stay GOAL’D IN.');
  return lines.join('\n');
};
const shareJourney = async () => {
  try {
    // Native share sheet opens only on this explicit press; user picks the
    // recipient. Circle sharing is NOT simulated or done in the background.
    await Share.share({ message: journeyShareText() });
  } catch (error) {
    Alert.alert('Unable to open sharing', 'Please try again.');
  }
};
const shareAchievement = async () => {
  try {
    await Share.share({
      message: `I just completed "${goal?.title ?? 'a goal'}". Stay Goal'D In.`,
    });
  } catch {
    Alert.alert('Could not share achievement');
  }
};
const keepGoalGoing = async () => {
  if (!goal) return;

  const { error } = await supabase
    .from('goals')
    .update({
      status: 'active',
      is_practice: true,
    })
    .eq('id', goal.id);

  if (error) {
    Alert.alert('Could not continue goal', error.message);
    return;
  }

  router.replace('/today');
};
const renewGoal = async () => {
  if (!goal) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    Alert.alert('Sign in required', 'Please sign in and try again.');
    return;
  }

  // Create the new active goal
  const { data: newGoal, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      title: goal.title,
      status: 'active',
    })
    .select()
    .single();

  if (error || !newGoal) {
    Alert.alert(
      'Could not renew goal',
      error?.message || 'Please try again.'
    );
    return;
  }

  // Get the old path
  const { data: oldMilestones, error: oldMilestoneError } = await supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goal.id)
    .order('position', { ascending: true });

  if (oldMilestoneError) {
    Alert.alert('Could not renew path', oldMilestoneError.message);
    return;
  }

  // Rebuild the path for the new goal
  let newMilestones: any[] = [];

  if (oldMilestones?.length) {
    const milestoneRows = oldMilestones.map((milestone) => ({
      user_id: user.id,
      goal_id: newGoal.id,
      title: milestone.title,
      description: milestone.description ?? null,
      weight: milestone.weight,
      position: milestone.position,
      status: milestone.position === 0 ? 'active' : 'pending',
    }));

    const { data, error: milestoneError } = await supabase
      .from('milestones')
      .insert(milestoneRows)
      .select('id, position, title, status');

    if (milestoneError) {
      Alert.alert('Could not renew path', milestoneError.message);
      return;
    }

    newMilestones = data ?? [];
  }

  const firstNewMilestone = [...newMilestones].sort(
    (a, b) => a.position - b.position
  )[0];

  // Get the original first move
  const { data: oldActions, error: oldActionError } = await supabase
    .from('actions')
    .select('*')
    .eq('goal_id', goal.id)
    .order('position', { ascending: true })
    .limit(1);

  if (oldActionError) {
    Alert.alert('Could not renew next move', oldActionError.message);
    return;
  }

  const oldFirstMove = oldActions?.[0];

  // Recreate a fresh first move
  if (oldFirstMove) {
    const { error: actionError } = await supabase
      .from('actions')
      .insert({
        user_id: user.id,
        goal_id: newGoal.id,
        milestone_id: firstNewMilestone?.id ?? null,
        title: oldFirstMove.title,
        status: 'pending',
        estimated_minutes: oldFirstMove.estimated_minutes,
        type: oldFirstMove.type,
        position: 0,
      });

    if (actionError) {
      Alert.alert('Could not renew next move', actionError.message);
      return;
    }
  }

  Alert.alert(
    'Goal Renewed',
    'A fresh active cycle is ready while this achievement stays in your history.',
    [
      {
        text: 'OPEN NEW GOAL',
        onPress: () => router.replace(`/goal/${newGoal.id}`),
      },
    ]
  );
};
const toggleNextMoveStep = async (step: string) => {
  if (!nextPending) return;

  const completedSteps = Array.isArray(nextPending.completed_steps)
    ? nextPending.completed_steps
    : [];

  const isCompleted = completedSteps.includes(step);

  const updatedSteps = isCompleted
    ? completedSteps.filter((item: string) => item !== step)
    : [...completedSteps, step];

  const { error } = await supabase
    .from('actions')
    .update({
      completed_steps: updatedSteps,
    })
    .eq('id', nextPending.id);

  if (error) {
    Alert.alert('Could not update step', error.message);
    return;
  }

  setActions((current) =>
    current.map((action) =>
      action.id === nextPending.id
        ? {
            ...action,
            completed_steps: updatedSteps,
          }
        : action
    )
  );
};

const completeMove = async (actionId: string) => {
  const { error: actionError } = await supabase
    .from('actions')
    .update({
  status: 'completed',
  completed_at: new Date().toISOString(),
})
    .eq('id', actionId);

  if (actionError) {
    Alert.alert('Could not complete move', actionError.message);
    return;
  }

  const remainingPending = actions.filter(
  (action) =>
    action.id !== actionId &&
    action.milestone_id === nextPending?.milestone_id &&
    action.status === 'pending'
);

 
const completedMove = actions.find((action) => action.id === actionId);
const upcomingMove = remainingPending[0];

if (upcomingMove) {
  setActions((current) =>
  current.map((action) =>
    action.id === actionId
      ? { ...action, status: 'completed' as const }
      : action
  )
);
  setCoachMessage(
    `Nice work. ${completedMove?.title ?? 'That move'} is complete. Next up: ${upcomingMove.title}`
  );
} else if (goalId) {  setActions((current) =>
    current.map((action) =>
      action.id === actionId
        ? { ...action, status: 'completed' as const }
        : action
    )
  );

  setCoachMessage(
    'Next Move complete. Review your progress and confirm this milestone when you are ready.'
  );

  return;
}
};

  // The Next Move can be complete while its milestone and goal stay active.
  // Propose a new move in the same milestone; NEVER create it without consent.
  const askCoachForContinuation = async () => {
    const activeMilestone = milestones.find((m) => m.status === 'active');
    if (!goalId || !goal || goal.status === 'completed' || !activeMilestone ||
        actions.some((a) => a.status === 'pending' && a.milestone_id === activeMilestone.id) || continuationLoading) return;

    setContinuationLoading(true);
    setContinuationError(null);
    setContinuationDraft(null);
    try {
      const { data: previousProgress, error: progressError } = await supabase
        .from('progress_entries')
        .select('entry_type, content, created_at')
        .eq('milestone_id', activeMilestone.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (progressError) throw progressError;

      const completedMoves = actions
        .filter((a) => a.milestone_id === activeMilestone.id && a.status === 'completed')
        .sort((a, b) => Number((a as any).position ?? 0) - Number((b as any).position ?? 0));
      const latestMove = completedMoves[completedMoves.length - 1];
      const scheduleText = savedSchedule?.dayTimes
        .map((item) => `${WEEKDAY_NAMES[item.day - 1]} ${item.times.map(clockLabel).join(', ')}`)
        .join('; ') || 'No recurring schedule on this device';

      const userMessage = [
        'CONTINUE AN UNFINISHED MILESTONE; DO NOT CLOSE IT OR THE GOAL.',
        `Current goal: ${goal.title}`,
        `Current, unachieved milestone: ${activeMilestone.title}`,
        `Milestone explanation: ${activeMilestone.description ?? ''}`,
        `Most recent completed Next Move: ${latestMove?.title ?? 'none'}`,
        `Prior completed Next Moves: ${completedMoves.map((a) => a.title).join('; ') || 'none'}`,
        `Chosen recurring practice schedule: ${scheduleText}`,
        `Goal type: ${goal.is_practice ? 'ongoing practice' : 'finite outcome'}`,
        'The user has completed a single action, NOT the milestone outcome or final goal.',
        'Suggest ONE NEW, concrete Next Move to make continued progress in THIS milestone.',
        'Return proposedMove as an object with title, minutes (null is fine), and 1-4 actionable steps.',
        'Do not repeat a completed move, change the schedule, mark completion, or insert a new action.',
        'Consider the recent progress_entries, especially blockers. Never encourage exercising through pain; for injury concerns prioritize recovery and appropriate professional assessment instead of additional running.',
        continuationNote.trim() ? `Additional user preference: ${continuationNote.trim()}` : '',
      ].filter(Boolean).join('\n');

      const response = await getGoalCoachResponse({
        goalTitle: goal.title,
        nextMoveTitle: latestMove?.title ?? '',
        nextMoveMinutes: latestMove?.estimated_minutes ?? null,
        nextMoveSteps: Array.isArray(latestMove?.steps) ? latestMove.steps : [],
        completedSteps: Array.isArray(latestMove?.completed_steps) ? latestMove.completed_steps : [],
        milestones: milestones.map((m) => m.title),
        progressEntries: previousProgress ?? [],
        userMessage,
      });
      const suggestion = response?.proposedMove;
      const title = typeof suggestion?.title === 'string' ? suggestion.title.trim() : '';
      const steps = Array.isArray(suggestion?.steps)
        ? suggestion.steps.filter((step): step is string => typeof step === 'string')
            .map((step) => step.trim()).filter(Boolean).slice(0, 5)
        : [];
      if (!title) {
        setContinuationError(response?.message
          ? `${response.message} You can write your own Next Move below.`
          : 'The Coach did not return a usable Next Move. You can write your own below.');
        return;
      }
      // Reject a simple repeat of the last completed action.
      if (completedMoves.some((move) => String(move.title).trim().toLowerCase() === title.toLowerCase())) {
        setContinuationError('The Coach repeated an earlier move. Add guidance and try again, or write your own.');
        return;
      }
      setContinuationDraft({ title, steps, minutes: null });
      setCoachMessage(response?.message ?? 'Review the suggested Next Move before saving it.');
    } catch (err) {
      console.error('Could not suggest next move:', err);
      setContinuationError('The Coach could not suggest a Next Move right now. You can still create one yourself.');
    } finally {
      setContinuationLoading(false);
    }
  };

  const saveContinuation = async () => {
    const activeMilestone = milestones.find((m) => m.status === 'active');
    const title = continuationDraft?.title.trim() ?? '';
    if (!goalId || !goal || goal.status === 'completed' || !activeMilestone || !title ||
        continuationSaveLock.current) return;
    continuationSaveLock.current = true;
    setContinuationSaving(true);
    setContinuationError(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw authError ?? new Error('Sign in before saving.');

      // Check the database, not just local state, to avoid duplicate pending moves.
      const { data: existing, error: checkError } = await supabase
        .from('actions').select('id')
        .eq('goal_id', goalId).eq('milestone_id', activeMilestone.id)
        .eq('status', 'pending').limit(1);
      if (checkError) throw checkError;
      if ((existing?.length ?? 0) > 0) {
        setContinuationDraft(null);
        setRefreshKey((n) => n + 1);
        Alert.alert('Next Move already exists', 'The latest Next Move has been loaded instead.');
        return;
      }

      const position = Math.max(-1, ...actions.map((a) => Number((a as any).position ?? -1))) + 1;
      const { data: inserted, error: insertError } = await supabase
        .from('actions')
        .insert({
          user_id: user.id,
          goal_id: goalId,
          milestone_id: activeMilestone.id,
          title,
          steps: continuationDraft?.steps.filter(Boolean) ?? [],
          completed_steps: [],
          estimated_minutes: null,
          status: 'pending',
          type: 'task',
          position,
        }).select('*').single();
      if (insertError || !inserted) throw insertError ?? new Error('Could not save Next Move.');

      setActions((current) => [...current, inserted as Action]);
      setContinuationDraft(null);
      setContinuationNote('');
      setCoachMessage('Your approved Next Move is saved. Your milestone is still in progress.');
      setRefreshKey((n) => n + 1);
    } catch (err: any) {
      console.error('Could not save approved Next Move:', err);
      setContinuationError(err?.message ?? 'Could not save Next Move.');
    } finally {
      continuationSaveLock.current = false;
      setContinuationSaving(false);
    }
  };

  // Called from the Goal Card or from the "Continue My Path" confirmation.
  // Always check the database because state may still be refreshing after confirmation.
  const suggestNextMilestones = async () => {
    if (!goal || !goalId || goal.status === 'completed' || pathThinking || pathSaving) return;
    setPathThinking(true);
    setPathError(null);
    setPathDraft(null);
    try {
      const { data: liveMilestones, error: milestonesError } = await supabase
        .from('milestones').select('id,title,description,position,status')
        .eq('goal_id', goalId).order('position', { ascending: true });
      if (milestonesError) throw milestonesError;
      const history = liveMilestones ?? [];
      if (history.some((m) => m.status !== 'completed')) {
        setPathError('Your Path already has a current or upcoming milestone. Open that milestone to continue.');
        setRefreshKey((value) => value + 1);
        return;
      }
      const { data: recentProgress, error: progressError } = await supabase
        .from('progress_entries').select('entry_type,content,created_at')
        .eq('goal_id', goalId).order('created_at', { ascending: false }).limit(30);
      if (progressError) throw progressError;

      // One context question when a recorded knee concern could change the
      // safety of the next action. A historical note isn't a diagnosis or a
      // permanent restriction. The user decides what is true now.
      const lastKneeEntry = (recentProgress ?? []).find((entry) =>
        /\b(knee|knees)\b/i.test(String(entry.content ?? '')));
      if (!goal.is_practice && lastKneeEntry && !kneeReadiness &&
          !/\b(knee (?:is|feels) (?:fine|better)|pain (?:has )?(?:resolved|gone)|no longer hurts)\b/i.test(pathPreference)) {
        setReadinessPromptVisible(true);
        return;
      }
      setReadinessPromptVisible(false);

      const scheduleSummary = savedSchedule?.dayTimes
        .map((entry) => `${WEEKDAY_NAMES[entry.day - 1]} at ${entry.times.map(clockLabel).join(', ')}`)
        .join('; ') || 'No confirmed schedule on this device; ask before assigning dates or times.';
      const latest = history[history.length - 1];
      const ongoing = goal.is_practice === true;
      const userMessage = ongoing
        ? [
            'The previous occurrence of this ONGOING PRACTICE is complete, but the practice has no finish line.',
            'Propose useful preparation and action for only the NEXT occurrence, not months of repetitive milestones.',
            'For example, a weekly Friday date could start by confirming plans; optional reminders, invitations and reservations require separate approval.',
            'Give one meaningful next cycle; never assume other people agreed or notifications were sent.',
          ].join(' ')
        : [
            'The last planned milestone was confirmed, but the original FINITE GOAL is NOT verified achieved.',
            `Last confirmed milestone: ${latest?.title ?? 'none'}.`,
            'Propose 2-4 NEW future milestones with distinct, actionable Next Moves to continue toward the actual goal outcome.',
            'Do not repeat completed milestones or treat a single training day as completing a long-term goal.',
            'If running pain or another blocker was recorded, do not assume it resolved: prioritize reassessment or appropriate professional care before further painful activity.',
            'A goal outcome requires separate confirmation, never automatic completion.',
          ].join(' ');
      const plan = await getGoalProgramProposal({
        goalTitle: goal.title,
        goalKind: ongoing ? 'ongoing' : 'finite',
        currentMilestone: latest?.title,
        existingMilestones: history.map((m) => m.title),
        scheduleSummary,
        researchOptIn: allowPublicResearch,
        kneeReadiness: kneeReadiness ?? undefined,
        progressEntries: (recentProgress ?? []).map((entry) => ({
          entry_type: String(entry.entry_type ?? 'note'),
          content: String(entry.content ?? ''),
          created_at: entry.created_at,
        })),
        userMessage: [
          userMessage,
          kneeReadiness === 'still' ? 'CURRENT USER UPDATE: My knee still bothers me. Do not schedule running. Propose a useful assessment/decision next action, and later phases only as conditional future possibilities.' :
            kneeReadiness === 'better' ? 'CURRENT USER UPDATE: My knee is feeling better. This does not establish medical clearance. Suggest one practical readiness decision and appropriately cautious progression, rather than assume I can safely run.' :
            kneeReadiness === 'unsure' ? 'CURRENT USER UPDATE: I am unsure how my knee is doing. Offer one safe clarification/assessment step before any running and preserve future goal direction.' : '',
          pathPreference.trim(),
        ].filter(Boolean).join('\n'),
      });
      if (!plan) {
        setPathError('The Coach could not build a usable continuation. Try again or write your own milestone.');
        return;
      }
      const usedTitles = new Set(history.map((m) => String(m.title).trim().toLowerCase()));
      const phases: NewMilestoneDraft[] = plan.phases
        .filter((phase) => ongoing || !usedTitles.has(phase.title.trim().toLowerCase()))
        .map((phase) => ({
          title: phase.title.trim(),
          description: phase.description?.trim() ?? '',
          moves: phase.moves.map((move) => ({
            title: move.title.trim(),
            steps: move.steps.filter((step) => typeof step === 'string').map((step) => step.trim()).filter(Boolean),
            minutes: typeof move.minutes === 'number' && move.minutes > 0 ? move.minutes : null,
          })),
        }));
      // A practice gets the next meaningful occurrence, rather than endlessly
      // appending multiple repeat cycles in advance.
      const nextPhases = ongoing ? phases.slice(0, 1) : phases;
      if (!nextPhases.length) {
        setPathError('The Coach repeated completed milestones. Adjust your request or write your own next milestone.');
        return;
      }
      setPathSummary(plan.summary);
      setPathScheduleAdvice(plan.scheduleAdvice ?? null);
      setPathSources(plan.sources ?? []);
      setShowEvidence(false);
      setPathDraft(nextPhases);
      setSelectedPathPhases(nextPhases.map((_, index) => index));
      setExpandedPathPhase(null); // See the whole Journey first, not a wall of input fields.
      setShowPathSummary(false);
      setShowScheduleReason(false);
      setShowPathContext(false);
    } catch (err) {
      console.error('Could not suggest next milestones:', err);
      setPathError('Could not reach the Coach. Your completed milestones are safe; you can still write your own.');
    } finally {
      setPathThinking(false);
    }
  };

  const suggestSomethingNow = async () => {
    if (!goal || !goalId || quickThinking) return;
    const chosenMinutes = Number(quickMinutes);
    if (!Number.isInteger(chosenMinutes) || chosenMinutes < 1 || chosenMinutes > 180) {
      setQuickError('Choose a duration between 1 and 180 minutes.');
      return;
    }
    setQuickThinking(true);
    setQuickError(null);
    setQuickDraft(null);
    try {
      const { data: entries, error: progressError } = await supabase
        .from('progress_entries')
        .select('entry_type,content,created_at')
        .eq('goal_id', goalId)
        .order('created_at', { ascending: false })
        .limit(15);
      if (progressError) throw progressError;
      const result = await getQuickMoveProposal({
        goalTitle: goal.title,
        userMessage: quickRequest.trim() || 'I have time now for one useful action.',
        activityMinutes: chosenMinutes,
        kneeReadiness: kneeReadiness ?? undefined,
        lastMilestone: [...milestones].filter((m) => m.status === 'completed').slice(-1)[0]?.title ?? '',
        previousActions: actions.filter((a) => a.status === 'completed').slice(-8).map((a) => a.title),
        progressEntries: entries ?? [],
      });
      if (!result) {
        setQuickError('The Coach could not suggest a specific Next Move. Try again or use the full Path builder.');
        return;
      }
      setQuickDraft({
        title: result.milestoneTitle,
        description: result.milestonePurpose,
        moves: [result.move],
      });
      setQuickCoachNote(result.note);
      setQuickTotalMinutes(result.totalMinutes);
    } catch (error) {
      console.error('Could not suggest an immediate activity:', error);
      setQuickError('Could not reach the Coach. Your progress and schedule are unchanged.');
    } finally {
      setQuickThinking(false);
    }
  };

  const startManualMilestone = () => {
    setPathError(null);
    setPathSummary('Your own next milestone. Nothing is saved until you approve.');
    setPathScheduleAdvice(null);
    setPathSources([]);
    setPathDraft([{ title: '', description: '', moves: [{ title: '', steps: [], minutes: null }] }]);
    setSelectedPathPhases([0]);
    setExpandedPathPhase(0);
    setShowPathContext(false);
  };

  const editPathPhase = (index: number, updater: (phase: NewMilestoneDraft) => NewMilestoneDraft) => {
    setPathDraft((current) => current?.map((phase, i) => i === index ? updater(phase) : phase) ?? null);
  };

  const saveNewMilestones = async (options?: { quickDraft?: NewMilestoneDraft; openWorkspace?: boolean }) => {
    const proposed = options?.quickDraft ? [options.quickDraft] : pathDraft;
    if (!goal || !goalId || !proposed || pathSaveLock.current || goal.status === 'completed') return;
    const chosen = proposed.filter((_, i) => !!options?.quickDraft || selectedPathPhases.includes(i))
      .map((phase) => ({
        title: phase.title.trim(),
        description: phase.description.trim(),
        moves: phase.moves.map((move) => ({
          title: move.title.trim(), steps: move.steps.map((step) => step.trim()).filter(Boolean),
          minutes: move.minutes,
        })),
      }));
    if (!chosen.length || chosen.some((phase) => !phase.title || !phase.moves.length ||
      phase.moves.some((move) => !move.title))) {
      setPathError('Choose at least one milestone, with a title and a real Next Move for each one.');
      return;
    }
    if (new Set(chosen.map((phase) => phase.title.toLowerCase())).size !== chosen.length) {
      setPathError('Give each new milestone a distinct title so the Path is easy to follow.');
      return;
    }
    pathSaveLock.current = true;
    setPathSaving(true);
    setPathError(null);
    let insertedIds: string[] = [];
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      const user = auth.user;
      if (authError || !user) throw authError ?? new Error('Sign in before saving.');
      const { data: currentGoal, error: goalError } = await supabase.from('goals')
        .select('status').eq('id', goalId).eq('user_id', user.id).single();
      if (goalError || !currentGoal || currentGoal.status !== 'active') {
        throw new Error('This goal is no longer active. Refresh it before continuing.');
      }
      // Server-side recheck: another device may have continued the Path.
      const { data: existing, error: existingError } = await supabase.from('milestones')
        .select('id,position,status,title').eq('goal_id', goalId).order('position', { ascending: true });
      if (existingError) throw existingError;
      if ((existing ?? []).some((m) => m.status !== 'completed')) {
        throw new Error('A new milestone already exists. Refresh your Path before adding another.');
      }
      const oldTitles = new Set((existing ?? []).map((m) => String(m.title).trim().toLowerCase()));
      if (!goal.is_practice && chosen.some((phase) => oldTitles.has(phase.title.toLowerCase()))) {
        throw new Error('A proposed milestone duplicates something you already completed. Rename it first.');
      }
      const firstPosition = Math.max(-1, ...(existing ?? []).map((m) => Number(m.position ?? -1))) + 1;
      const milestoneRows = chosen.map((phase, i) => ({
        user_id: user.id, goal_id: goalId, title: phase.title,
        description: phase.description || null, weight: 1,
        position: firstPosition + i, status: 'pending',
      }));
      const { data: inserted, error: insertError } = await supabase.from('milestones')
        .insert(milestoneRows).select('id,position');
      if (insertError || !inserted || inserted.length !== chosen.length) {
        throw insertError ?? new Error('Could not create the full Path.');
      }
      insertedIds = inserted.map((m) => m.id);
      const byPosition = new Map<number, string>(inserted.map((m): [number, string] => [Number(m.position), String(m.id)]));
      const { data: allActions, error: actionsError } = await supabase.from('actions')
        .select('position').eq('goal_id', goalId);
      if (actionsError) throw actionsError;
      let actionPosition = Math.max(-1, ...(allActions ?? []).map((a) => Number(a.position ?? -1))) + 1;
      const actionRows = chosen.flatMap((phase, i) => phase.moves.map((move) => ({
        user_id: user.id,
        goal_id: goalId,
        milestone_id: byPosition.get(firstPosition + i),
        title: move.title,
        steps: move.steps,
        completed_steps: [],
        // AI durations are not verified yet; Smart Tools will derive an
        // editable timer only when the step timing is unambiguous.
        estimated_minutes: null,
        status: 'pending', type: 'task', position: actionPosition++,
      })));
      if (actionRows.some((row) => !row.milestone_id)) throw new Error('Could not match new milestones to Next Moves.');
      const { error: actionInsertError } = await supabase.from('actions').insert(actionRows);
      if (actionInsertError) throw actionInsertError;
      // The next stage only becomes active after all its Next Moves are saved.
      const nextId = byPosition.get(firstPosition);
      const { data: activated, error: activateError } = await supabase.from('milestones')
        .update({status:'active'}).eq('id', nextId!).eq('status','pending')
        .select('id').maybeSingle();
      if (activateError || !activated) throw activateError ?? new Error('Could not activate the next milestone.');
      insertedIds = []; // Successfully saved; never roll back on optional history errors.
      const { error: historyError } = await supabase.from('events').insert({
        user_id: user.id, object_id: goalId, event_type: 'path_continued',
        metadata: { milestoneIds: inserted.map((m) => m.id), source: 'user_approved', ongoing: !!goal.is_practice },
      });
      if (historyError) console.warn('Path saved but continuation event could not be logged:', historyError.message);
      setPathDraft(null);
      setQuickDraft(null);
      setShowQuickPanel(false);
      setSelectedPathPhases([]);
      setPathPreference('');
      setCoachMessage(`Your approved Path is ready. ${chosen.length} milestone${chosen.length === 1 ? '' : 's'} added; completed work and existing reminders were preserved.`);
      setRefreshKey((value) => value + 1);
      if (options?.openWorkspace && nextId) {
        router.push(`/goal/milestone/${nextId}`);
      }
    } catch (err: any) {
      console.error('Could not save milestone continuation:', err);
      // Best-effort cleanup if action creation or activation failed. We never
      // touch prior milestones, actions, reminders or the user's progress.
      if (insertedIds.length) {
        const { error: removeActionsError } = await supabase.from('actions').delete().in('milestone_id', insertedIds);
        const { error: removeMilestonesError } = await supabase.from('milestones').delete().in('id', insertedIds);
        if (removeActionsError || removeMilestonesError) {
          setPathError('Save failed and cleanup was incomplete. Refresh the Path before retrying; do not approve it twice.');
        } else {
          setPathError(err?.message ?? 'The Path could not be saved. No existing progress was changed.');
        }
      } else {
        setPathError(err?.message ?? 'The Path could not be saved.');
      }
    } finally {
      pathSaveLock.current = false;
      setPathSaving(false);
    }
  };

  const confirmActualGoalOutcome = () => {
    if (!goal || !goalId || goal.is_practice || outcomeSaving) return;
    Alert.alert(
      'Did you reach your actual goal?',
      `Have you genuinely achieved "${goal.title}"? Finishing a milestone or a checklist alone does NOT mean the whole goal is complete.`,
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Yes, goal achieved', onPress: async () => {
          setOutcomeSaving(true);
          try {
            const { data: stages, error: stagesError } = await supabase
              .from('milestones').select('status').eq('goal_id', goalId);
            if (stagesError) throw stagesError;
            if (!stages?.length || stages.some((stage) => stage.status !== 'completed')) {
              throw new Error('There are still unfinished milestones. Review your Path before confirming the final outcome.');
            }
            const { data: finished, error: finishError } = await supabase
              .from('goals')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('id', goalId).eq('status', 'active')
              .select('id').maybeSingle();
            if (finishError || !finished) throw finishError ?? new Error('This goal has already changed. Refresh and try again.');
            setPathDraft(null);
            setRefreshKey((value) => value + 1);
            Alert.alert('GOAL’D IN ✓', 'You confirmed the actual outcome. Your completed milestones and progress remain in your history.');
          } catch (err: any) {
            Alert.alert('Goal not updated', err?.message ?? 'Try again.');
          } finally {
            setOutcomeSaving(false);
          }
        } },
      ],
    );
  };

  const approveAdjustedMove = async () => {
    if (!nextPending || !adaptedMove || savingAdjustedMove) return;
    setSavingAdjustedMove(true);
    try {
      const steps = adaptedMove.steps.filter((x) => typeof x === 'string' && x.trim());
      const completed = Array.isArray(nextPending.completed_steps)
        ? nextPending.completed_steps.filter((step: string) => steps.includes(step))
        : [];
      const { data: changed, error: updateError } = await supabase
        .from('actions')
        .update({
          title: adaptedMove.title.trim(),
          steps,
          completed_steps: completed,
          estimated_minutes: adaptedMove.minutes > 0 ? adaptedMove.minutes : null,
        }).eq('id', nextPending.id).eq('status', 'pending')
        .select('*').single();
      if (updateError || !changed) throw updateError ?? new Error('The move is no longer pending.');
      setActions((current) => current.map((a) => a.id === nextPending.id ? (changed as Action) : a));
      setAdaptedMove(null);
      setAdaptedCompletedSteps([]);
      setCoachMessage('Your approved adjustment is saved.');
    } catch (err: any) {
      Alert.alert('Could not save adjustment', err?.message ?? 'Please try again.');
    } finally {
      setSavingAdjustedMove(false);
    }
  };

  useEffect(() => {
    if (!goalId) {
      setError('No goal selected');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/');
          return;
        }

        const [goalRes, actionRes, milestoneRes] = await Promise.all([
  supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single(),

  supabase
    .from('actions')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', user.id)
    .order('position', { ascending: true }),

  supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', user.id)
    .order('position', { ascending: true }),
]);

        if (goalRes.error || !goalRes.data) {
          setError(goalRes.error?.message || 'Could not load goal');
          setGoal(null);
          setActions([]);
          setMilestones([]);
        } else {
  setGoal(goalRes.data as Goal);
  setActions((actionRes.data || []) as Action[]);
  setMilestones(milestoneRes.data || []);
}

        await getCapacityForDate();
      } catch (err) {
        console.error(err);
        setError('Error loading goal');
      } finally {
        setLoading(false);
      

};
    };

    void load();
  }, [goalId, refreshKey]);
useFocusEffect(
  useCallback(() => {
    if (!goalId) return;

    let cancelled = false;

    const refreshActionProgress = async () => {
      const { data, error } = await supabase
        .from('actions')
        .select('*')
        .eq('goal_id', goalId)
        .order('position', { ascending: true });

      if (error) {
        console.error('Could not refresh action progress:', error);
        return;
      }
const { data: milestoneData, error: milestoneError } = await supabase
  .from('milestones')
  .select('*')
  .eq('goal_id', goalId)
  .order('position', { ascending: true });

if (milestoneError) {
  console.error('Could not refresh milestones:', milestoneError);
}
     if (!cancelled) {
  setActions((data ?? []) as Action[]);
  setMilestones(milestoneData ?? []);
}
    };

    void refreshActionProgress();

    return () => {
      cancelled = true;
    };
  }, [goalId])
);
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setTimerRunning(false);
          setMoveStarted(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [timerRunning]);

  // Future milestones can hold preplanned actions. Only show the next
  // pending move in the ACTIVE milestone, not one from a later stage.
  const activeForNextMove = milestones.find((m) => m.status === 'active');
  const nextPending = activeForNextMove
    ? actions.find((a) => a.status === 'pending' && a.milestone_id === activeForNextMove.id)
    : actions.find((a) => a.status === 'pending');
const goalComplete =
  goal?.status === 'completed';
// An unfinished goal with no remaining milestones needs a real continuation.
const pathNeedsContinuation = !!goal && !goalComplete && milestones.length > 0 &&
  milestones.every((m) => m.status === 'completed') &&
  !actions.some((a) => a.status === 'pending');
const isPractice = goal?.is_practice === true;
 const displayedMoveTitle =
  adaptedMove?.title ?? nextPending?.title;
const workspaceMilestoneId = nextPending?.milestone_id ?? null;

const workspaceMilestone = workspaceMilestoneId
  ? milestones.find((m) => m.id === workspaceMilestoneId)
  : milestones.find((m) => m.status === 'active');
const displayedMoveMinutes =
  adaptedMove?.minutes ?? nextPending?.estimated_minutes;

const displayedMoveSteps =
  adaptedMove?.steps ??
  (Array.isArray(nextPending?.steps) ? nextPending.steps : []);
  const savedCompletedSteps = Array.isArray(nextPending?.completed_steps)
  ? nextPending.completed_steps
  : [];

const unfinishedDisplayedSteps = displayedMoveSteps.filter(
  (step: string, index: number) => {
    if (adaptedMove) {
      return !adaptedCompletedSteps.includes(index);
    }

    return !savedCompletedSteps.includes(step);
  }
);

const nextTwoSteps = unfinishedDisplayedSteps.slice(0, 2);

const displayedCompletedCount = adaptedMove
  ? adaptedCompletedSteps.length
  : displayedMoveSteps.filter((step: string) =>
      savedCompletedSteps.includes(step)
    ).length;

const displayedMoveProgress =
  displayedMoveSteps.length > 0
    ? Math.round(
        (displayedCompletedCount / displayedMoveSteps.length) * 100
      )
    : 0; 
const completedMilestones = milestones.filter(
  (m) => m.status === 'completed'
).length;

// Show REAL milestone completion on the main goal ring, not checklist
// progress. A finished workout/Next Move is not a finished 5K goal.
// The final achieved outcome is its own checkpoint after the milestones.
// This prevents an unconfirmed goal from showing a misleading 99%.
// A progress ring reports actual completed stages, never a fabricated
// percentage of the goal's final outcome. The existing 100% achieved
// state remains reserved for user-confirmed completion.
  function addSelectedTimeFromDate(date: Date) {
    if (activeReminderDay === null) return;
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    setEditingDayTimes((current) => current.map((item) =>
      item.day === activeReminderDay
        ? { ...item, times: [...new Set([...item.times, time])].sort() }
        : item
    ));
    setPendingTime(date);
    setActiveReminderDay(null);
    setShowCustomPicker(false);
  }

  function cancelScheduleEditing() {
    setEditingDayTimes(savedSchedule?.dayTimes.map((item) => ({...item, times: [...item.times]})) ?? []);
    setActiveReminderDay(null);
    setShowCustomPicker(false);
    setShowScheduleBuilder(false);
  }

  function startScheduleEditing() {
    setEditingDayTimes(savedSchedule?.dayTimes.map((item) => ({...item, times: [...item.times]})) ?? []);
    setShowScheduleBuilder(true);
  }

  useEffect(() => {
    if (!goalId) return;
    let cancelled = false;
    async function loadSaved() {
      setSavedSchedule(null);
      setEditingDayTimes([]);
      setLegacyScheduleUntracked(false);
      try {
        const raw = await AsyncStorage.getItem(`goal-schedule-${goalId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const dayTimes = readStoredDayTimes(parsed);
          if (dayTimes.length > 0) {
            if (!cancelled) {
              setSavedSchedule({
                version: 2, dayTimes,
                notificationIds: Array.isArray(parsed.notificationIds) ? parsed.notificationIds : [],
              });
              setEditingDayTimes(dayTimes);
              setLegacyScheduleUntracked(false);
            }
            return;
          }
        }
        // Existing goals were given WHEN context in goal_created events, but
        // reminders were not saved in AsyncStorage. Recover the chosen days.
        const { data, error } = await supabase
          .from('events')
          .select('event_type, metadata, created_at')
          .eq('object_id', goalId)
          .in('event_type', ['goal_created', 'goal_schedule_updated'])
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) {
          console.warn('Could not load timing history:', error.message);
          return;
        }
        for (const row of data ?? []) {
          const when = row.event_type === 'goal_created'
            ? row.metadata?.when_context
            : row.metadata;
          const dayTimes = readStoredDayTimes(when);
          if (dayTimes.length > 0) {
            if (!cancelled) {
              setSavedSchedule({ version: 2, dayTimes, notificationIds: [] });
              setEditingDayTimes(dayTimes);
              setLegacyScheduleUntracked(row.event_type === 'goal_created');
            }
            break;
          }
        }
      } catch (e) {
        console.warn('Could not restore goal schedule:', e);
      }
    }
    void loadSaved();
    return () => { cancelled = true; };
  }, [goalId]);

  async function saveMoveSchedule() {
    if (!goalId || savingReminder) return;
    const dayTimes = cleanDayTimes(editingDayTimes);
    if (dayTimes.length === 0 || dayTimes.some((item) => item.times.length === 0)) {
      Alert.alert('Choose a time', 'Select at least one time for each chosen day.');
      return;
    }
    setSavingReminder(true);
    const newIds: string[] = [];
    let notificationsActive = false;
    const Notifications = await getNotifications();
    try {
      if (Notifications) {
        const { status } = await Notifications.requestPermissionsAsync();
        notificationsActive = status === 'granted';
        if (notificationsActive) {
          // Make replacements before touching old reminders. If one fails,
          // cancel the partial batch and preserve the previous schedule.
          for (const item of dayTimes) {
            for (const time of item.times) {
              const [hour, minute] = time.split(':').map(Number);
              const id = await Notifications.scheduleNotificationAsync({
                content: {
                  title: `GOAL'D IN — ${goal?.title ?? 'YOUR GOAL'}`,
                  body: nextPending?.title ?? `Time to make progress on ${goal?.title ?? 'your goal'}.`,
                  sound: true,
                  data: { goalId, source: 'goal-schedule' },
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                  weekday: item.day, hour, minute,
                },
              });
              newIds.push(id);
            }
          }
        }
      }
      const record: SavedGoalSchedule = { version: 2, dayTimes, notificationIds: newIds };
      // Saving a schedule is not dependent on notification permission.
      await AsyncStorage.setItem(`goal-schedule-${goalId}`, JSON.stringify(record));

      // Cancel only reminders provably owned by this goal: IDs stored by this
      // app and tagged notification data. Never cancel another goal by title.
      if (Notifications) {
        const existingIds = new Set(savedSchedule?.notificationIds ?? []);
        try {
          const scheduled = await Notifications.getAllScheduledNotificationsAsync();
          for (const request of scheduled) {
            if (request.content.data?.goalId === goalId && !newIds.includes(request.identifier)) {
              existingIds.add(request.identifier);
            }
          }
        } catch (err) {
          console.warn('Could not inspect existing reminders:', err);
        }
        for (const oldId of existingIds) {
          if (newIds.includes(oldId)) continue;
          try { await Notifications.cancelScheduledNotificationAsync(oldId); }
          catch (err) { console.warn('Could not cancel an old reminder:', err); }
        }
      }
      setSavedSchedule(record);
      setEditingDayTimes(dayTimes);
      setShowScheduleBuilder(false);
      setShowReminderMenu(false);
      setShowScheduleSavedModal(true);
      // Keep the server-side history when possible. Device-local save has
      // already succeeded, so a history failure must not undo the UI success.
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user) {
          const { error: historyError } = await supabase.from('events').insert({
            user_id: auth.user.id,
            event_type: 'goal_schedule_updated',
            object_id: goalId,
            metadata: { version: 2, schedule_days: dayTimes },
          });
          if (historyError) console.warn('Could not sync schedule history:', historyError.message);
        }
      } catch (syncError) {
        console.warn('Could not sync schedule history:', syncError);
      }
      if (legacyScheduleUntracked) {
        // Pre-update reminders have no stored ID/goal tag. We cannot safely
        // cancel them by title because two goals may share the same title.
        setLegacyScheduleUntracked(false);
      } else if (!notificationsActive) {
        Alert.alert('Schedule saved', 'Your days and times are saved on this device. Enable notifications to receive alerts.');
      }
    } catch (error) {
      console.error('Could not save schedule:', error);
      if (Notifications) {
        for (const id of newIds) {
          try { await Notifications.cancelScheduledNotificationAsync(id); }
          catch (cleanupError) { console.warn('Could not clean up new reminder:', cleanupError); }
        }
      }
      Alert.alert('Could not save schedule', 'Your previous schedule was left unchanged. Try again.');
    } finally {
      setSavingReminder(false);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#F0D06A" /></View>
  if (error) return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Pressable style={s.backButton} onPress={() => router.back()}><Text style={s.backText}>← BACK</Text></Pressable>
        <View style={s.errorCard}><Text style={s.errorTitle}>Could not load</Text><Text style={s.errorCopy}>{error}</Text></View>
      </ScrollView>
    </View>
  );
  

  return (
    <SafeAreaView style={s.page} edges={["top"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Pressable style={s.backButton} onPress={() => router.back()}><Text style={s.backText}>← BACK</Text></Pressable>

        <Text style={s.brand}>GOAL'D IN</Text>

        <View style={s.hero}>
            <Pressable
  onPress={() => {
    Alert.alert(
      'Goal Options',
      undefined,
      [
        {
          text: 'Delete Goal',
          style: 'destructive',
          onPress: deleteGoal,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  }}
  style={{
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 10,
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: 2,
    }}
  >
    •••
  </Text>
</Pressable>
          <Text style={s.eyebrow}>
  {isPractice
    ? 'ONGOING PRACTICE'
    : goalComplete
      ? 'GOAL COMPLETE ✓'
      : !nextPending
        ? 'MILESTONE REVIEW'
        : 'ACTIVE GOAL'}
</Text>
          <Text style={s.title}>{goal?.title}</Text>
          {isPractice ? (
  <View
    style={{
      width: 100,
      height: 100,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 72,
        fontWeight: '700',
        lineHeight: 80,
      }}
    >
      ∞
    </Text>

    <Text
      style={{
        color: '#D8B24A',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1,
        textAlign: 'center',
      }}
    >
      ONGOING PRACTICE
    </Text>
  </View>
) : (
  <GoalStageRing
    completed={completedMilestones}
    total={milestones.length}
    achieved={goalComplete}
    size={104}
  />
)}
          <Text style={s.subtitle}>{goal?.title || ''}</Text>
        </View>
        {goal && milestones.length > 0 && (
          <View style={{ marginTop: 14, marginBottom: 10, marginHorizontal: 16, padding: 16, backgroundColor: '#171510', borderRadius: 18, borderWidth: 1, borderColor: '#4B3D25', gap: 12 }}>
            <Text style={{ color: '#D8B24A', fontSize: 11, fontWeight: '900', letterSpacing: 1.8 }}>THE JOURNEY</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '900' }}>
                  {completedMilestones} stage{completedMilestones === 1 ? '' : 's'} behind you
                </Text>
                <Text style={{ color: '#BDBDBD', fontSize: 12, marginTop: 5 }} numberOfLines={2}>
                  {goalComplete ? 'You reached your finish line.' : activeForNextMove?.title ?? 'Your next chapter is ready to plan.'}
                </Text>
              </View>
              <Text style={{ color: '#D8B24A', fontSize: 28, marginLeft: 10 }}>✦</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {milestones.slice(0, 8).map((stage, index) => (
                <View key={String(stage.id ?? index)} style={{ flex: 1, height: 6, borderRadius: 10,
                  backgroundColor: stage.status === 'completed' ? '#D8B24A' : stage.status === 'active' ? '#847246' : '#34312D' }} />
              ))}
            </View>
            <Pressable onPress={() => setShowJourneyShare((value) => !value)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
              <Text style={{ color: '#DFC478', fontSize: 12, fontWeight: '900' }}>{showJourneyShare ? 'CLOSE SHARING PREVIEW ↑' : 'SHARE A MOMENT OF PROGRESS ↗'}</Text>
            </Pressable>
            {showJourneyShare && (
              <View style={{ backgroundColor: '#0F0F0F', borderRadius: 13, padding: 13, gap: 10, borderWidth: 1, borderColor: '#40382A' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Your story, your choice.</Text>
                <Text style={{ color: '#AFAFAF', fontSize: 12, lineHeight: 18 }}>Preview what you'd share. Your WHY, schedule, notes, health details and Circle are always excluded.</Text>
                <Pressable onPress={() => setShareGoalName((v) => !v)} style={{ paddingVertical: 3 }}>
                  <Text style={{ color: '#D6D6D6' }}>{shareGoalName ? '☑' : '☐'}  Include my goal title</Text>
                </Pressable>
                <Pressable onPress={() => setShareJourneyProgress((v) => !v)} style={{ paddingVertical: 3 }}>
                  <Text style={{ color: '#D6D6D6' }}>{shareJourneyProgress ? '☑' : '☐'}  Include milestone count</Text>
                </Pressable>
                <Text style={{ color: '#D6C7A5', fontSize: 13, lineHeight: 20, padding: 10, borderRadius: 9, backgroundColor: '#21201C' }}>{journeyShareText()}</Text>
                <Pressable onPress={() => void shareJourney()} style={{ backgroundColor: '#D8B24A', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#0D0D0D', fontWeight: '900' }}>CHOOSE WHO TO SHARE WITH ↗</Text>
                </Pressable>
                <Text style={{ color: '#8F8F8F', fontSize: 11 }}>Opens your phone's share sheet. Nothing is shared until you choose a recipient. Private Circle integration is not yet connected.</Text>
              </View>
            )}
          </View>
        )}
{goalComplete && !isPractice && (
  <View
    style={{
      marginTop: 18,
      marginBottom: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: '#D8B24A',
      borderRadius: 16,
      backgroundColor: '#111111',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 1.5,
        marginBottom: 8,
      }}
    >
      WHAT'S NEXT?
    </Text>

    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 8,
      }}
    >
      You reached this goal.
    </Text>

    <Text
      style={{
        color: '#AAAAAA',
        fontSize: 14,
        lineHeight: 20,
      }}
    >
      What you built here can end here, continue, or become something more.
    </Text>
    <View style={{ marginTop: 16, gap: 10 }}>
  <Pressable
  onPress={() =>
  router.push({
    pathname: '/goal-it',
    params: {
      buildFromGoal: goal?.title ?? '',
      parentGoalId: goal?.id ?? '',
    },
  })
}
    style={{
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: '#D8B24A',
    }}
  >
    <Text
      style={{
        color: '#000000',
        fontWeight: '900',
        textAlign: 'center',
      }}
    >
      BUILD ON THIS
    </Text>
  </Pressable>

  <Pressable
  onPress={keepGoalGoing}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        textAlign: 'center',
      }}
    >
      KEEP IT GOING
    </Text>
  </Pressable>

  <Pressable
  onPress={() => {
    router.back();
  }}
  style={{
      paddingVertical: 12,
    }}
  >
    <Text
      style={{
        color: '#888888',
        fontWeight: '700',
        textAlign: 'center',
      }}
    >
      I'M GOOD HERE ✓
    </Text>
  </Pressable>
</View>
  </View>
)}
        <View style={s.nextMoveCard}>
          {coachMessage && (
  <View
    style={{
      marginBottom: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: '#D8B24A',
      borderRadius: 16,
      backgroundColor: '#111111',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 8,
      }}
    >
      GOAL'D IN COACH
    </Text>

    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        lineHeight: 23,
      }}
    >
      {coachMessage}
    </Text>
  </View>
)} 
{adaptationCompleted && (
  <View
    style={{
      marginBottom: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: '#D8B24A',
      borderRadius: 12,
    }}
  >
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '800',
        marginBottom: 6,
      }}
    >
      YOU MADE PROGRESS TODAY
    </Text>

    <Text
      style={{
        color: '#E8E8E8',
        fontSize: 15,
        lineHeight: 21,
        marginBottom: 16,
      }}
    >
      Want to keep going, or call today's move complete?
    </Text>

  

    <Pressable
      onPress={() => {
        setAdaptationCompleted(false);
        setCoachMessage(
          "Good work. You adjusted, made progress, and stayed on your path."
        );
      }}
      style={{
        marginTop: 10,
        paddingVertical: 12,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: '#D8B24A',
          fontWeight: '800',
          fontSize: 15,
        }}
      >
        DONE FOR TODAY
      </Text>
    </Pressable>
  </View>
)} 
          <Text style={s.nextMoveLabel}>⚡  YOUR NEXT MOVE</Text>

          {nextPending ? (
            <>
            <Text style={s.nextMoveTitle}>{displayedMoveTitle}</Text>
<Text style={s.nextMoveMeta}>
  {displayedMoveMinutes
    ? `ABOUT ${displayedMoveMinutes} MIN`
    : displayedMoveSteps.length > 0
    ? `${displayedMoveSteps.length} STEP${displayedMoveSteps.length === 1 ? '' : 'S'}`
    : 'READY WHEN YOU ARE'}
</Text>
{adaptedMove ? (
  <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#D8B24A', borderRadius: 12, padding: 12, gap: 9 }}>
    <Text style={{ color: '#D8B24A', fontWeight: '900' }}>COACH SUGGESTION — NOT SAVED</Text>
    <Text style={{ color: '#C8C8C8', fontSize: 12 }}>Review this adjustment before it replaces your existing Next Move.</Text>
    <Pressable onPress={() => void approveAdjustedMove()} disabled={savingAdjustedMove}
      style={{ backgroundColor: '#D8B24A', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
      <Text style={{ color: '#111111', fontWeight: '900' }}>
        {savingAdjustedMove ? 'SAVING...' : 'APPROVE CHANGE ✓'}
      </Text>
    </Pressable>
    <Pressable onPress={() => { setAdaptedMove(null); setAdaptedCompletedSteps([]); }}
      style={{ paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ color: '#CFCFCF', fontWeight: '700' }}>KEEP ORIGINAL MOVE</Text>
    </Pressable>
  </View>
) : null}
{workspaceMilestone?.id && (
  <Pressable
    onPress={() => router.push(`/goal/milestone/${workspaceMilestone.id}` as any)}
    style={{ backgroundColor: '#D8B24A', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 }}>
    <Text style={{ color: '#101010', fontWeight: '900', letterSpacing: 1 }}>OPEN WORKSPACE →</Text>
  </Pressable>
)}
{displayedMoveSteps.length > 0 && (
  <Pressable onPress={() => setShowGoalCardChecklist((value) => !value)} style={{ paddingVertical: 12 }}>
    <Text style={{ color: '#D8B24A', fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
      {showGoalCardChecklist ? 'HIDE CHECKLIST' : `VIEW CHECKLIST · ${displayedCompletedCount}/${displayedMoveSteps.length}`}
    </Text>
  </Pressable>
)}
{showGoalCardChecklist && displayedMoveSteps.length > 0 ? (
  <View style={{ marginTop: 14 }}>
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: '#8E8E93',
          fontSize: 11,
          fontWeight: '900',
          letterSpacing: 1,
        }}
      >
        UP NEXT
      </Text>

      <Text
        style={{
          color: '#D8B24A',
          fontSize: 12,
          fontWeight: '900',
        }}
      >
        {displayedMoveProgress}% MOVE
      </Text>
    </View>
<Text
  style={{
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10,
  }}
>
  {displayedCompletedCount} of {displayedMoveSteps.length} actions complete
</Text>
    {displayedMoveSteps.map((step: string, index: number) => (
      <Pressable
  key={`${step}-${index}`}
  onPress={() => toggleNextMoveStep(step)}
  style={{
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  }}
>
       <Text
  style={{
    color: '#D8B24A',
    fontSize: 18,
    width: 22,
    marginRight: 8,
  }}
>
  {Array.isArray(nextPending?.completed_steps) &&
  nextPending.completed_steps.includes(step)
    ? '✓'
    : '○'}
</Text>

        <Text
          style={{
            flex: 1,
            color: '#D6D6D8',
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {step}
        </Text>
      </Pressable>
    ))}
{suggestedCompletedSteps.length > 0 && (
  <View style={{
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#D8B24A',
    borderRadius: 12,
  }}>
    <Text style={{
      color: '#D8B24A',
      fontWeight: '700',
      marginBottom: 8,
    }}>
      GOAL'D IN RECOGNIZED YOUR PROGRESS
    </Text>

    {suggestedCompletedSteps.map((step) => (
      <Pressable
        key={step}
        onPress={async () => {
          await toggleNextMoveStep(step);
          setSuggestedCompletedSteps((current) =>
            current.filter((item) => item !== step)
          );
        }}
        style={{ paddingVertical: 8 }}
      >
        <Text style={{ color: '#FFFFFF' }}>
          ☐ {step}
        </Text>
      </Pressable>
    ))}

    <Text style={{ color: '#999999', fontSize: 12 }}>
      Tap each step to confirm you completed it.
    </Text>
  </View>
)}
{displayedMoveSteps.length > 0 &&
unfinishedDisplayedSteps.length === 0 ? (      <Text
        style={{
          color: '#D8B24A',
          fontWeight: '900',
          marginTop: 4,
        }}
      >
        ALL ACTIONS COMPLETE ✓
      </Text>
    ) : null}
{nextPending && !adaptedMove &&
  (displayedMoveSteps.length === 0 ||
    unfinishedDisplayedSteps.length === 0) ? (
  <Pressable
    onPress={() => completeMove(nextPending.id)}
    style={{
      marginTop: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: '#D8B24A',
    }}
  >
    <Text
      style={{
        color: '#000000',
        fontWeight: '900',
        textAlign: 'center',
      }}
    >
      CONTINUE MY PATH ✓
    </Text>
  </Pressable>
) : null}
      </View>
) : null}
  
           
<Pressable onPress={() => setShowGoalCardCoachOptions((value) => !value)} style={{ paddingVertical: 11, alignItems: 'center' }}>
  <Text style={{ color: '#A6A6A6', fontWeight: '800', fontSize: 11 }}>
    {showGoalCardCoachOptions ? 'HIDE ADDITIONAL COACH OPTIONS' : 'MORE COACH OPTIONS'}
  </Text>
</Pressable>
{showGoalCardCoachOptions && (
  <>
<Pressable
  onPress={() => {
    setShowChangedMenu((current) => !current);
    setCoachInput('');
  }}
  style={{
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D8B24A',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontWeight: '800',
      letterSpacing: 1,
      textAlign: 'center',
    }}
  >
    TELL GOALD IN
  </Text>
</Pressable>
{showChangedMenu && (
  <View
    style={{
      marginTop: 10,
      gap: 8,
    }}
  >
   
<View
  style={{
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8, }}>
  {[
  'I HAVE LESS TIME',
  'TOO DIFFICULT',
  'WRONG TIME',
  'SOMETHING CHANGED',
  "THIS ISN'T THE RIGHT MOVE",
].map((reason) => {
    const selected = coachInput === reason;
  
  return (
    <Pressable
      key={reason}
      onPress={() => setCoachInput(reason)}
      style={{
        borderWidth: 1,
        borderColor: selected ? '#D8B24A' : '#3A3426',
        backgroundColor: selected ? '#1A1812' : '#111111',
        borderRadius: 12,
        paddingVertical: 9,
        paddingHorizontal: 11,
      }}
    >
      <Text
        style={{
          color: selected ? '#D8B24A' : '#FFFFFF',
          fontSize: 14,
          fontWeight: '800',
        }}
      >
        {reason}
      </Text>
    </Pressable>
  );
})}
 </View>
<View
  style={{
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#3A3426',
    borderRadius: 14,
    backgroundColor: '#111111',
    padding: 12,
  }}
>
  <TextInput
    value={coachInput}
    onChangeText={setCoachInput}
    placeholder="Progress, a problem, something you learned, or anything that changed..."
    placeholderTextColor="#777777"
    multiline
    editable={!coachThinking}
    autoCapitalize="sentences"
    selectionColor="#D8B24A"
    returnKeyType="send"
    onSubmitEditing={submitCoachInput}
    style={{
      color: '#FFFFFF',
      fontSize: 16,
      lineHeight: 22,
      minHeight: 90,
      width: '100%',
      textAlignVertical: 'top',
    }}
  />

  <Pressable
    onPress={startCoachListening}
    disabled={coachThinking}
    style={{
      alignSelf: 'flex-end',
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginTop: 4,
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 14,
        fontWeight: '900',
      }}
    >
      {coachListening ? '🎙 LISTENING...' : '🎙 SPEAK'}
    </Text>
  </Pressable>
</View>
<Pressable
  onPress={submitCoachInput}
  disabled={!coachInput.trim() || coachThinking}
  style={{
    marginTop: 10,
    backgroundColor:
      !coachInput.trim() || coachThinking ? '#3A3426' : '#D8B24A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  }}
>
  <Text
    style={{
      color:
        !coachInput.trim() || coachThinking ? '#777777' : '#0B0B0B',
      fontWeight: '900',
      letterSpacing: 1,
    }}
  >
    {coachThinking ? 'THINKING...' : 'CONTINUE'}
  </Text>
</Pressable>
</View>
)}
{showPriorityMenu && (
  <View
    style={{
      marginTop: 10,
      gap: 8,
    }}
  >
    
  <Text
    style={{
      color: '#D9B84C',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 1,
    }}
  >
    WHAT CHANGED?
  </Text>

  <TextInput
    value={coachInput}
    onChangeText={setCoachInput}
    placeholder="Tell me what's going on..."
    placeholderTextColor="#777777"
    multiline
    style={{
      color: '#FFFFFF',
      fontSize: 16,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 90,
      textAlignVertical: 'top',
    }}
  />

  <Pressable
  disabled={coachThinking}
    onPress={async() => {
  if (!coachInput.trim()) return;

  const response = coachInput.trim();
setCoachThinking(true);
let workspaceProgress: Array<{
  entry_type: string;
  content: string;
  created_at?: string;
}> = [];

if (workspaceMilestone?.id) {
  const { data: progressData, error: progressError } = await supabase
    .from('progress_entries')
    .select('entry_type, content, created_at')
    .eq('milestone_id', workspaceMilestone.id)
    .order('created_at', { ascending: true })
    .limit(20);

  if (progressError) {
    console.error(
      'Could not load workspace progress for coach:',
      progressError
    );
  } else {
    workspaceProgress = progressData ?? [];
  }
}
const aiResponse = await getGoalCoachResponse({
  goalTitle: goal?.title ?? "",
  nextMoveTitle: displayedMoveTitle ?? "",
  nextMoveMinutes: displayedMoveMinutes ?? null,
  milestones: milestones.map((m) => m.title),
  progressEntries: workspaceProgress,
  userMessage: response,
})
if (!aiResponse) {
  setCoachMessage(
    "I couldn't reach the coach right now. Your progress is still saved."
  );
  setCoachThinking(false);
  return;
}
console.log("GOAL COACH AI RESPONSE:", aiResponse);
if (aiResponse.proposedMove) {
setAdaptedMove({
  ...aiResponse.proposedMove,
  minutes: aiResponse.proposedMove.minutes ?? 10,
});
  setAdaptedCompletedSteps([]);
}
 setCoachMessage(aiResponse.message);
 setCoachThinking(false);

  setShowCoachInput(true);
  setCoachInput("");
  setShowMoveCheckMenu(true);
}}
    style={{
      borderWidth: 1,
      borderColor: '#D9B84C',
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: '#D9B84C',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
      }}
    >
     {coachThinking ? "COACHING..." : "TELL THE COACH"}
    </Text>
  </Pressable>
</View>
)}{showMoveCheckMenu && (
  <View
    style={{
      marginTop: 10,
      gap: 8,
    }}
  >
    <Text
      style={{
        color: '#D9B84C',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 4,
      }}
    >
      DOES THIS NEXT MOVE STILL FIT?
    </Text>

    <Pressable
      onPress={() => {
        setShowMoveCheckMenu(false);
        setCoachMessage(
          `Good. Keep "${nextPending.title}" as your Next Move. Stay Goal'D In.`
        );
      }}
      style={{
        borderWidth: 1,
        borderColor: '#3A3426',
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 14,
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: '700',
        }}
      >
        YES — KEEP THIS MOVE
      </Text>
    </Pressable>

    <Pressable
      onPress={() => {
  setShowMoveCheckMenu(false);
  setShowBetterMoveMenu(true);

  setCoachMessage(
    `Absolutely. What would make the Next Move better right now?`
  );
}}
      style={{
        borderWidth: 1,
        borderColor: '#3A3426',
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 14,
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: '700',
        }}
      >
        NO — GIVE ME A BETTER MOVE
      </Text>
    </Pressable>
  </View>
)}
{showBetterMoveMenu && (
  <View
    style={{
      marginTop: 10,
      gap: 8,
    }}
  >
    <Text
      style={{
        color: '#D9B84C',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 4,
      }}
    >
      WHAT WOULD HELP?
    </Text>

    {[
      'MAKE IT SMALLER',
      'I HAVE LESS TIME',
      'MAKE IT EASIER TO START',
      'TRY A DIFFERENT APPROACH',
    ].map((option) => (
      <Pressable
        key={option}
        onPress={async () => {
  setShowBetterMoveMenu(false);
  setCoachThinking(true);

  try {
    const aiResponse = await getGoalCoachResponse({
      goalTitle: goal?.title ?? '',
      nextMoveTitle: nextPending?.title ?? '',
      nextMoveMinutes: nextPending?.estimated_minutes ?? null,
      userMessage: option,
    });

    console.log('GOAL COACH QUICK OPTION:', aiResponse);

    if (aiResponse?.proposedMove) {
  setAdaptedMove({
    ...aiResponse.proposedMove,
    minutes: aiResponse.proposedMove.minutes ?? 10,
  });
     
      setAdaptedCompletedSteps([]);
    }

    setCoachMessage(aiResponse?.message ?? "");
    if (aiResponse?.action === 'RESCHEDULE') {
  setShowReminderMenu(true);
}
  } catch (error) {
    console.error('GOAL COACH QUICK OPTION ERROR:', error);
    setCoachMessage(
      "I couldn't adjust that move right now. Try again."
    );
  } finally {
    setCoachThinking(false);
  }
}}
        style={{
          borderWidth: 1,
          borderColor: '#3A3426',
          borderRadius: 10,
          paddingVertical: 11,
          paddingHorizontal: 14,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: '700',
          }}
        >
          {option}
        </Text>
      </Pressable>
    ))}
  </View>
)}
  </>
)}
{/* A guided activity timer belongs in the milestone workspace.
    Existing timer state stays untouched during this UI cleanup. */}
<Pressable
  style={[s.secondaryActionButton, { marginTop: 12 }]}
  onPress={() => {
    if (showReminderMenu) cancelScheduleEditing();
    setShowReminderMenu(!showReminderMenu);
  }}>
  <Text style={s.secondaryActionText}>{showReminderMenu ? 'HIDE SCHEDULE' : 'VIEW / EDIT COMMITMENTS'}</Text>
</Pressable>
{showReminderMenu && (
  <View style={s.reminderMenu}>
    <Text style={s.reminderTitle}>YOUR REPEATING SCHEDULE</Text>
    {savedSchedule && !showScheduleBuilder && (
      <View style={{ marginTop: 12, gap: 8 }}>
        {savedSchedule.dayTimes.map((item) => (
          <View key={item.day} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900' }}>{WEEKDAY_NAMES[item.day - 1]}</Text>
            <Text style={{ color: '#FFFFFF', flex: 1, textAlign: 'right' }}>
              {item.times.length ? item.times.map(clockLabel).join(' · ') : 'Time not set'}
            </Text>
          </View>
        ))}
        <Pressable onPress={startScheduleEditing} style={{ marginTop: 12, paddingVertical: 12 }}>
          <Text style={{ color: '#D8B24A', fontWeight: '900', textAlign: 'center' }}>EDIT SCHEDULE →</Text>
        </Pressable>
      </View>
    )}
    {!savedSchedule && !showScheduleBuilder && (
      <>
        <Text style={{ color: '#A9A9A9', marginTop: 8, lineHeight: 20 }}>
          No repeating schedule found for this goal. Add one if you'd like reminders.
        </Text>
        <Pressable onPress={startScheduleEditing} style={[s.primaryButton, { marginTop: 12 }]}>
          <Text style={s.primaryButtonText}>+ MAKE A SCHEDULE</Text>
        </Pressable>
      </>
    )}
    {showScheduleBuilder && (
      <View style={s.scheduleBuilder}>
        <Text style={s.sectionTitle}>CHOOSE YOUR DAYS</Text>
        {legacyScheduleUntracked && (
          <Text style={{ color: '#C7AF76', fontSize: 12, lineHeight: 18, marginTop: 10 }}>
            This schedule was recovered from your goal setup. Reminders created before this update can't be identified safely; changing it may leave an older alert active.
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          {['S','M','T','W','T','F','S'].map((label, idx) => {
            const day = idx + 1;
            const active = editingDayTimes.some((item) => item.day === day);
            return (
              <Pressable key={day} onPress={() => setEditingDayTimes((current) =>
                active ? current.filter((item) => item.day !== day)
                  : [...current, {day, times: []}].sort((a,b) => a.day - b.day)
              )} style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D8B24A', backgroundColor: active ? '#D8B24A' : '#111111', marginRight: 8, marginBottom: 8 }}>
                <Text style={{ color: active ? '#0B0B0B' : '#D8B24A', fontWeight: '900' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {editingDayTimes.map((item) => (
          <View key={item.day} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#3A321F' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', marginBottom: 10 }}>
              {WEEKDAY_NAMES[item.day - 1]}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {item.times.map((time) => (
                <Pressable key={time} onPress={() => setEditingDayTimes((current) => current.map((entry) =>
                  entry.day === item.day ? {...entry, times: entry.times.filter((t) => t !== time)} : entry
                ))} style={{ borderWidth: 1, borderColor: '#55482F', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#D8B24A', fontWeight: '800' }}>{clockLabel(time)} ×</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => {
              setActiveReminderDay(item.day);
              setPendingTime(defaultTimePickerDate());
              setShowCustomPicker(true);
            }} style={{ marginTop: 10, paddingVertical: 10 }}>
              <Text style={{ color: '#D8B24A', fontWeight: '900' }}>+ ADD TIME</Text>
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
          <Pressable onPress={cancelScheduleEditing} disabled={savingReminder} style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
            <Text style={{ color: '#A9A9A9', fontWeight: '900' }}>CANCEL</Text>
          </Pressable>
          <Pressable onPress={saveMoveSchedule} disabled={savingReminder} style={{ backgroundColor: '#D8B24A', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 }}>
            <Text style={{ color: '#0B0B0B', fontWeight: '900' }}>{savingReminder ? 'SAVING...' : 'SAVE SCHEDULE'}</Text>
          </Pressable>
        </View>
        <GoalTimePicker show={showCustomPicker} showDate={false} initialDate={pendingTime}
          addedTimes={activeReminderDay !== null ? editingDayTimes.find((item) => item.day === activeReminderDay)?.times.map(clockLabel) ?? [] : []}
          onCancel={() => { setActiveReminderDay(null); setShowCustomPicker(false); }}
          onAdd={addSelectedTimeFromDate} />
      </View>
    )}
  </View>
)}
              

            </>
          ) : (
            <View
              style={{
                paddingVertical: 14,
                paddingHorizontal: 4,
                gap: 9,
              }}
            >
              <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 15 }}>
                {goalComplete ? 'GOAL ACHIEVED ✓' : 'LAST NEXT MOVE COMPLETED ✓'}
              </Text>
              <Text style={{ color: '#D6D6D8', lineHeight: 22, fontSize: 14 }}>
                {goalComplete
                  ? 'This goal is recorded as completed.'
                  : 'The last action is finished, but your milestone and goal are not automatically complete. Review your milestone below before deciding what comes next.'}
              </Text>
              {!goalComplete && milestones.some((m) => m.status === 'active') ? (
                <View style={{ marginTop: 8, gap: 12 }}>
                  <Text style={{ color: '#D8B24A', fontWeight: '900' }}>CONTINUE THIS MILESTONE</Text>
                  <Text style={{ color: '#C7C7C7', fontSize: 13, lineHeight: 19 }}>
                    Finished an action, not the milestone. Ask the Coach to suggest another move based on your recorded progress, or write one yourself.
                  </Text>
                  <TextInput
                    value={continuationNote}
                    onChangeText={setContinuationNote}
                    placeholder="Anything the Coach should consider? (optional)"
                    placeholderTextColor="#8E8E93"
                    multiline
                    style={{ color: '#FFFFFF', borderWidth: 1, borderColor: '#3A3426', borderRadius: 10, padding: 11, minHeight: 55 }}
                  />
                  <Pressable
                    onPress={() => void askCoachForContinuation()}
                    disabled={continuationLoading || continuationSaving}
                    style={{ backgroundColor: '#D8B24A', paddingVertical: 13, borderRadius: 11, alignItems: 'center' }}>
                    <Text style={{ color: '#111111', fontWeight: '900' }}>
                      {continuationLoading ? 'COACH THINKING...' : 'SUGGEST MY NEXT MOVE →'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => { setContinuationDraft({title: '', steps: [], minutes: null}); setContinuationError(null); }}
                    style={{ paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ color: '#D8B24A', fontWeight: '800' }}>WRITE MY OWN NEXT MOVE</Text>
                  </Pressable>
                  {continuationError ? <Text style={{ color: '#EDB7A9', lineHeight: 19 }}>{continuationError}</Text> : null}
                  {continuationDraft ? (
                    <View style={{ borderWidth: 1, borderColor: '#65512A', borderRadius: 12, padding: 13, gap: 9 }}>
                      <Text style={{ color: '#D8B24A', fontWeight: '900' }}>REVIEW BEFORE SAVING</Text>
                      <Text style={{ color: '#B5B5B5', fontSize: 12 }}>You can edit this suggestion. Nothing is added until you approve it.</Text>
                      <Text style={{ color: '#B5B5B5', fontSize: 12 }}>Next Move title</Text>
                      <TextInput
                        value={continuationDraft.title}
                        onChangeText={(title) => setContinuationDraft((draft) => draft ? {...draft, title} : draft)}
                        placeholder="What should you do next?"
                        placeholderTextColor="#777777"
                        style={{ color: '#FFFFFF', borderWidth: 1, borderColor: '#65512A', borderRadius: 9, padding: 10 }}
                      />
                      <Text style={{ color: '#B5B5B5', fontSize: 12 }}>Steps — one per line (optional)</Text>
                      <TextInput
                        value={continuationDraft.steps.join('\n')}
                        onChangeText={(value) => setContinuationDraft((draft) => draft ? {...draft, steps: value.split('\n').slice(0, 6)} : draft)}
                        multiline
                        placeholder="First action\nSecond action"
                        placeholderTextColor="#777777"
                        style={{ color: '#FFFFFF', borderWidth: 1, borderColor: '#65512A', borderRadius: 9, padding: 10, minHeight: 72, textAlignVertical: 'top' }}
                      />
                      <Pressable onPress={() => void saveContinuation()}
                        disabled={continuationSaving || !continuationDraft.title.trim()}
                        style={{ backgroundColor: continuationDraft.title.trim() ? '#D8B24A' : '#444444', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
                        <Text style={{ color: continuationDraft.title.trim() ? '#111111' : '#CCCCCC', fontWeight: '900' }}>
                          {continuationSaving ? 'SAVING...' : 'APPROVE & SAVE NEXT MOVE ✓'}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => setContinuationDraft(null)}
                        style={{ paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ color: '#CCCCCC', fontWeight: '700' }}>NOT NOW</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </View>
        
          {pathNeedsContinuation && (
            <View style={{ marginTop: 18, borderWidth: 1, borderColor: '#6C562D', backgroundColor: '#17150F', borderRadius: 16, padding: 16, gap: 11 }}>
              <Text style={{ color: '#D8B24A', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 }}>HAVE TIME RIGHT NOW?</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '900' }}>One useful Next Move. Not a whole new plan.</Text>
              {!showQuickPanel ? (
                <Pressable onPress={() => { setShowQuickPanel(true); setQuickError(null); }}
                  style={{ backgroundColor: '#D8B24A', padding: 14, borderRadius: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#141414', fontWeight: '900' }}>GIVE ME A PUSH NOW →</Text>
                </Pressable>
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={{ color: '#E8E8E8', fontSize: 13 }}>How many minutes do you want for the main activity?</Text>
                  <TextInput value={quickMinutes} onChangeText={(value) => { setQuickMinutes(value.replace(/[^0-9]/g, '')); setQuickDraft(null); }}
                    keyboardType="number-pad" accessibilityLabel="Minutes for today's activity"
                    placeholder="5" placeholderTextColor="#777777"
                    style={{ color: '#FFFFFF', borderWidth: 1, borderColor: '#6C562D', borderRadius: 10, padding: 11 }} />
                  <Text style={{ color: '#AFAFAF', fontSize: 12 }}>Tell the Coach what you feel ready for. Your current situation matters more than an old blocker.</Text>
                  <TextInput value={quickRequest} onChangeText={(value) => { setQuickRequest(value); setQuickDraft(null); }}
                    multiline placeholder="I feel good, and I want to do something right now..." placeholderTextColor="#777777"
                    style={{ color: '#FFFFFF', borderWidth: 1, borderColor: '#6C562D', borderRadius: 10, padding: 11, minHeight: 60, textAlignVertical: 'top' }} />
                  <Pressable onPress={() => void suggestSomethingNow()} disabled={quickThinking || pathSaving}
                    style={{ backgroundColor: '#D8B24A', padding: 13, borderRadius: 10, alignItems: 'center', opacity: quickThinking ? 0.6 : 1 }}>
                    <Text style={{ color: '#111111', fontWeight: '900' }}>{quickThinking ? 'COACH THINKING...' : 'SUGGEST MY ACTIVITY →'}</Text>
                  </Pressable>
                  {quickError ? <Text style={{ color: '#F1B8A9', lineHeight: 19 }}>{quickError}</Text> : null}
                  {quickDraft ? (
                    <View style={{ borderWidth: 1, borderColor: '#725D30', backgroundColor: '#242018', padding: 13, borderRadius: 12, gap: 9 }}>
                      <Text style={{ color: '#F0D06A', fontWeight: '900', fontSize: 12 }}>YOUR NEXT MOVE — REVIEW FIRST</Text>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 17 }}>{quickDraft.moves[0]?.title}</Text>
                      {quickTotalMinutes ? <Text style={{ color: '#E1C886', fontSize: 12 }}>Suggested timer: {quickTotalMinutes} minutes total, including warm-up and cooldown where applicable</Text> : null}
                      {quickDraft.moves[0]?.steps.map((step, index) => (
                        <Text key={`${index}-${step}`} style={{ color: '#D5D5D5', fontSize: 13, lineHeight: 19 }}>• {step}</Text>
                      ))}
                      {quickCoachNote ? <Text style={{ color: '#BBB4A2', fontSize: 12, lineHeight: 18 }}>{quickCoachNote}</Text> : null}
                      <Text style={{ color: '#AFAFAF', fontSize: 11, lineHeight: 17 }}>Nothing has been saved. Approving creates one current milestone and Next Move, then opens its Workspace. Starting a timer is a separate choice.</Text>
                      <Pressable disabled={pathSaving} onPress={() => void saveNewMilestones({ quickDraft, openWorkspace: true })}
                        style={{ backgroundColor: '#D8B24A', padding: 13, alignItems: 'center', borderRadius: 10, opacity: pathSaving ? 0.6 : 1 }}>
                        <Text style={{ color: '#111111', fontWeight: '900' }}>{pathSaving ? 'SAVING...' : 'APPROVE & OPEN WORKSPACE →'}</Text>
                      </Pressable>
                      <Pressable onPress={() => setQuickDraft(null)} style={{ padding: 8, alignItems: 'center' }}>
                        <Text style={{ color: '#C9C9C9' }}>TRY A DIFFERENT ACTIVITY</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Text style={{ color: '#999999', fontSize: 11, lineHeight: 17 }}>Want to add Friday to your repeating schedule? Use VIEW / EDIT COMMITMENTS separately. No days, reminders, sharing or tracking permissions are changed by this suggestion.</Text>
                  <Pressable onPress={() => { setShowQuickPanel(false); setQuickDraft(null); }} style={{ padding: 8, alignItems: 'center' }}>
                    <Text style={{ color: '#C8C8C8', fontWeight: '700' }}>NOT NOW / SHOW MY PATH</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          {pathNeedsContinuation && !showQuickPanel && (
            <View style={{ marginTop: 18, padding: 18, borderWidth: 1, borderColor: '#D8B24A', borderRadius: 16, backgroundColor: '#15130F', gap: 12 }}>
              <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 15 }}>YOUR PATH CONTINUES →</Text>
              {pathDraft && (
                <Pressable onPress={() => setShowPathContext((v) => !v)}
                  style={{ alignSelf: 'flex-start', paddingVertical: 5, paddingRight: 12 }}>
                  <Text style={{ color: '#E2C078', fontWeight: '900', fontSize: 12 }}>
                    {showPathContext ? 'HIDE PLANNING CHOICES ↑' : 'CHANGE MY ANSWERS OR REBUILD ↗'}
                  </Text>
                </Pressable>
              )}
              {(!pathDraft || showPathContext) && (
                <>
              <Text style={{ color: '#FFFFFF', lineHeight: 21 }}>
                {isPractice
                  ? 'That meaningful occasion is in your history. Ready to prepare for the next one?'
                  : 'Your planned milestones are complete, but your goal has not been confirmed achieved. Let’s build the next part of your journey.'}
              </Text>
              {!!savedSchedule?.dayTimes.length && (
                <Text style={{ color: '#CBB77F', fontSize: 12, lineHeight: 18 }}>
                  Your chosen schedule: {savedSchedule.dayTimes.map((item) =>
                    `${WEEKDAY_NAMES[item.day - 1]} ${item.times.map(clockLabel).join(', ')}`).join(' · ')}
                </Text>
              )}
              <TextInput
                value={pathPreference}
                onChangeText={setPathPreference}
                placeholder="Anything new the Coach should consider? (optional)"
                placeholderTextColor="#777777"
                multiline
                style={{ borderWidth: 1, borderColor: '#5C4C2F', borderRadius: 9, padding: 10, color: '#FFFFFF', minHeight: 46 }}
              />
              <Pressable onPress={() => setAllowPublicResearch((current) => !current)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 }}>
                <Text style={{ color: allowPublicResearch ? '#D8B24A' : '#999999', fontSize: 17 }}>{allowPublicResearch ? '☑' : '☐'}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: '#D8B24A', fontWeight: '800', fontSize: 12 }}>USE OPTIONAL PUBLIC WEB RESEARCH</Text>
                  <Text style={{ color: '#9A9A9A', fontSize: 11, lineHeight: 16 }}>If a search service is configured, share only this goal's title with the search provider to retrieve source links. Your WHY, progress and Circle aren't sent. Off by default.</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => void suggestNextMilestones()} disabled={pathThinking || pathSaving}
                style={{ backgroundColor: '#D8B24A', padding: 14, borderRadius: 11, alignItems: 'center', opacity: pathThinking || pathSaving ? 0.7 : 1 }}>
                <Text style={{ fontWeight: '900', color: '#111111' }}>
                  {pathThinking ? 'COACH BUILDING...' : (isPractice ? 'SUGGEST NEXT OCCASION →' : 'BUILD MY NEXT MILESTONES →')}
                </Text>
              </Pressable>
              {(readinessPromptVisible || kneeReadiness) && !isPractice && (
                <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#242018', borderWidth: 1, borderColor: '#8A703A', gap: 9 }}>
                  <Text style={{ color: '#F0D06A', fontWeight: '900', fontSize: 13 }}>ONE QUICK CHECK-IN</Text>
                  <Text style={{ color: '#F4F4F4', fontSize: 15, lineHeight: 21 }}>You mentioned knee pain earlier. How is it affecting you now?</Text>
                  {([
                    ['still', 'It still bothers me'],
                    ['better', 'It feels better now'],
                    ['unsure', "I'm not sure yet"],
                  ] as const).map(([value, label]) => (
                    <Pressable key={value} onPress={() => {setKneeReadiness(value); setPathError(null);}}
                      style={{ borderRadius: 10, padding: 11, backgroundColor: kneeReadiness === value ? '#D8B24A' : '#181818', borderWidth: 1, borderColor: kneeReadiness === value ? '#D8B24A' : '#555046' }}>
                      <Text style={{ color: kneeReadiness === value ? '#111111' : '#ECECEC', fontWeight: '800' }}>{kneeReadiness === value ? '✓  ' : ''}{label}</Text>
                    </Pressable>
                  ))}
                  <Text style={{ color: '#ADADAD', fontSize: 11, lineHeight: 17 }}>This helps personalize the proposal; it doesn't diagnose an injury or change your schedule. Medical guidance may be important if pain persists or is concerning.</Text>
                </View>
              )}
              <Pressable onPress={startManualMilestone} disabled={pathThinking || pathSaving} style={{ padding: 9, alignItems: 'center' }}>
                <Text style={{ color: '#D8B24A', fontWeight: '800' }}>WRITE MY OWN NEXT MILESTONE</Text>
              </Pressable>
              {!isPractice && (
                <Pressable onPress={confirmActualGoalOutcome} disabled={outcomeSaving || pathSaving}
                  style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <Text style={{ color: '#A8A8A8', fontWeight: '800', fontSize: 12 }}>
                    {outcomeSaving ? 'CONFIRMING OUTCOME...' : 'I ACTUALLY ACHIEVED MY ORIGINAL GOAL ✓'}
                  </Text>
                </Pressable>
              )}
                </>
              )}
              {pathError ? <Text style={{ color: '#EAB6A8', lineHeight: 19 }}>{pathError}</Text> : null}
              {pathDraft && (
                <View style={{ gap: 10, borderTopWidth: 1, borderColor: '#5B4C2E', paddingTop: 14 }}>
                  <Text style={{ color: '#D8B24A', fontWeight: '900', letterSpacing: 1.5, fontSize: 12 }}>YOUR NEXT CHAPTER</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 23, fontWeight: '900', lineHeight: 29 }}>Your next chapter, at a glance.</Text>
                  <Text style={{ color: '#BEBEBE', fontSize: 12 }}>Your progress remains saved. Review the stages, then decide what belongs in your Path.</Text>
                  <View style={{ backgroundColor: '#211D14', borderRadius: 14, borderWidth: 1, borderColor: '#67532A', padding: 13, gap: 6 }}>
                    <Text style={{ color: '#E9C978', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>WHAT COMES FIRST</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>
                      {pathDraft.find((_, i) => selectedPathPhases.includes(i))?.moves[0]?.title ?? 'Choose your next action'}
                    </Text>
                    <Text style={{ color: '#BEB6A5', fontSize: 12 }}>
                      {selectedPathPhases.length} of {pathDraft.length} stages selected · Nothing is saved yet
                    </Text>
                    {!isPractice && (
                      <Text style={{ color: '#D8B24A', fontSize: 12, fontWeight: '800' }}>
                        Finish line: {goal?.title}
                      </Text>
                    )}
                  </View>
                  {!!pathSummary && (
                    <Pressable onPress={() => setShowPathSummary((v) => !v)} style={{ paddingVertical: 5 }}>
                      <Text style={{ color: '#CFCFCF', fontSize: 13, lineHeight: 20 }} numberOfLines={showPathSummary ? undefined : 2}>{pathSummary}</Text>
                      {pathSummary.length > 120 && <Text style={{ color: '#D8B24A', fontSize: 12, fontWeight: '800', marginTop: 5 }}>{showPathSummary ? 'SHOW LESS' : 'READ COACH REASONING ↓'}</Text>}
                    </Pressable>
                  )}
                  <Text style={{ color: '#AFAFAF', fontSize: 12, lineHeight: 18 }}>
                    Select what fits. Open a stage only if you'd like to change it. Nothing is saved or scheduled until you approve.
                  </Text>
                  {pathDraft.map((phase, i) => {
                    const chosen = selectedPathPhases.includes(i);
                    const expanded = expandedPathPhase === i;
                    return (
                      <View key={`${i}-${phase.title}`} style={{ borderWidth: 1, borderColor: chosen ? '#8B743D' : '#373737', borderRadius: 15, padding: 14, gap: 9, backgroundColor: chosen ? '#191710' : '#141414' }}>
                        <Pressable onPress={() => setSelectedPathPhases((current) => current.includes(i) ? current.filter((value) => value !== i) : [...current, i])}>
                          <Text style={{ color: chosen ? '#E5C36F' : '#999999', fontWeight: '900', fontSize: 16, lineHeight: 22 }}>
                            {chosen ? '◉' : '○'}   {String(i + 1).padStart(2, '0')}  {phase.title?.replace(/^(?:phase\s*\d+\s*[:.-]\s*)/i, '') || 'Untitled milestone'}
                          </Text>
                        </Pressable>
                        <Text style={{ color: '#B9B9B9', fontSize: 13, lineHeight: 18 }} numberOfLines={expanded ? undefined : 2}>
                          {phase.description || 'A meaningful next stage'}
                        </Text>
                        <Text style={{ color: '#CEAD61', fontSize: 11, fontWeight: '800' }}>{phase.moves.length} NEXT MOVE{phase.moves.length === 1 ? '' : 'S'} · FIRST: {phase.moves[0]?.title ?? 'To be decided'}</Text>
                        <Pressable onPress={() => setExpandedPathPhase(expanded ? null : i)} style={{ paddingVertical: 6 }}>
                          <Text style={{ color: '#D8B24A', fontWeight: '800', fontSize: 12 }}>
                            {expanded ? 'HIDE DETAILS' : 'VIEW / EDIT DETAILS'}
                          </Text>
                        </Pressable>
                        {expanded && (
                          <View style={{ gap: 8 }}>
                            <Text style={{ color: '#AAAAAA', fontSize: 12 }}>Milestone</Text>
                            <TextInput value={phase.title} onChangeText={(title) => editPathPhase(i, (item) => ({...item,title}))}
                              style={{ borderWidth: 1, borderColor: '#65512A', color: '#FFFFFF', padding: 9, borderRadius: 8 }} />
                            <Text style={{ color: '#AAAAAA', fontSize: 12 }}>Purpose</Text>
                            <TextInput value={phase.description} onChangeText={(description) => editPathPhase(i, (item) => ({...item,description}))}
                              multiline style={{ borderWidth: 1, borderColor: '#65512A', color: '#FFFFFF', padding: 9, borderRadius: 8 }} />
                            {phase.moves.map((move, j) => (
                              <View key={j} style={{ borderTopWidth: 1, borderColor: '#3B3323', paddingTop: 9, gap: 7 }}>
                                <Text style={{ color: '#D8B24A', fontSize: 12, fontWeight: '800' }}>NEXT MOVE {j + 1}</Text>
                                <TextInput value={move.title} onChangeText={(title) => editPathPhase(i, (item) => ({
                                  ...item, moves: item.moves.map((old, k) => k === j ? {...old,title} : old),
                                }))} style={{ borderWidth: 1, borderColor: '#65512A', color: '#FFFFFF', padding: 9, borderRadius: 8 }} />
                                <Text style={{ color: '#AAAAAA', fontSize: 12 }}>Steps (one per line)</Text>
                                <TextInput value={move.steps.join('\n')} multiline
                                  onChangeText={(value) => editPathPhase(i, (item) => ({
                                    ...item, moves: item.moves.map((old, k) => k === j ? {...old,steps:value.split('\n').slice(0, 6)} : old),
                                  }))}
                                  style={{ borderWidth: 1, borderColor: '#65512A', color: '#FFFFFF', padding: 9, borderRadius: 8, minHeight: 50, textAlignVertical: 'top' }} />
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                  {pathScheduleAdvice && (
                    <View style={{ backgroundColor: '#211E18', borderRadius: 13, padding: 12, borderWidth: 1, borderColor: '#554628', gap: 7 }}>
                      <Pressable onPress={() => setShowScheduleReason((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ color: '#D8B24A', fontSize: 20 }}>◷</Text>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ color: '#E3C77D', fontWeight: '900', fontSize: 11, letterSpacing: 1 }}>COACHING YOUR SCHEDULE</Text>
                          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{pathScheduleAdvice.headline}</Text>
                        </View>
                        <Text style={{ color: '#D8B24A' }}>{showScheduleReason ? '−' : '+'}</Text>
                      </Pressable>
                      {showScheduleReason && (
                        <View style={{ gap: 6, borderTopWidth: 1, borderColor: '#4E442F', paddingTop: 9 }}>
                          <Text style={{ color: '#C9C9C9', lineHeight: 19, fontSize: 13 }}>{pathScheduleAdvice.explanation}</Text>
                          {!!pathScheduleAdvice.optionalChange && <Text style={{ color: '#E7C878', lineHeight: 19, fontSize: 13 }}>OPTIONAL · {pathScheduleAdvice.optionalChange}</Text>}
                          <Text style={{ color: '#A2A2A2', fontSize: 11 }}>Your chosen schedule stays unchanged unless you edit and approve it.</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <Pressable onPress={() => setShowEvidence((current) => !current)} style={{ paddingVertical: 8 }}>
                    <Text style={{ color: '#D8B24A', fontWeight: '800', fontSize: 12 }}>
                      {showEvidence ? 'HIDE RESEARCH' : `WHY THIS APPROACH?  ${pathSources.length ? `· ${pathSources.length} SOURCES` : '· COACH SUGGESTION'}`}
                    </Text>
                  </Pressable>
                  {showEvidence && (
                    <View style={{ gap: 8, backgroundColor: '#191919', borderRadius: 10, padding: 12 }}>
                      {pathSources.length ? pathSources.map((source, i) => (
                        <View key={`${i}-${source.url}`} style={{ gap: 3, borderBottomWidth: i < pathSources.length - 1 ? 1 : 0, borderColor: '#3D3D3D', paddingBottom: 8 }}>
                          <Text style={{ color: '#F0D06A', fontWeight: '800', fontSize: 13 }}>{source.organization} · {source.title}</Text>
                          <Text style={{ color: '#C4C4C4', lineHeight: 17, fontSize: 12 }}>{source.note}</Text>
                          <Pressable onPress={() => void Linking.openURL(source.url).catch(() => Alert.alert('Could not open source'))}>
                            <Text style={{ color: '#A3BAD2', fontSize: 11, textDecorationLine: 'underline' }}>OPEN SOURCE ↗</Text>
                          </Pressable>
                          {source.origin === 'search' && <Text style={{ color: '#919191', fontSize: 11 }}>Retrieved search result — review the source for relevance.</Text>}
                        </View>
                      )) : (
                        <Text style={{ color: '#BABABA', fontSize: 12 }}>No outside research was available for this goal. These are Coach suggestions, not verified best-practice claims.</Text>
                      )}
                    </View>
                  )}
                  <Text style={{ color: '#AFAFAF', fontSize: 12, lineHeight: 18 }}>
                    Your existing reminders and schedule won't change. Dates for new sessions are not automatically booked. Calendar or Circle sharing always needs your permission.
                  </Text>
                  <Pressable onPress={() => void saveNewMilestones()} disabled={pathSaving || pathThinking}
                    style={{ backgroundColor: '#D8B24A', padding: 14, borderRadius: 10, alignItems: 'center', opacity: pathSaving ? 0.6 : 1 }}>
                    <Text style={{ color: '#101010', fontWeight: '900' }}>{pathSaving ? 'SAVING PATH...' : 'APPROVE & ADD TO MY PATH ✓'}</Text>
                  </Pressable>
                  <Pressable onPress={() => { setPathDraft(null); setPathError(null); }} disabled={pathSaving} style={{ alignItems: 'center', padding: 10 }}>
                    <Text style={{ color: '#AAAAAA', fontWeight: '800' }}>NOT NOW</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {goal?.status === 'completed' && (
           <View
  style={{
    width: '100%',
    marginTop: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D8B24A',
    borderRadius: 18,
    backgroundColor: '#111111',
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 2,
      textAlign: 'center',
    }}
  >
    ACHIEVEMENT COMPLETE
  </Text>

  <Text
    style={{
      color: '#FFFFFF',
      fontSize: 26,
      fontWeight: '900',
      textAlign: 'center',
      marginTop: 12,
    }}
  >
    {goal?.title}
  </Text>

  <Text
    style={{
      color: '#8E8E93',
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 20,
    }}
  >
    You said you would do it — and did.
  </Text>

  <Pressable
    onPress={shareAchievement}
    style={{
      backgroundColor: '#D8B24A',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    }}
  >
    <Text
      style={{
        color: '#080808',
        fontWeight: '900',
        fontSize: 15,
        letterSpacing: 1,
      }}
    >
      SHARE ACHIEVEMENT
    </Text>
  </Pressable>

{!isPractice && (
  <>
  <Pressable
    onPress={renewGoal}
    style={{
      borderWidth: 1,
      borderColor: '#D8B24A',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        fontSize: 15,
        letterSpacing: 1,
      }}
    >
      
      RENEW GOAL
    </Text>
  </Pressable>
  <Pressable
    onPress={archiveGoal}
    style={{
      borderWidth: 1,
      borderColor: '#3A3A3C',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: '#E5E5E5',
        fontWeight: '800',
        fontSize: 14,
        letterSpacing: 1,
      }}
    >
      ARCHIVE ACHIEVEMENT
    </Text>
  </Pressable>
  </>

)}
</View>
              
    )}
{milestones.length > 0 ? (
  <View
    style={{
      marginTop: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 18,
      backgroundColor: '#111111',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 20,
      }}
    >
      YOUR PATH
    </Text>

    {milestones.map((milestone, index) => {
      const isCurrent = milestone.status === 'active';
      const isReadyToConfirm =
  isCurrent &&
  actions.some(
    (action) => action.milestone_id === milestone.id
  ) &&
  !actions.some(
    (action) =>
      action.milestone_id === milestone.id &&
      action.status !== 'completed'
  ) &&
  (
    nextPending?.milestone_id !== milestone.id ||
    (
      displayedMoveSteps.length > 0 &&
      unfinishedDisplayedSteps.length === 0
    )
  );
      const isLast = index === milestones.length - 1;

      return (
        <View
          key={milestone.id}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              width: 34,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 2,
                alignItems: 'center',
justifyContent: 'center',
                borderColor:
  milestone.status === 'completed' || isCurrent
    ? '#D8B24A'
    : '#E6E7E3',
backgroundColor:
  milestone.status === 'completed' || isCurrent
    ? '#D8B24A'
    : 'transparent',
              }}
>
{milestone.status === 'completed' && (
  <Text
    style={{
      color: '#111111',
      fontSize: 13,
      fontWeight: '900',
      lineHeight: 17,
    }}
  >
    ✓
  </Text>
)}
</View>

            {!isLast ? (
              <View
                style={{
                  width: 2,
                  flex: 1,
                  minHeight: 58,
                  backgroundColor: '#3A3426',
                  marginTop: 4,
                }}
              />
            ) : null}
          </View>

          <View
            style={{
              flex: 1,
              paddingBottom: isLast ? 0 : 22,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: isCurrent ? '#FFFFFF' : '#B8B8BD',
                  fontSize: 17,
                  fontWeight: isCurrent ? '900' : '700',
                }}
              >
                {milestone.title}
              </Text>

              {isCurrent ? (
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: '#D8B24A',
                  }}
                >
                  <Text
                    style={{
                      color: '#000000',
                      fontSize: 10,
                      fontWeight: '900',
                      letterSpacing: 0.8,
                    }}
                  >
                    {isReadyToConfirm ? 'READY TO CONFIRM' : 'CURRENT'}
                  </Text>
                </View>
              ) : null}
            </View>

            {milestone.description ? (
              <Text
                style={{
                  color: '#8E8E93',
                  fontSize: 14,
                  marginTop: 6,
                  lineHeight: 20,
                }}
              >
                {milestone.description}
              </Text>
            ) : null}

            {milestone.target_date ? (
              <Text
                style={{
                  color: isCurrent ? '#D8B24A' : '#8E8E93',
                  fontSize: 13,
                  marginTop: 7,
                  fontWeight: isCurrent ? '700' : '500',
                }}
              >
                Target: {new Date(milestone.target_date).toLocaleDateString()}
              </Text>
            ) : null}
            {isCurrent ? (
  <Pressable
    onPress={() => {
  router.push({
    pathname: '/goal/milestone/[milestoneId]',
    params: {
      milestoneId: milestone.id,
    },
  });
}}
    style={{
      marginTop: 14,
      alignSelf: 'flex-start',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#3A321F',
      backgroundColor: '#111111',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
      }}
    >
      OPEN WORKSPACE →
    </Text>
  </Pressable>
) : null}
{isReadyToConfirm ? (
  <Pressable
    onPress={() => {
      Alert.alert(
        'Milestone review',
        `Have you actually achieved "${milestone.title}"? Checking off the planned actions does not necessarily mean this milestone is complete.`,
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'Yes, achieved',
            onPress: async () => {
              try {
                await confirmMilestone(milestone.id);
                setRefreshKey((current) => current + 1);
                setShowMilestoneConfirmed(true);
              } catch (error: any) {
                Alert.alert(
                  'Could not confirm milestone',
                  error?.message ?? 'Please try again.'
                );
              }
            },
          },
        ]
      );
    }}
    style={{
      marginTop: 12,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: '#D8B24A',
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: '#000000',
        fontSize: 14,
        fontWeight: '900',
      }}
    >
      CONFIRM MILESTONE ✓
    </Text>
  </Pressable>
) : null}
          </View>
        </View>
      );
    })}
  </View>
) : null}
      </ScrollView>
      <Modal
  visible={showMilestoneConfirmed}
  transparent
  animationType="fade"
  onRequestClose={() => setShowMilestoneConfirmed(false)}
>
  <View
    style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    }}
  >
    <View
      style={{
        width: '100%',
        backgroundColor: '#111111',
        borderWidth: 1,
        borderColor: '#D4AF37',
        borderRadius: 16,
        padding: 28,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#D4AF37', fontSize: 34, marginBottom: 12 }}>
        ✓
      </Text>

      <Text
        style={{
          color: '#D4AF37',
          fontSize: 20,
          fontWeight: '900',
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        MILESTONE COMPLETE
      </Text>

      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 15,
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        Progress recorded. Your Path continues.
      </Text>

      <Pressable
        onPress={() => {
          setShowMilestoneConfirmed(false);
          // The database decides whether another planned milestone exists.
          // If not, prepare a proposal; never add anything without approval.
          if (!goalComplete) void suggestNextMilestones();
        }}
        style={{
          backgroundColor: '#D4AF37',
          borderRadius: 10,
          paddingVertical: 15,
          paddingHorizontal: 24,
          width: '100%',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#111111', fontWeight: '900' }}>
          CONTINUE MY PATH
        </Text>
      </Pressable>
    </View>
  </View>
</Modal>
      <Modal visible={showScheduleSavedModal} transparent animationType="fade" onRequestClose={() => setShowScheduleSavedModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '86%', backgroundColor: '#111111', borderRadius: 12, borderWidth: 1, borderColor: '#D8B24A', padding: 18 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 16, marginBottom: 8 }}>SCHEDULE SAVED</Text>
            <Text style={{ color: '#FFFFFF', marginBottom: 18 }}>Your chosen days and times have been saved. Reminders depend on notification permission.</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              {savedSchedule && (
                <Pressable onPress={() => {
                  setShowScheduleSavedModal(false);
                  startScheduleEditing();
                  setShowReminderMenu(true);
                }} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                  <Text style={{ color: '#D8B24A', fontWeight: '900' }}>EDIT SCHEDULE</Text>
                </Pressable>
              )}

              <Pressable onPress={() => setShowScheduleSavedModal(false)} style={{ backgroundColor: '#D8B24A', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }}>
                <Text style={{ color: '#0B0B0B', fontWeight: '900' }}>DONE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0B0B' },
  scroll: { padding: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backButton: { marginBottom: 8 },
  backText: { color: '#D8B24A', fontWeight: '900' },
  brand: { color: '#D8B24A', fontWeight: '900', fontSize: 12, letterSpacing: 1.5, marginBottom: 12 },
  hero: { marginBottom: 18 },
  eyebrow: { color: '#8E8E93', fontSize: 12, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginBottom: 12 },
  progressWrap: { alignItems: 'center', marginVertical: 8 },
  subtitle: { color: '#8E8E93', marginTop: 8 },
  nextMoveCard: { padding: 12, backgroundColor: '#111111', borderRadius: 12, borderWidth: 1, borderColor: '#3A321F' },
  nextMoveLabel: { color: '#D8B24A', fontWeight: '900', marginBottom: 8 },
  nextMoveTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  nextMoveMeta: { color: '#8E8E93', marginTop: 6 },
  startMoveButton: { marginTop: 12, backgroundColor: '#D8B24A', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  startMoveText: { color: '#0B0B0B', fontWeight: '900' },
  reminderMenu: { marginTop: 14, borderWidth: 1, borderColor: '#3A3425', borderRadius: 18, padding: 16, backgroundColor: '#111111' },
  reminderTitle: { color: '#D8B24A', fontSize: 13, fontWeight: '900', letterSpacing: 1.5, marginBottom: 14 },
  primaryButton: { backgroundColor: '#D8B24A', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  primaryButtonText: { color: '#0B0B0B', fontWeight: '900' },
  scheduleBuilder: { marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#3A321F' },
  sectionTitle: { color: '#D8B24A', fontWeight: '900', marginBottom: 8 },
  errorCard: { marginTop: 20, padding: 16 },
  errorTitle: { fontWeight: '900', color: '#fff' },
  errorCopy: { color: '#ddd', marginTop: 8 },
  secondaryActionButton: {
  marginTop: 12,
  borderWidth: 1,
  borderColor: '#DDB84A',
  borderRadius: 16,
  paddingVertical: 16,
  alignItems: 'center',
  backgroundColor: '#111111',
},

secondaryActionText: {
  color: '#DDB84A',
  fontSize: 16,
  fontWeight: '900',
  letterSpacing: 1,
},
});
