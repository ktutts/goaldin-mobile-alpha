import React, { useEffect, useRef, useState } from 'react';import {
  ActivityIndicator,
  AppState,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getGoalCoachResponse, getGoalProgramProposal } from '@/lib/goalCoach';
import type { GoalProgram } from '@/lib/goalCoach';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveTimerState,
  clearTimerState,
  loadTimerState,
} from '../../../lib/smartTools/timerStorage';import { saveActivitySession } from '../../../lib/smartTools/saveActivitySession';
import { completeNextMove as completeNextMoveEngine } from '../../../lib/completeNextMove';
import { analyzeMove } from '../../../lib/smartTools/analyzeMove';
import type { ActivitySession, TimerStage } from '../../../lib/smartTools/types';
import { scanForBluetoothDevices } from '../../../lib/smartTools/bluetooth';
import type { ConnectedDevice } from '../../../lib/smartTools/types';
import {
  scheduleTimerNotification,
  scheduleGuidedTimerNotifications,
  cancelTimerNotifications,
} from '../../../lib/smartTools/timerNotifications';
import { useAudioPlayer } from 'expo-audio';
import { BleManager } from 'react-native-ble-plx';
import {
  startActivitySession,
  stopActivitySession,
} from '../../../lib/smartTools/activitySession';

type ProgressEntryType = 'result' | 'learned' | 'decision' | 'blocker' | 'note';

type ReviewedMoveProposal = {
  title: string;
  minutes: number | null;
  steps: string[];
};

// A Coach response is a suggestion, not permission to change someone's Path.
// Only accept a specific, actionable single-Move adaptation here. Broader
// Path changes and rescheduling need their own separate approval flows.
function getReviewableMove(response: any): ReviewedMoveProposal | null {
  if (!response || response.action !== 'ADJUST_MOVE' ||
      response.moveStatus === 'completed') return null;

  const move = response.proposedMove;
  if (!move || typeof move.title !== 'string' ||
      !Array.isArray(move.steps)) return null;
  const title = move.title.trim();
  const steps: string[] = (move.steps as unknown[])
    .filter((step: unknown): step is string =>
      typeof step === 'string' && !!step.trim())
    .map((step: string) => step.trim());
  const uniqueSteps: string[] = Array.from(new Set<string>(steps));
  if (!title || uniqueSteps.length === 0) return null;

  const rawMinutes = move.minutes;
  const minutes = typeof rawMinutes === 'number' &&
    Number.isFinite(rawMinutes) && rawMinutes > 0
    ? Math.round(rawMinutes)
    : null;
  return { title, steps: uniqueSteps, minutes };
}


const PROGRESS_TYPES: ProgressEntryType[] = ['result', 'learned', 'decision', 'blocker', 'note'];

const G = '#D8B24A';
function getNextMoveCompletionLabel(title?: string) {
  const text = (title ?? '').toLowerCase();

  if (text.includes('plan') && text.includes('workout')) return '✓ WORKOUT PLANNED';
  if (text.includes('run')) return '✓ RUN COMPLETE';
  if (text.includes('dinner')) return '✓ DINNER DONE';
  if (text.includes('call')) return '✓ CALL MADE';
  if (text.includes('apply') || text.includes('application')) return '✓ APPLICATION SENT';
  if (text.includes('read')) return '✓ READING DONE';
  if (text.includes('practice')) return '✓ PRACTICE COMPLETE';

  return '✓ COMPLETE NEXT MOVE';
}
export default function MilestoneWorkspace() {
  const [bleDevices, setBleDevices] = useState<ConnectedDevice[]>([]);
const [scanningBle, setScanningBle] = useState(false);
const [hasScannedBle, setHasScannedBle] = useState(false);
  const timerAlarm = useAudioPlayer(
  require('../../../assets/sounds/timer-alarm.wav')
);
  const params = useLocalSearchParams<{ milestoneId: string }>();
  const milestoneId = params.milestoneId;

  // data
  const [milestone, setMilestone] = useState<any>(null);
  const [nextMove, setNextMove] = useState<any>(null);
  const completionLabel = getNextMoveCompletionLabel(nextMove?.title);
  const [activitySession, setActivitySession] = useState<ActivitySession | null>(null);
  const activitySessionRef = useRef<ActivitySession | null>(null);
  const moveText = String(nextMove?.title ?? '').toLowerCase();
  
  const [progressEntries, setProgressEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // saving flags
  const [savingStep, setSavingStep] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [completing, setCompleting] = useState(false);

  // record progress form
  const [progressText, setProgressText] = useState('');
  const [progressType, setProgressType] = useState<ProgressEntryType>('note');
  // Progress is saved independently. A Coach review is always the user's choice.
  const [lastRecordedProgress, setLastRecordedProgress] = useState<{
    id: string;
    entry_type: ProgressEntryType;
    content: string;
  } | null>(null);
  const [reviewingProgress, setReviewingProgress] = useState(false);
  const [progressCoachMessage, setProgressCoachMessage] = useState<string | null>(null);
  const [reviewedMove, setReviewedMove] = useState<ReviewedMoveProposal | null>(null);
  const [canRequestAlternative, setCanRequestAlternative] = useState(false);
  const [approvingReviewedMove, setApprovingReviewedMove] = useState(false);
  const reviewedMoveSaveLock = useRef(false);

  // timer (uses an end time so it stays correct if the app is backgrounded)
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showAllTimerStages, setShowAllTimerStages] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState('10');
  const [timerSeconds, setTimerSeconds] = useState('0');
  const [endAt, setEndAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerDone, setTimerDone] = useState(false);
  const [guidedTimerStages, setGuidedTimerStages] = useState<TimerStage[]>([]);
const [guidedStageIndex, setGuidedStageIndex] = useState(0);
const handledTimerEndRef = useRef<number | null>(null);
  // Proactive Smart Tools guidance
const [showGuidance, setShowGuidance] = useState(false);
const [showExtraTools, setShowExtraTools] = useState(false);
const [showProgramSchedule, setShowProgramSchedule] = useState(false);
const [guidanceAnswer, setGuidanceAnswer] = useState('');
const [guidanceResponse, setGuidanceResponse] = useState('');
const [guidanceLoading, setGuidanceLoading] = useState(false);
// A requested full program is proposed first. No database writes before approval.
const [programDraft, setProgramDraft] = useState<GoalProgram | null>(null);
const [programResearchOptIn, setProgramResearchOptIn] = useState(false);
const [showProgramSources, setShowProgramSources] = useState(false);
const [expandedProgramPhase, setExpandedProgramPhase] = useState<number | null>(null);
const [selectedProgramMoves, setSelectedProgramMoves] = useState<string[]>([]);
const [programSaving, setProgramSaving] = useState(false);
const programSaveLock = useRef(false);


async function requestGuidance() {
  const request = guidanceAnswer.trim();
  if (!request || guidanceLoading) return;

  setGuidanceLoading(true);
  setGuidanceResponse('');
  setProgramDraft(null);
  setSelectedProgramMoves([]);
  try {
    // Explicit requests to BUILD a plan should return a structured program,
    // not the ordinary Coach response that only includes one proposed Move.
    const wantsProgram = /\b(build|create|make|design|develop|set up)\b.{0,65}\b(plan|program|routine|training schedule)\b/i.test(request)
      || /\b(plan|program)\b.{0,40}\b(around|for|based on)\b/i.test(request);
    if (wantsProgram && milestone?.goal_id) {
      const [parentRes, milestonesRes, storedSchedule] = await Promise.all([
        supabase.from('goals').select('title,is_practice').eq('id', milestone.goal_id).single(),
        supabase.from('milestones').select('title').eq('goal_id', milestone.goal_id).order('position'),
        AsyncStorage.getItem(`goal-schedule-${milestone.goal_id}`),
      ]);
      let schedule: any = null;
      if (storedSchedule) {
        try { schedule = JSON.parse(storedSchedule); }
        catch { console.warn('Could not read saved schedule for program proposal.'); }
      }
      const scheduleSummary = Array.isArray(schedule?.dayTimes)
        ? schedule.dayTimes.map((d: {day: number;times: string[]}) =>
            `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.day-1] ?? 'Day'}: ${d.times.join(', ')}`).join('; ')
        : 'Schedule not confirmed; suggest options without assigning a time';
      const proposal = await getGoalProgramProposal({
        goalTitle: parentRes.data?.title ?? milestone.title,
        goalKind: parentRes.data?.is_practice ? 'ongoing' : 'finite',
        currentMilestone: milestone.title,
        existingMilestones: (milestonesRes.data ?? []).map((m: {title: string}) => m.title),
        scheduleSummary,
        researchOptIn: programResearchOptIn,
        progressEntries: progressEntries.slice(0, 20).map((e: any) => ({
          entry_type: String(e.entry_type ?? 'note'),
          content: String(e.content ?? ''),
          created_at: e.created_at,
        })),
        userMessage: request,
      });
      if (!proposal) {
        setGuidanceResponse('The Coach could not build a usable program right now. You can try again or get guidance for a single Next Move.');
      } else {
        setProgramDraft(proposal);
        setSelectedProgramMoves(proposal.phases.flatMap((phase, phaseIndex) =>
          phase.moves.map((_, moveIndex) => `${phaseIndex}:${moveIndex}`)));
        setGuidanceResponse('Review the proposed phases and sessions below. Nothing changes until you approve.');
      }
      return;
    }

    const response = await getGoalCoachResponse({
      goalTitle: milestone?.title ?? '',
      nextMoveTitle: nextMove?.title ?? '',
      userMessage:
        `I need help figuring out my Next Move. ` +
        `Here is what I have available: ${request}. ` +
        `Please help me identify a practical next action.`,
    });

    setGuidanceResponse(response?.message ?? "I couldn't reach the coach. Please try again.");
  } catch (error) {
    console.error('Guidance request failed:', error);
    setGuidanceResponse("I couldn't reach the coach. Please try again.");
  } finally {
    setGuidanceLoading(false);
  }
}

async function approveProgram() {
  if (!programDraft || !milestone?.id || !milestone?.goal_id || programSaveLock.current) return;
  programSaveLock.current = true;
  setProgramSaving(true);
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw userError ?? new Error('Sign in before saving.');

    // Preserve existing milestones and completed/pending actions. For this
    // initial integration each phase adds ordered Next Moves inside the active
    // milestone, rather than silently rewriting an existing larger Path.
    const { data: existing, error: checkError } = await supabase
      .from('actions').select('title,position').eq('goal_id', milestone.goal_id);
    if (checkError) throw checkError;
    const existingTitles = new Set((existing ?? []).map((a: any) => String(a.title).trim().toLowerCase()));
    const proposals = programDraft.phases.flatMap((phase, phaseIndex) =>
      phase.moves.map((move, moveIndex) => ({
        title: `${phase.title}: ${move.title}`.slice(0, 240),
        steps: move.steps,
        estimated_minutes: move.minutes,
        phaseIndex, moveIndex,
      }))
    );
    const toAdd = proposals.filter((move) =>
      selectedProgramMoves.includes(`${move.phaseIndex}:${move.moveIndex}`) &&
      !existingTitles.has(move.title.trim().toLowerCase()));
    if (toAdd.length === 0) {
      setGuidanceResponse(selectedProgramMoves.length === 0
        ? 'Select at least one Next Move to include in your program.'
        : 'Those Next Moves are already in your Path. No duplicates were added.');
      if (selectedProgramMoves.length > 0) setProgramDraft(null);
      return;
    }
    const maxPosition = Math.max(-1, ...(existing ?? []).map((a: any) => Number(a.position ?? -1)));
    const rows = toAdd.map((move, index) => ({
      user_id: user.id,
      goal_id: milestone.goal_id,
      milestone_id: milestone.id,
      title: move.title,
      steps: move.steps,
      completed_steps: [],
      status: 'pending',
      type: 'task',
      position: maxPosition + 1 + index,
      estimated_minutes: move.estimated_minutes,
    }));
    // One Supabase insert request prevents partially-created programs.
    const { error: insertError } = await supabase.from('actions').insert(rows);
    if (insertError) throw insertError;

    // Keep the full structured proposal for future Journey visualization.
    // If history logging fails, the Next Moves are still usable.
    const { error: eventError } = await supabase.from('events').insert({
      user_id: user.id,
      object_id: milestone.goal_id,
      event_type: 'program_approved',
      metadata: { milestone_id: milestone.id, program: programDraft, addedMoves: rows.length },
    });
    if (eventError) console.warn('Plan sessions saved; could not log program history:', eventError.message);
    setProgramDraft(null);
    setGuidanceResponse(`${rows.length} new Next Moves have been added to this milestone. Your existing progress and milestones are unchanged. Complete the current move when appropriate, then work through the new sessions.`);
  } catch (err: any) {
    console.error('Could not apply program:', err);
    Alert.alert('Program not saved', err?.message ?? 'Try again.');
  } finally {
    programSaveLock.current = false;
    setProgramSaving(false);
  }
}

  useEffect(() => {
    if (!endAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
     if (left === 0) {
  if (handledTimerEndRef.current === endAt) return;
  handledTimerEndRef.current = endAt;

  if (advanceGuidedStage(endAt)) {
    return;
  }

  setEndAt(null);
  setTimerDone(true);
        if (Date.now() - endAt < 2000) {
  Vibration.vibrate(400);
  timerAlarm.seekTo(0);
  timerAlarm.play();
}
        void clearTimerState().catch((error) => {
  console.error('Could not clear completed timer:', error);
});
       const current = activitySessionRef.current;

if (current && current.status !== 'completed') {
 const completed = {
  ...stopActivitySession(current),
  metrics: {
    ...current.metrics,
    duration_seconds: current.startedAt
      ? Math.max(
          0,
          Math.round(
            (Date.now() - new Date(current.startedAt).getTime()) / 1000
          )
        )
      : 0,
  },
};

  activitySessionRef.current = completed;
  setActivitySession(completed);

  void saveActivitySession(completed).catch((error) => {
    console.error('Could not save completed activity:', error);
    Alert.alert(
      'Activity not saved',
      'Your timer finished, but the activity record could not be saved.'
    );
  });
}

  
        Vibration.vibrate([0, 400, 200, 400]);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endAt]);
useEffect(() => {
  const subscription = AppState.addEventListener(
    'change',
    (state) => {
      if (state === 'active' && endAt) {
        const remaining = Math.max(
          0,
          Math.ceil((endAt - Date.now()) / 1000)
        );

        setSecondsLeft(remaining);
      }
    }
  );

  return () => subscription.remove();
}, [endAt]);
useEffect(() => {
  let cancelled = false;

  async function recoverTimer() {
    try {
      const saved = await loadTimerState();

      if (cancelled || !saved) return;

      if (saved.session.milestoneId !== milestoneId) return;
      if (saved.session.status !== 'active') return;
const stages = saved.guidedTimerStages ?? [];
let recoveredIndex = saved.guidedStageIndex ?? 0;
let recoveredEndAt = saved.endAt;

while (
  recoveredIndex < stages.length - 1 &&
  recoveredEndAt <= Date.now()
) {
  recoveredIndex += 1;
  recoveredEndAt += stages[recoveredIndex].seconds * 1000;
}

if (recoveredIndex !== (saved.guidedStageIndex ?? 0)) {
  saved.endAt = recoveredEndAt;
  saved.guidedStageIndex = recoveredIndex;

  void saveTimerState(saved).catch((error) => {
    console.error('Could not save recovered guided stage:', error);
  });
}
      const remaining = Math.max(
        0,
        Math.ceil((saved.endAt - Date.now()) / 1000)
      );

      if (remaining === 0) {
  const finished = {
  ...stopActivitySession(
    saved.session,
    new Date(saved.endAt).toISOString()
  ),
  metrics: {
    ...saved.session.metrics,
    duration_seconds: saved.session.startedAt
      ? Math.max(
          0,
          Math.round(
            (saved.endAt -
              new Date(saved.session.startedAt).getTime()) / 1000
          )
        )
      : 0,
  },
};

  await saveActivitySession(finished);
  await clearTimerState();

  if (cancelled) return;

  activitySessionRef.current = finished;
  setActivitySession(finished);
  setSecondsLeft(0);
  setEndAt(null);
  setTimerDone(true);

  return;
}

      activitySessionRef.current = saved.session;
      setActivitySession(saved.session);
      setGuidedTimerStages(saved.guidedTimerStages ?? []);
      setGuidedStageIndex(saved.guidedStageIndex ?? 0);
      setSecondsLeft(remaining);
      setEndAt(saved.endAt);
      setTimerDone(false);
    } catch (error) {
      console.error('Could not recover timer:', error);
    }
  }

  void recoverTimer();

  return () => {
    cancelled = true;
  };
}, [milestoneId]);
  // load the milestone, its pending Next Move, and its progress entries
  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      if (!milestoneId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const { data: milestoneData, error: milestoneError } = await supabase
          .from('milestones')
          .select('*')
          .eq('id', milestoneId)
          .single();
        if (milestoneError) throw milestoneError;

        const { data: moveData, error: moveError } = await supabase
          .from('actions')
          .select('*')
          .eq('milestone_id', milestoneId)
          .eq('status', 'pending')
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (moveError) throw moveError;

        const { data: progressData, error: progressError } = await supabase
          .from('progress_entries')
          .select('*')
          .eq('milestone_id', milestoneId)
          .order('created_at', { ascending: false });
        if (progressError) console.error('Could not load progress entries:', progressError);

        if (cancelled) return;
        setMilestone(milestoneData);
        setNextMove(moveData);
        setProgressEntries(progressError ? [] : progressData ?? []);
      } catch (err: any) {
        console.error('Milestone workspace load error:', err);
        if (!cancelled) setError(err?.message ?? 'Could not load milestone workspace.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [milestoneId]);

  /* ---------- actions ---------- */

  async function toggleStep(step: string) {
    if (!nextMove || savingStep) return;

    const before: string[] = Array.isArray(nextMove.completed_steps) ? nextMove.completed_steps : [];
    const after = before.includes(step) ? before.filter((x) => x !== step) : [...before, step];

    setNextMove((m: any) => ({ ...m, completed_steps: after })); // update the screen immediately
    setSavingStep(true);

    const { error: saveError } = await supabase
      .from('actions')
      .update({ completed_steps: after })
      .eq('id', nextMove.id);

    setSavingStep(false);

    if (saveError) {
      console.error('Could not save completed step:', saveError);
      setNextMove((m: any) => ({ ...m, completed_steps: before })); // put it back
      Alert.alert('Could not save', 'That step was not saved. Please try again.');
    }
  }

  async function completeNextMove() {
    if (!nextMove || completing) return;
    setCompleting(true);
    try {
      await completeNextMoveEngine(nextMove.id);
      router.back();
    } catch (err: any) {
      console.error('Could not complete Next Move:', err);
      Alert.alert('Could not complete', err?.message || 'Please try again.');
      setCompleting(false);
    }
  }

  async function recordProgress() {
    const content = progressText.trim();
    if (!content || !milestone || savingProgress) return;

    setSavingProgress(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error('No signed-in user.');

      const { data, error: insertError } = await supabase
        .from('progress_entries')
        .insert({
          user_id: user.id,
          goal_id: milestone.goal_id,
          milestone_id: milestone.id,
          action_id: nextMove?.id ?? null,
          entry_type: progressType,
          content,
        })
        .select('*')
        .single();
      if (insertError) throw insertError;

      setProgressEntries((current) => [data, ...current]);
      setProgressText('');
      setLastRecordedProgress({ id: data.id, entry_type: progressType, content });
      setProgressCoachMessage(null);
      setReviewedMove(null);
      setCanRequestAlternative(false);
      // Recording is evidence; it does not automatically complete any action.
      // The optional Coach review below can help the user decide what to do next.
    } catch (err: any) {
      console.error('Could not record progress:', err);
      Alert.alert('Could not record', err?.message || 'Please try again.');
    } finally {
      setSavingProgress(false);
    }
  }

  async function reviewRecordedProgress(
    requestConcreteAlternative = false,
    existingEntry?: { id: string; entry_type: ProgressEntryType; content: string }
  ) {
    const reviewedEntry = existingEntry ?? lastRecordedProgress;
    if (!reviewedEntry || !milestone || reviewingProgress || !nextMove) return;

    // Re-review a saved entry without asking the user to record it twice.
    if (existingEntry) setLastRecordedProgress(existingEntry);
    setReviewingProgress(true);
    setProgressCoachMessage(null);
    setReviewedMove(null);
    setCanRequestAlternative(false);
    try {
      // The goal's name is different from the milestone's name.
      const { data: parentGoal } = await supabase
        .from('goals')
        .select('title')
        .eq('id', milestone.goal_id)
        .maybeSingle();

      const latestEntries = progressEntries.slice(0, 20).map((entry) => ({
        entry_type: String(entry.entry_type ?? 'note'),
        content: String(entry.content ?? ''),
        created_at: entry.created_at,
      }));

      const response = await getGoalCoachResponse({
        goalTitle: parentGoal?.title ?? milestone.title,
        nextMoveTitle: nextMove.title,
        nextMoveMinutes: nextMove.estimated_minutes ?? null,
        nextMoveSteps: Array.isArray(nextMove.steps) ? nextMove.steps : [],
        completedSteps: Array.isArray(nextMove.completed_steps)
          ? nextMove.completed_steps : [],
        milestones: [String(milestone.title)],
        progressEntries: latestEntries,
        userMessage:
          `Please review my newly recorded ${reviewedEntry.entry_type} for ` +
          `the milestone "${milestone.title}": "${reviewedEntry.content}". ` +
          (requestConcreteAlternative
            ? 'I explicitly want to REVIEW a specific alternative Next Move. ' +
              'If changing the Move is appropriate and safe, return action ADJUST_MOVE, ' +
              'moveStatus needs_adaptation, and a concrete proposedMove with a title, ' +
              'estimated minutes (or null), and actionable checklist steps. ' +
              'Avoid painful or unsafe activity. If no safe change can be proposed, ' +
              'explain why instead of inventing an activity. '
            : 'Consider whether the existing Next Move remains appropriate. ' +
              'If a change is actually needed, include a concrete proposedMove ' +
              'with a title, minutes (or null), and actionable steps; ' +
              'do not merely say that a plan could be adjusted. ') +
          'If pain or possible injury was reported, do not assume it has resolved ' +
          'or suggest an activity that could aggravate it; recommend appropriate ' +
          'human assessment when needed. ' +
          'Do not mark work complete or apply any change without my approval.',
      });

      setProgressCoachMessage(
        response?.message?.trim() ||
          "The Coach couldn't provide a suggestion right now. Your progress was saved."
      );
      const move = getReviewableMove(response);
      setReviewedMove(move);

      // A NOTE about pain may still signal a blocker. Offer a second,
      // explicit request if the first Coach call supplied only general advice.
      const concerningNote = /\b(pain|painful|hurting|hurt|injur|unable|couldn't|cannot|can't|stopped)\b/i
        .test(reviewedEntry.content);
      setCanRequestAlternative(Boolean(!move && response && (
        response.action === 'ADJUST_MOVE' ||
        response.moveStatus === 'needs_adaptation' ||
        reviewedEntry.entry_type === 'blocker' || concerningNote
      )));
    } catch (error) {
      console.error('Could not review recorded progress:', error);
      setProgressCoachMessage("The Coach couldn't connect right now. Your progress was saved.");
    } finally {
      setReviewingProgress(false);
    }
  }

  async function approveReviewedMove() {
    if (!reviewedMove || !nextMove || !milestone ||
        approvingReviewedMove || reviewedMoveSaveLock.current) return;

    // Don't change the workout underneath an active or paused timer.
    if (endAt !== null || secondsLeft > 0) {
      Alert.alert('Finish this timer first',
        'End the current timer before changing its associated Next Move.');
      return;
    }

    reviewedMoveSaveLock.current = true;
    setApprovingReviewedMove(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error('You must be signed in.');

      // Recheck the database: another device or screen may have changed the
      // action or its checked-off work since the Coach reviewed it.
      const { data: current, error: checkError } = await supabase
        .from('actions')
        .select('*')
        .eq('id', nextMove.id)
        .eq('user_id', user.id)
        .single();
      if (checkError || !current) throw checkError ?? new Error('Next Move not found.');
      if (current.status !== 'pending' || current.title !== nextMove.title ||
          JSON.stringify(current.steps ?? []) !== JSON.stringify(nextMove.steps ?? []) ||
          JSON.stringify(current.completed_steps ?? []) !==
          JSON.stringify(nextMove.completed_steps ?? [])) {
        throw new Error('This Next Move changed since the review. Reopen the workspace and request a fresh suggestion.');
      }

      // A snapshot of the old action is a prerequisite to replacement. Keep
      // the previous title, checklist, estimate, and completed work in Path
      // history even though the live action will use the new instructions.
      const { error: historyError } = await supabase.from('events').insert({
        user_id: user.id,
        object_id: milestone.goal_id,
        event_type: 'next_move_before_adaptation',
        metadata: {
          milestone_id: milestone.id,
          action_id: current.id,
          progress_entry_id: lastRecordedProgress?.id ?? null,
          original: {
            title: current.title,
            steps: current.steps ?? [],
            completed_steps: current.completed_steps ?? [],
            estimated_minutes: current.estimated_minutes ?? null,
          },
          approved_proposal: reviewedMove,
          saved_at: new Date().toISOString(),
        },
      });
      if (historyError) throw new Error(
        'The original Move could not be preserved in history. No changes were made: ' + historyError.message);

      // Keep completed steps as completed on the same action. They remain
      // visible in the checklist, followed by only the NEW actionable steps.
      const previouslyCompleted: string[] = Array.isArray(current.completed_steps)
        ? current.completed_steps.filter((step: unknown): step is string => typeof step === 'string')
        : [];
      const updatedSteps = Array.from(new Set([
        ...previouslyCompleted,
        ...reviewedMove.steps.filter((step) => !previouslyCompleted.includes(step)),
      ]));
      const { data: updated, error: saveError } = await supabase
        .from('actions')
        .update({
          title: reviewedMove.title,
          estimated_minutes: reviewedMove.minutes,
          steps: updatedSteps,
        })
        .eq('id', current.id)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .eq('title', current.title)
        .select('*')
        .maybeSingle();
      if (saveError || !updated) throw saveError ??
        new Error('The original Move changed before the update. Please reload.');

      // Record the approved change alongside ordinary milestone progress so
      // the user can see why the active Move is different. The pre-change
      // event above remains the complete immutable record of its old steps.
      const { data: decisionEntry, error: decisionError } = await supabase
        .from('progress_entries')
        .insert({
          user_id: user.id,
          goal_id: milestone.goal_id,
          milestone_id: milestone.id,
          action_id: current.id,
          entry_type: 'decision',
          content: `Approved a Next Move adjustment: "${current.title}" → "${updated.title}".`,
        })
        .select('*')
        .single();
      if (decisionError) {
        console.warn('Move updated, but the readable milestone history could not be added:', decisionError.message);
      } else if (decisionEntry) {
        setProgressEntries((entries) => [decisionEntry, ...entries]);
      }

      setNextMove(updated);
      setReviewedMove(null);
      setCanRequestAlternative(false);
      setShowTimerMenu(false);
      setShowAllTimerStages(false);
      setProgressCoachMessage(
        'Adjustment approved. Your updated Next Move and timer suggestions are ready above. ' +
        'The original instructions and completed work are preserved in your Path history. ' +
        'Your schedule and reminders have not changed.'
      );
    } catch (error: any) {
      console.error('Could not approve suggested Next Move:', error);
      Alert.alert('Next Move unchanged', error?.message ?? 'Please try again.');
    } finally {
      reviewedMoveSaveLock.current = false;
      setApprovingReviewedMove(false);
    }
  }

 function startTimer(
  suggestedSeconds?: number,
  guided?: { stages: TimerStage[]; stageIndex: number }
) {
  if (!guided?.stages?.length) {
  setGuidedTimerStages([]);
  setGuidedStageIndex(0);
}
  const minutes = Number(timerMinutes || 0);
const seconds = Number(timerSeconds || 0);
const totalSeconds = suggestedSeconds ?? (minutes * 60 + seconds);

if (
  !Number.isFinite(totalSeconds) ||
  totalSeconds <= 0 ||
  seconds < 0 ||
  seconds > 59
) return;
    if (nextMove && milestone) {
  const session: ActivitySession = {
    id: `${nextMove.id}-${Date.now()}`,
    goalId: milestone.goal_id,
    milestoneId: milestone.id,
    actionId: nextMove.id,
    status: 'ready',
    metrics: {},
  };

const startedSession = startActivitySession(session);
activitySessionRef.current = startedSession;
setActivitySession(startedSession);

void saveActivitySession(startedSession).catch((error) => {
  console.error('Could not save activity session:', error);
  Alert.alert(
    'Activity not saved',
    'Your timer is running, but the activity record could not be saved.'
  );
});}
    setTimerDone(false);
const finishTime = Date.now() + totalSeconds * 1000;
setEndAt(finishTime);
void cancelTimerNotifications()
  .then(async () => {
  if (guided?.stages && guided.stages.length > 1) {
    await scheduleGuidedTimerNotifications(
      guided.stages,
      finishTime
    );
  } else {
    await scheduleTimerNotification(finishTime);
  }
})
  .catch((error) => {
    console.error('Could not schedule timer notifications:', error);
  });

if (activitySessionRef.current) {
  void saveTimerState({
    endAt: finishTime,
    session: activitySessionRef.current,
      guidedTimerStages: guided?.stages,
  guidedStageIndex: guided?.stageIndex,
  }).catch((error) => {
    console.error('Could not preserve timer:', error);
    Alert.alert(
      'Timer recovery unavailable',
      'The timer is running, but it may not survive closing the app.'
    );
  });
}
    setShowTimerMenu(false);
  }
function startGuidedTimer(stages: TimerStage[]) {
  if (stages.length === 0) return;

  setGuidedTimerStages(stages);
  setGuidedStageIndex(0);
  setTimerDone(false);

 startTimer(stages[0].seconds, {
  stages,
  stageIndex: 0,
});
}
function advanceGuidedStage(stageEndAt: number): boolean {
  const nextIndex = guidedStageIndex + 1;
  const nextStage = guidedTimerStages[nextIndex];

  if (!nextStage) return false;

  const nextEndAt =
    stageEndAt + nextStage.seconds * 1000;

  setGuidedStageIndex(nextIndex);
  setSecondsLeft(
    Math.max(0, Math.ceil((nextEndAt - Date.now()) / 1000))
  );
  setTimerDone(false);
  setEndAt(nextEndAt);

  const session = activitySessionRef.current;

  if (session) {
    void saveTimerState({
      endAt: nextEndAt,
      session,
      guidedTimerStages,
      guidedStageIndex: nextIndex,
    }).catch((error) => {
      console.error('Could not save guided stage:', error);
    });
  }


  return true;
}
  function pauseTimer() {
   if (activitySession) {
  const completedSession = {
  ...activitySession,
  status: 'paused' as const,
};
activitySessionRef.current = completedSession;
  setActivitySession(completedSession);

  void saveActivitySession(completedSession).catch((error) => {
    console.error('Could not save completed activity:', error);
    Alert.alert(
      'Activity not saved',
      'Your activity ended, but its record could not be saved.'
    );
  });
}
    const remaining = endAt
  ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  : secondsLeft;

setSecondsLeft(remaining);
setEndAt(null);
void cancelTimerNotifications().catch((error) => {
  console.error('Could not cancel timer notification:', error);
});
setTimerDone(false);
    void clearTimerState().catch((error) => {
  console.error('Could not clear saved timer:', error);
});
  }
function dismissTimer() {
  setEndAt(null);
  setSecondsLeft(0);
  setTimerDone(false);
  setShowTimerMenu(false);

  void cancelTimerNotifications().catch((error) => {
    console.error('Could not cancel timer notification:', error);
  });

  void clearTimerState().catch((error) => {
    console.error('Could not clear dismissed timer:', error);
  });
const currentSession = activitySessionRef.current;

if (currentSession && currentSession.status !== 'completed') {
  const finishedSession = stopActivitySession(currentSession);

  void saveActivitySession(finishedSession).catch((error) => {
    console.error('Could not save ended activity:', error);
    Alert.alert(
      'Activity not saved',
      'The timer was closed, but the activity record could not be saved.'
    );
  });
}
  activitySessionRef.current = null;
  setActivitySession(null);
}
function resumeTimer() {
  if (secondsLeft <= 0) return;
if (activitySession) {
  const resumedSession = {
    ...activitySession,
    status: 'active' as const,
  };

  activitySessionRef.current = resumedSession;
  setActivitySession(resumedSession);
  void saveActivitySession(resumedSession).catch((error) => {
  console.error('Could not save resumed activity:', error);
});
}
  const finishTime = Date.now() + secondsLeft * 1000;

  setTimerDone(false);
  setEndAt(finishTime);
  void cancelTimerNotifications()
  .then(() => scheduleTimerNotification(finishTime))
  .catch((error) => {
    console.error('Could not schedule resumed timer notification:', error);
  });
  if (activitySessionRef.current) {
  void saveTimerState({
    endAt: finishTime,
    session: activitySessionRef.current,
  }).catch((error) => {
    console.error('Could not save resumed timer:', error);
  });
}}
const handleFindBluetoothTools = async () => {
  setScanningBle(true);

  try {
    const devices = await scanForBluetoothDevices();
    setBleDevices(devices);
    setHasScannedBle(true);
  } finally {
    setScanningBle(false);
  }
};

  /* ---------- states ---------- */

  if (loading) {
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <ActivityIndicator color={G} />
        <Text style={s.loadingText}>Loading workspace...</Text>
      </SafeAreaView>
    );
  }

  if (error || !milestone) {
    return (
      <SafeAreaView style={[s.page, { padding: 18 }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={s.backPlain}>← BACK</Text>
        </Pressable>
        <Text style={s.errTitle}>Workspace unavailable</Text>
        <Text style={s.errText}>{error ?? 'Milestone not found.'}</Text>
      </SafeAreaView>
    );
  }

  /* ---------- derived ---------- */

  const steps: string[] = Array.isArray(nextMove?.steps) ? nextMove.steps : [];
  const completedSteps: string[] = Array.isArray(nextMove?.completed_steps) ? nextMove.completed_steps : [];
  const toolSuggestions = analyzeMove({
  goalTitle: String(milestone?.goals?.title ?? ''),
  milestoneTitle: String(milestone?.title ?? ''),
  nextMoveTitle: String(nextMove?.title ?? ''),
  steps,
  availableDevices: [],
});
   const timerSuggestion = toolSuggestions.find(
  (tool) => tool.type === 'timer'
);
  const completedStepCount = steps.filter((step) => completedSteps.includes(step)).length;
  const moveProgress = steps.length > 0 ? Math.round((completedStepCount / steps.length) * 100) : 0;
  const canRecord = !!progressText.trim() && !savingProgress;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>← YOUR PATH</Text>
        </Pressable>

        <Text style={s.kicker}>MILESTONE WORKSPACE</Text>
        <Text style={s.title}>{milestone.title}</Text>
        {milestone.description ? <Text style={s.desc}>{milestone.description}</Text> : null}

        <View style={s.divider} />

        <Text style={s.label}>CURRENT NEXT MOVE</Text>

        {nextMove ? (
          <View style={s.card}>
            <Text style={s.moveTitle}>{nextMove.title}</Text>

            {nextMove.estimated_minutes ? <Text style={s.minutes}>{nextMove.estimated_minutes} MIN</Text> : null}

            {steps.length > 0 ? (
              <View style={{ marginTop: 16, marginBottom: 4 }}>
                <View style={s.progressHead}>
                  <Text style={s.progressLabel}>MOVE PROGRESS</Text>
                  <Text style={s.progressCount}>
                    {completedStepCount}/{steps.length} · {moveProgress}%
                  </Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${moveProgress}%` }]} />
                </View>
              </View>
            ) : null}

            {steps.length > 0 ? (
              <View style={{ marginTop: 18 }}>
                {steps.map((step, index) => {
                  const done = completedSteps.includes(step);
                  return (
                    <Pressable key={`${index}-${step}`} onPress={() => void toggleStep(step)} style={s.stepRow}>
                      <View style={[s.stepBox, done && { backgroundColor: G }]}>
                        {done ? <Text style={s.stepCheck}>✓</Text> : null}
                      </View>
                      <Text style={[s.stepText, done && s.stepTextDone]}>{step}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {(steps.length === 0 || moveProgress >= 100) && (
              <Pressable onPress={() => void completeNextMove()} disabled={completing} style={[s.completeBtn, completing && { opacity: 0.6 }]}>
<Text style={s.completeText}>
  {completing ? 'COMPLETING...' : completionLabel}
</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.emptyText}>No pending Next Move for this milestone.</Text>
          </View>
        )}

        {/* tools */}
        <View style={{ marginTop: 20, marginBottom: 12 }}>
          <Text style={s.toolsTitle}>YOUR NEXT MOVE TOOLS</Text>
          <Text style={{ color: '#AAAAAA', fontSize: 12, marginBottom: 12, lineHeight: 18 }}>Use what helps you take action. Everything else can stay out of the way.</Text>
          <Pressable onPress={() => setShowExtraTools((v) => !v)} style={{ marginBottom: 12, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'flex-start' }}>
            <Text style={{ color: '#D8B24A', fontWeight: '800', fontSize: 12 }}>{showExtraTools ? 'HIDE CONNECTED TOOLS ↑' : '+ CONNECTED TOOLS (OPTIONAL)'}</Text>
          </Pressable>
          {showExtraTools && (<>
          <Pressable
  onPress={handleFindBluetoothTools}
  disabled={scanningBle}
  style={s.timerToggle}
>
  <Text style={s.timerToggleText}>
    {scanningBle ? '◉ FINDING BLUETOOTH TOOLS...' : '◉ FIND BLUETOOTH TOOLS'}
  </Text>
</Pressable>
{hasScannedBle && !scanningBle && (
  bleDevices.length > 0 ? (
    <View style={{ marginTop: 8 }}>
      {bleDevices.map((device) => (
        <Text key={device.id} style={s.emptyText}>
          • {device.name}
        </Text>
      ))}
    </View>
  ) : (
   <Text style={s.bleStatus}>
  No Bluetooth tools found nearby.
</Text>
  )
)}
          </>)}
          {toolSuggestions.map((tool) =>
  tool.type === 'guidance' ? (
    <Pressable
      key={tool.id}
      onPress={() => setShowGuidance((current) => !current)}
      style={s.timerToggle}
    >
      <Text style={s.timerToggleText}>
        💡 {tool.label}
      </Text>
    </Pressable>
  ) : tool.type === 'timer' || !showExtraTools ? null : (
  <View key={tool.id} style={s.toolHint}>
    <Text style={s.toolHintText}>{tool.label}</Text>
  </View>
)
)}
{showGuidance && (
  <View style={{ marginBottom: 16, padding: 14, borderWidth: 1, borderColor: G, borderRadius: 12 }}>
    <Text style={{ color: G, fontWeight: 'bold', marginBottom: 8 }}>
      LET'S FIGURE OUT YOUR NEXT MOVE
    </Text>
    <Text style={{ color: '#FFFFFF', marginBottom: 8 }}>
      {nextMove?.title ?? 'What would you like to accomplish?'}
    </Text>
    <Text style={{ color: '#FFFFFF' }}>
      What would you like help planning or doing? What resources do you have?
    </Text>
    <TextInput
  value={guidanceAnswer}
  onChangeText={setGuidanceAnswer}
  placeholder="e.g., Build a Couch-to-5K plan, or tell me what you have..."
  placeholderTextColor="#888888"
  style={s.timerInput}
  multiline
/>
 <Pressable onPress={() => setProgramResearchOptIn((value) => !value)} style={{ flexDirection: 'row', gap: 8, paddingVertical: 10, alignItems: 'flex-start' }}>
   <Text style={{ color: programResearchOptIn ? G : '#999999' }}>{programResearchOptIn ? '☑' : '☐'}</Text>
   <Text style={{ color: '#9E9E9E', fontSize: 11, flex: 1, lineHeight: 16 }}>Optional public web research (sends only the goal title if a search service is connected; off by default)</Text>
 </Pressable>
<Pressable
  onPress={requestGuidance}
  disabled={guidanceLoading || !guidanceAnswer.trim()}
  style={[s.timerToggle, { marginTop: 12 }]}
>
  <Text style={s.timerToggleText}>
    {guidanceLoading ? 'COACH THINKING...' : 'GET GUIDANCE'}
  </Text>
</Pressable>

{guidanceResponse ? (
  <Text style={{ color: '#FFFFFF', marginTop: 12, lineHeight: 22 }}>
    {guidanceResponse}
  </Text>
) : null}
{programDraft ? (
  <View style={{ marginTop: 14, gap: 12 }}>
    <Text style={{ color: G, fontSize: 17, fontWeight: '900' }}>{programDraft.title}</Text>
    {programDraft.summary ? <Text style={{ color: '#D6D6D8', lineHeight: 21 }} numberOfLines={3}>{programDraft.summary}</Text> : null}
     {programDraft.scheduleAdvice && (
       <View style={{ borderWidth: 1, borderColor: '#655126', borderRadius: 12, padding: 12, backgroundColor: '#232015', gap: 6 }}>
         <Pressable onPress={() => setShowProgramSchedule((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
           <View style={{ flex: 1 }}>
             <Text style={{ color: G, fontSize: 11, fontWeight: '900' }}>OPTIONAL COACHING ON YOUR SCHEDULE</Text>
             <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13, marginTop: 4 }}>{programDraft.scheduleAdvice.headline}</Text>
           </View>
           <Text style={{ color: G }}>{showProgramSchedule ? '−' : '+'}</Text>
         </Pressable>
         {showProgramSchedule && (
           <View style={{ gap: 7, paddingTop: 6 }}>
             <Text style={{ color: '#CCCCCC', fontSize: 13, lineHeight: 19 }}>{programDraft.scheduleAdvice.explanation}</Text>
             {programDraft.scheduleAdvice.optionalChange ? <Text style={{ color: '#E2C06C', fontSize: 13 }}>{programDraft.scheduleAdvice.optionalChange}</Text> : null}
             <Text style={{ color: '#999999', fontSize: 11 }}>Your schedule remains unchanged until you choose to edit it.</Text>
           </View>
         )}
       </View>
     )}
     <Pressable onPress={() => setShowProgramSources((show) => !show)} style={{ paddingVertical: 9 }}>
       <Text style={{ color: G, fontWeight: '800', fontSize: 12 }}>{showProgramSources ? 'HIDE RESEARCH' : `WHY THIS PLAN? · ${(programDraft.sources ?? []).length} SOURCES`}</Text>
     </Pressable>
     {showProgramSources && (
       <View style={{ gap: 10, backgroundColor: '#191919', borderRadius: 10, padding: 12 }}>
         {(programDraft.sources ?? []).length ? programDraft.sources!.map((source, index) => (
           <View key={`${index}-${source.url}`} style={{ gap: 4 }}>
             <Text style={{ color: '#F0D06A', fontWeight: '800', fontSize: 12 }}>{source.organization} · {source.title}</Text>
             <Text style={{ color: '#C4C4C4', fontSize: 12, lineHeight: 17 }}>{source.note}</Text>
             <Pressable onPress={() => void Linking.openURL(source.url).catch(() => Alert.alert('Could not open source'))}>
               <Text style={{ color: '#A3BAD2', fontSize: 11, textDecorationLine: 'underline' }}>OPEN SOURCE ↗</Text>
             </Pressable>
             {source.origin === 'search' ? <Text style={{ color: '#929292', fontSize: 11 }}>Search result — review relevance.</Text> : null}
           </View>
         )) : <Text style={{ color: '#999999', fontSize: 12 }}>No external evidence found for this goal. Treat these as Coach suggestions.</Text>}
       </View>
     )}
    {programDraft.estimatedWeeks ? (
      <Text style={{ color: '#A5A5AA' }}>Suggested timeframe: approximately {programDraft.estimatedWeeks} weeks — adjustable</Text>
    ) : null}
    {programDraft.phases.map((phase, index) => (
      <View key={`${index}-${phase.title}`} style={{ borderWidth: 1, borderColor: '#5B4B2F', borderRadius: 15, padding: 14, gap: 8, backgroundColor: '#171510' }}>
        <Pressable onPress={() => setExpandedProgramPhase((current) => current === index ? null : index)} style={{ paddingVertical: 5 }}>
          <Text style={{ color: '#E4C477', fontWeight: '900', fontSize: 15 }}>{String(index + 1).padStart(2, '0')}  {phase.title}  {expandedProgramPhase === index ? '−' : '+'}</Text>
          <Text style={{ color: '#999999', marginTop: 3, fontSize: 12 }}>{phase.moves.length} proposed sessions · Tap to {expandedProgramPhase === index ? 'collapse' : 'review'}</Text>
        </Pressable>
        {expandedProgramPhase === index && (
        <>
        {phase.description ? <Text style={{ color: '#BBBBBB', marginTop: 4 }}>{phase.description}</Text> : null}
        {phase.moves.map((move, i) => {
          const moveKey = `${index}:${i}`;
          const selected = selectedProgramMoves.includes(moveKey);
          return (
            <Pressable key={`${i}-${move.title}`}
              onPress={() => setSelectedProgramMoves((current) => current.includes(moveKey)
                ? current.filter((key) => key !== moveKey) : [...current, moveKey])}
              style={{ marginTop: 8, paddingLeft: 8 }}>
              <Text style={{ color: selected ? G : '#BBBBBB', fontWeight: '800' }}>
                {selected ? '☑' : '☐'} {move.title}
              </Text>
              {move.steps.map((step, j) => (
                <Text key={`${j}-${step}`} style={{ color: '#B8B8BD', marginTop: 3, paddingLeft: 12 }}>– {step}</Text>
              ))}
            </Pressable>
          );
        })}
        </>
        )}
      </View>
    ))}
    <Text style={{ color: '#AAAAAA', fontSize: 12, lineHeight: 18 }}>
      Tap sessions to include or exclude them. Approval adds your selected sessions as sequential Next Moves in this milestone. Existing milestones, schedules and completed actions stay unchanged.
    </Text>
    <Pressable onPress={() => void approveProgram()} disabled={programSaving}
      style={{ backgroundColor: G, padding: 14, borderRadius: 12, alignItems: 'center', opacity: programSaving ? 0.6 : 1 }}>
      <Text style={{ color: '#0B0B0B', fontWeight: '900' }}>
        {programSaving ? 'SAVING PROGRAM...' : 'APPROVE & ADD PROGRAM TO PATH ✓'}
      </Text>
    </Pressable>
    <Pressable onPress={() => { setProgramDraft(null); setGuidanceResponse('No changes were made.'); }} disabled={programSaving}
      style={{ padding: 9, alignItems: 'center' }}>
      <Text style={{ color: '#A5A5AA' }}>NOT NOW</Text>
    </Pressable>
  </View>
) : null}
  </View>
)}
{(timerSuggestion?.timerStages?.length ?? 0) > 1 && (
  <View style={s.guidedTimerPreview}>
    <Text style={s.guidedTimerTitle}>
      GUIDED TIMER · {Math.floor((timerSuggestion?.suggestedSeconds ?? 0) / 60)}:{String((timerSuggestion?.suggestedSeconds ?? 0) % 60).padStart(2, '0')} TOTAL
    </Text>

    {(showAllTimerStages
      ? timerSuggestion!.timerStages!
      : timerSuggestion!.timerStages!.slice(0, 3)
    ).map((stage, index) => (
      <View key={`${stage.label}-${index}`} style={s.guidedTimerStage}>
        <Text style={s.guidedTimerStageName}>
          {index + 1}. {stage.label}
        </Text>

        <Text style={s.guidedTimerStageTime}>
          {stage.seconds >= 60
            ? `${Math.floor(stage.seconds / 60)}:${String(stage.seconds % 60).padStart(2, '0')}`
            : `${stage.seconds} SEC`}
        </Text>
      </View>
    ))}
    {(timerSuggestion?.timerStages?.length ?? 0) > 3 && (
      <Pressable
        onPress={() => setShowAllTimerStages((current) => !current)}
        style={{ marginTop: 10, paddingVertical: 10 }}
      >
        <Text style={{ color: G, fontWeight: '800', textAlign: 'center' }}>
          {showAllTimerStages ? 'SHOW LESS' : `VIEW ALL ${timerSuggestion!.timerStages!.length} STAGES`}
        </Text>
      </Pressable>
    )}
  </View>
)}
          <Pressable
  onPress={() => {
  const stages = timerSuggestion?.timerStages;

if (stages && stages.length > 1) {
  startGuidedTimer(stages);
  return;
}

  // A single clearly timed move should prefill the actual suggested length,
  // not leave the editor at its unrelated default of ten minutes.
  if (timerSuggestion?.suggestedSeconds && !showTimerMenu) {
    const seconds = Math.round(timerSuggestion.suggestedSeconds);
    setTimerMinutes(String(Math.floor(seconds / 60)));
    setTimerSeconds(String(seconds % 60));
  }
  setShowTimerMenu((c) => !c);
}}
  style={s.timerToggle}
>
  <Text style={s.timerToggleText}>
    {(timerSuggestion?.timerStages?.length ?? 0) > 1
  ? '▶ START GUIDED TIMER'
  : showTimerMenu
    ? 'CLOSE TIMER'
    : timerSuggestion
      ? '⏱ SET SUGGESTED TIMER'
      : 'SET TIMER'}
  </Text>
  
</Pressable>

          {showTimerMenu && (
            <View style={s.timerMenu}>
              <Text style={s.timerMenuLabel}>Timer duration (minutes)</Text>
              <TextInput
                value={timerMinutes}
                onChangeText={(v) => setTimerMinutes(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="#888888"
                style={s.timerInput}
              />
              <Text style={s.timerMenuLabel}>Seconds (0–59)</Text>
<TextInput
  value={timerSeconds}
  onChangeText={(v) =>
    setTimerSeconds(v.replace(/[^0-9]/g, ''))
  }
  keyboardType="number-pad"
  placeholder="0"
  placeholderTextColor="#888888"
  style={s.timerInput}
/>
             <Pressable onPress={() => startTimer()} style={s.startBtn}>
                <Text style={s.startText}>START TIMER</Text>
              </Pressable>
            </View>
          )}
        </View>

       {(endAt !== null || timerDone || secondsLeft > 0) && (
          <View style={s.timerCard}>
            {timerDone ? (
              <Text style={s.timerDone}>Time's up.</Text>
            ) : (
              <Text style={s.timerClock}>{`${mm}:${ss}`}</Text>
            )}
            <Pressable
  onPress={
  timerDone
    ? dismissTimer
    : endAt !== null
    ? pauseTimer
    : resumeTimer
}
  hitSlop={10}
  style={{ marginTop: 10 }}
>
  <Text style={s.timerPause}>
    {timerDone ? 'DISMISS' : endAt !== null ? 'PAUSE' : 'RESUME'}
  </Text>
</Pressable>
{!timerDone && (
  <Pressable
    onPress={dismissTimer}
    hitSlop={10}
    style={{ marginTop: 12, alignItems: 'center', padding: 12 }}
  >
    <Text style={s.timerPause}>END TIMER</Text>
  </Pressable>
)}
          </View>
        )}

        {/* record progress */}
        <View style={s.recordCard}>
          <Text style={s.recordTitle}>RECORD PROGRESS</Text>
          <Text style={s.recordHelp}>What happened? What did you learn or discover?</Text>

          <View style={s.chips}>
            {PROGRESS_TYPES.map((type) => {
              const selected = progressType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setProgressType(type)}
                  style={[s.chip, selected && { borderColor: G, backgroundColor: G }]}
                >
                  <Text style={[s.chipText, selected && { color: '#0B0B0B' }]}>{type.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={progressText}
            onChangeText={setProgressText}
            placeholder="Record a result, observation, decision, or lesson..."
            placeholderTextColor="#666666"
            multiline
            style={s.recordInput}
          />

          <Pressable onPress={() => void recordProgress()} disabled={!canRecord} style={[s.recordBtn, canRecord && { backgroundColor: G }]}>
            <Text style={[s.recordBtnText, canRecord && { color: '#0B0B0B' }]}>
              {savingProgress ? 'SAVING...' : 'RECORD PROGRESS'}
            </Text>
          </Pressable>
        </View>

        {lastRecordedProgress ? (
          <View style={s.progressCoachCard}>
            <Text style={s.progressCoachKicker}>PROGRESS SAVED ✓</Text>
            <Text style={s.progressCoachText}>
              {lastRecordedProgress.entry_type === 'blocker'
                ? 'You recorded a blocker. Want the Coach to suggest a way forward?'
                : 'Your progress is in this milestone history. Want the Coach to suggest what comes next?'}
            </Text>
            <Pressable
              onPress={() => void reviewRecordedProgress()}
              disabled={reviewingProgress}
              style={s.progressCoachAction}
            >
              <Text style={s.progressCoachActionText}>
                {reviewingProgress ? 'COACH THINKING...' : 'ASK COACH TO REVIEW →'}
              </Text>
            </Pressable>
            {progressCoachMessage ? (
              <>
                <Text style={[s.progressCoachText, { color: '#FFFFFF', marginTop: 10 }]}>
                  {progressCoachMessage}
                </Text>
                <Text style={s.progressCoachHint}>
                  Nothing was marked complete or changed automatically.
                </Text>
                {reviewedMove && nextMove ? (
                  <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#49402A', paddingTop: 12 }}>
                    <Text style={s.progressCoachKicker}>PROPOSED NEXT MOVE · REVIEW FIRST</Text>
                    <Text style={[s.progressCoachText, { color: '#FFFFFF', fontWeight: '800' }]}>
                      {reviewedMove.title}
                    </Text>
                    {reviewedMove.minutes ? (
                      <Text style={s.progressCoachHint}>Suggested: about {reviewedMove.minutes} minutes</Text>
                    ) : null}
                    {reviewedMove.steps.map((step, index) => (
                      <Text key={`${index}-${step}`} style={s.progressCoachText}>
                        {index + 1}. {step}
                      </Text>
                    ))}
                    <Text style={[s.progressCoachHint, { marginTop: 10 }]}>
                      Approval updates only the current pending Move. Completed work and the
                      original instructions are preserved; your existing schedule is untouched.
                    </Text>
                    <Pressable
                      onPress={() => void approveReviewedMove()}
                      disabled={approvingReviewedMove}
                      style={[s.startBtn, { opacity: approvingReviewedMove ? 0.6 : 1 }]}
                    >
                      <Text style={s.startText}>
                        {approvingReviewedMove ? 'SAVING ADJUSTMENT...' : 'APPROVE NEW NEXT MOVE ✓'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setReviewedMove(null);
                        setCanRequestAlternative(false);
                        setProgressCoachMessage('Your current Next Move is unchanged.');
                      }}
                      disabled={approvingReviewedMove}
                      style={[s.timerToggle, { marginTop: 10 }]}
                    >
                      <Text style={s.timerToggleText}>KEEP CURRENT MOVE</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setReviewedMove(null)}
                      disabled={approvingReviewedMove}
                      style={{ alignItems: 'center', paddingVertical: 10 }}
                    >
                      <Text style={s.progressCoachHint}>NOT NOW</Text>
                    </Pressable>
                  </View>
                ) : canRequestAlternative && nextMove ? (
                  <Pressable
                    onPress={() => void reviewRecordedProgress(true)}
                    disabled={reviewingProgress}
                    style={[s.timerToggle, { marginTop: 12 }]}
                  >
                    <Text style={s.timerToggleText}>SUGGEST A SPECIFIC ALTERNATIVE →</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {progressEntries.length > 0 ? (
          <View style={{ marginTop: 24 }}>
            <Text style={s.recordedLabel}>RECORDED</Text>
            {progressEntries.map((entry, index) => (
              <View key={entry.id} style={s.entry}>
                <Text style={s.entryType}>{(entry.entry_type ?? 'note').toUpperCase()}</Text>
                <Text style={s.entryContent}>{entry.content}</Text>
                <Text style={s.entryDate}>{new Date(entry.created_at).toLocaleString()}</Text>
                {index === 0 && !lastRecordedProgress && nextMove ? (
                  <Pressable
                    onPress={() => void reviewRecordedProgress(false, {
                      id: String(entry.id),
                      entry_type: PROGRESS_TYPES.includes(entry.entry_type as ProgressEntryType)
                        ? entry.entry_type as ProgressEntryType : 'note',
                      content: String(entry.content ?? ''),
                    })}
                    disabled={reviewingProgress}
                    style={{ marginTop: 9, paddingVertical: 8 }}
                  >
                    <Text style={s.progressCoachActionText}>
                      {reviewingProgress ? 'COACH THINKING...' : 'REVIEW THIS SAVED ENTRY →'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0B0B' },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 18, paddingBottom: 40 },
  loadingText: { color: '#8E8E93', marginTop: 12 },
  backPlain: { color: G, fontWeight: '900' },
  errTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 30 },
  errText: { color: '#8E8E93', marginTop: 10 },
  back: { marginTop: 24, marginBottom: 22, paddingVertical: 12, paddingHorizontal: 8, alignSelf: 'flex-start' },
  backText: { color: G, fontWeight: '900' },
  kicker: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', lineHeight: 31, marginTop: 10 },
  desc: { color: '#A5A5AA', fontSize: 15, lineHeight: 22, marginTop: 12 },
  divider: { height: 1, backgroundColor: '#302B20', marginVertical: 24 },
  label: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginBottom: 10 },
  card: { backgroundColor: '#111111', borderWidth: 1, borderColor: '#3A321F', borderRadius: 16, padding: 16 },
  moveTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', lineHeight: 24 },
  minutes: { color: G, fontSize: 12, fontWeight: '800', marginTop: 7 },
  emptyText: { color: '#FFFFFF', fontWeight: '800' },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  progressLabel: { color: '#8E8E93', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  progressCount: { color: G, fontSize: 12, fontWeight: '900' },
  track: { height: 6, backgroundColor: '#292929', borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: G, borderRadius: 999 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  stepBox: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: G, marginRight: 10, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  stepCheck: { color: '#0B0B0B', fontSize: 12, fontWeight: '900' },
  stepText: { flex: 1, color: '#D6D6D8', fontSize: 15, lineHeight: 21 },
  stepTextDone: { color: '#8E8E93', textDecorationLine: 'line-through' },
  completeBtn: { marginTop: 10, minHeight: 52, borderRadius: 12, backgroundColor: G, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  completeText: { color: '#0B0B0B', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  toolsTitle: {
  color: G,
  fontSize: 13,
  fontWeight: '900',
  letterSpacing: 1.4,
  marginBottom: 10,
},
toolHint: {
  marginTop: -2,
  marginBottom: 12,
  paddingHorizontal: 4,
},

toolHintText: {
  color: '#8E8E93',
  fontSize: 12,
  lineHeight: 17,
  fontWeight: '600',
},
bleStatus: {
  color: '#8E8E93',
  fontSize: 12,
  lineHeight: 17,
  marginTop: 2,
  marginBottom: 12,
  paddingHorizontal: 4,
},
guidedTimerPreview: {
  backgroundColor: '#111111',
  borderWidth: 1,
  borderColor: '#3A321F',
  borderRadius: 12,
  padding: 14,
  marginBottom: 10,
},

guidedTimerTitle: {
  color: G,
  fontSize: 12,
  fontWeight: '900',
  letterSpacing: 1.2,
  marginBottom: 10,
},

guidedTimerStage: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: 6,
},

guidedTimerStageName: {
  flex: 1,
  color: '#D6D6D8',
  fontSize: 14,
  lineHeight: 19,
},

guidedTimerStageTime: {
  color: G,
  fontSize: 12,
  fontWeight: '900',
  marginLeft: 12,
},
timerToggle: {
  borderWidth: 1,
  borderColor: '#4A4025',
  backgroundColor: '#111111',
  borderRadius: 12,
  paddingVertical: 13,
  paddingHorizontal: 14,
  marginBottom: 8,
},

timerToggleText: {
  color: G,
  fontSize: 12,
  fontWeight: '900',
  letterSpacing: 0.7,
  textAlign: 'center',
},
  timerMenu: { marginBottom: 16, padding: 16, backgroundColor: '#111111', borderRadius: 12 },
  timerMenuLabel: { color: '#FFFFFF', marginBottom: 10 },
  timerInput: { color: '#FFFFFF', borderWidth: 1, borderColor: G, borderRadius: 8, padding: 12 },
  startBtn: { backgroundColor: G, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  startText: { color: '#0B0B0B', fontWeight: '900' },
  timerCard: { backgroundColor: '#111111', borderWidth: 1, borderColor: G, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  timerClock: { color: G, fontSize: 32, fontWeight: '900' },
  timerDone: { color: G, fontSize: 24, fontWeight: '900' },
  timerPause: { color: '#8E8E93', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  progressCoachCard: { marginTop: 12, borderWidth: 1, borderColor: '#49402A', borderRadius: 14, padding: 14, backgroundColor: '#141310' },
   progressCoachKicker: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
   progressCoachText: { color: '#C9C9C9', fontSize: 14, lineHeight: 21, marginTop: 7 },
   progressCoachAction: { alignSelf: 'flex-start', paddingVertical: 12, paddingRight: 12, marginTop: 3 },
   progressCoachActionText: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
   progressCoachHint: { color: '#8E8E93', fontSize: 12, lineHeight: 17, marginTop: 8 },
   recordCard: { marginTop: 22, borderWidth: 1, borderColor: '#3A321F', borderRadius: 16, padding: 16, backgroundColor: '#111111' },
  recordTitle: { color: G, fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  recordHelp: { color: '#8E8E93', fontSize: 13, lineHeight: 19, marginTop: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#3A3426', backgroundColor: '#111111' },
  chipText: { color: '#A5A5AA', fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  recordInput: { marginTop: 14, minHeight: 100, borderWidth: 1, borderColor: '#3A3426', borderRadius: 12, padding: 12, color: '#FFFFFF', fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  recordBtn: { marginTop: 12, backgroundColor: '#393939', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  recordBtnText: { color: '#777777', fontWeight: '900', letterSpacing: 1 },
  recordedLabel: { color: '#8E8E93', fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginBottom: 10 },
  entry: { borderLeftWidth: 2, borderLeftColor: G, paddingLeft: 12, marginBottom: 18 },
  entryType: { color: G, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  entryContent: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  entryDate: { color: '#666666', fontSize: 11, marginTop: 6 },
});
