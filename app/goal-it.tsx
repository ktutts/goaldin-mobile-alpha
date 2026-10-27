import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import GoalTimePicker from '@/components/GoalTimePicker';
import { supabase } from '@/lib/supabase';
import GoalItButton from '@/components/GOALITBUTTON';
import {
  buildMilestoneDrafts,
  classifyGoal,
} from '@/lib/goalPlanner';
import { getAIPlan, getWhySuggestions } from '@/lib/aiPlanner';
import { getSuggestedSchedule } from '@/lib/suggestedSchedule';
type ActionDraft = [string, number];
type GoalTimingKind = 'undecided' | 'finish-line' | 'ongoing';
type RunningExperience = 'unsure' | 'starting' | 'some' | 'regular';

// Time-only pickers start at a predictable, editable 12:00 AM rather than
// the current hour/minute. Previously saved times are never changed.
function defaultTimePickerDate(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function suggestGoalTiming(title: string): 'finish-line' | 'ongoing' | null {
  const text = title.toLowerCase();
  if (/\b(every|daily|weekly|monthly|habit|routine|consistently)\b/.test(text)) return 'ongoing';
  if (/\b(5\s?k|10\s?k|half marathon|marathon|race|finish|complete|launch|graduate|certification|exam|deadline)\b/.test(text)) return 'finish-line';
  return null;
}

function isRunningTrainingGoal(title: string): boolean {
  const text = title.toLowerCase();
  if (/\b(5\s?k|10\s?k|half marathon|marathon|running|runner|jogging|jog)\b/.test(text)) return true;
  // "Run a business" is not a running-training goal.
  return /\brun\b(?!\s+(?:a\s+|my\s+|the\s+)?(?:business|company|store|shop|restaurant|website|app|organization|campaign|project)\b)/.test(text);
}

function localDateISO(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function describeSchedule(
  type: 'once' | 'repeat' | null,
  days: { day: number; times: string[] }[],
  typedSchedule: string
): string | null {
  if (type === 'repeat' && days.length > 0) {
    const chosen = days
      .map(({ day, times }) => `${WEEKDAYS[day - 1] ?? 'Unknown day'}${times.length ? ` at ${times.join(', ')}` : ' (time not set)'}`)
      .join('; ');
    return `Repeating on ${chosen}`;
  }
  if (type === 'once' && typedSchedule.trim()) return `One-time action: ${typedSchedule.trim()}`;
  if (typedSchedule.trim()) return `User-entered timing: ${typedSchedule.trim()}`;
  return null;
}

function draftActions(title: string): ActionDraft[] {
  const t = title.toLowerCase();

  if (
    t.includes('shape') ||
    t.includes('fitness') ||
    t.includes('workout') ||
    t.includes('exercise') ||
    t.includes('lose weight') ||
    t.includes('lose fat') ||
    t.includes('build muscle') ||
    t.includes('get stronger')
  ) {
    return [
      ['Choose what "in shape" means for you', 5],
      ['Pick 3 days this week to move', 5],
      ['Do a 20-minute workout or brisk walk', 20],
    ];
  }

  if (t.includes('run') || t.includes('5k') || t.includes('10k') || t.includes('marathon')) {
    return [
      ['Choose your target distance and date', 5],
      ['Pick 3 training days this week', 5],
      ['Complete an easy first run', 20],
    ];
  }

  if (t.includes('clean') || t.includes('garage') || t.includes('organize') || t.includes('declutter')) {
    return [
      ['Choose one small area to start with', 2],
      ['Remove obvious trash and donations', 10],
      ['Organize only what remains', 20],
    ];
  }

  if (t.includes('cake') || t.includes('cook') || t.includes('bake') || t.includes('dinner') || t.includes('meal')) {
    return [
      ['Choose what you are making', 5],
      ['Check what ingredients you already have', 5],
      ['Get the missing ingredients', 20],
    ];
  }

  if (
    t.includes('save') ||
    t.includes('money') ||
    t.includes('debt') ||
    t.includes('budget') ||
    t.includes('pay off')
  ) {
    return [
      ['Choose the exact dollar target', 5],
      ['Choose the date you want to reach it', 5],
      ['Find one expense or income change to start', 10],
    ];
  }

  if (
    t.includes('learn') ||
    t.includes('study') ||
    t.includes('course') ||
    t.includes('class') ||
    t.includes('practice')
  ) {
    return [
      ['Define what you want to be able to do', 5],
      ['Choose one learning resource', 10],
      ['Schedule your first 20-minute practice session', 5],
    ];
  }

  if (
    t.includes('business') ||
    t.includes('start a company') ||
    t.includes('launch') ||
    t.includes('website') ||
    t.includes('app') ||
    t.includes('project')
  ) {
    return [
      ['Define the result you want to create', 10],
      ['Choose the first milestone', 10],
      ['Complete one task that moves that milestone forward', 20],
    ];
  }

  if (
    t.includes('birthday') ||
    t.includes('party') ||
    t.includes('trip') ||
    t.includes('vacation') ||
    t.includes('wedding') ||
    t.includes('event')
  ) {
    return [
      ['Confirm the date', 2],
      ['List what must be ready before that date', 10],
      ['Choose the first thing to handle today', 10],
    ];
  }

  return [
    ['Define what finished looks like', 5],
    ['Choose the smallest useful first move', 10],
    ['Do that first move', 20],
  ];
}

const getNotifications = async () => {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
};

export default function GoalIt() {
  const { buildFromGoal, parentGoalId, continueAsPractice } = useLocalSearchParams<{
    buildFromGoal?: string;
    parentGoalId?: string;
    continueAsPractice?: string;
  }>();

  const isBuildingFromGoal = Boolean(parentGoalId);
  const isContinuingPractice = continueAsPractice === 'true';

  // goal
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [deadline, setDeadline] = useState('');
  const [step, setStep] = useState<'goal' | 'outcome' | 'deadline' | 'why' | 'clarification'>('goal');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // why
  const [why, setWhy] = useState('');
  const [whyReasons, setWhyReasons] = useState<string[]>([]);
  const [whySuggestions, setWhySuggestions] = useState<string[]>([]);
  const [whySuggestionsLoading, setWhySuggestionsLoading] = useState(false);
  // Keep barriers available for the separate, optional planning experience.
  const [whyBarriers, setWhyBarriers] = useState<string[]>([]);

  // clarification
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [clarificationOptions, setClarificationOptions] = useState<string[]>([]);
  const clarificationRef = useState<{ question: string | null; answer: string }>({
    question: null,
    answer: '',
  })[0];

  // schedule
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showGoalIdeas, setShowGoalIdeas] = useState(false);
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
  const [scheduleType, setScheduleType] = useState<'once' | 'repeat' | null>(null);
  const [scheduleDays, setScheduleDays] = useState<{ day: number; times: string[] }[]>([]);
  const [activeScheduleDay, setActiveScheduleDay] = useState<number | null>(null);
  const [oneTimeDate, setOneTimeDate] = useState<Date | null>(null);
  const [pendingTime, setPendingTime] = useState<Date>(defaultTimePickerDate);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // WHEN: a finish line is distinct from the days reserved for taking action.
  const [goalTimingKind, setGoalTimingKind] = useState<GoalTimingKind>('undecided');
  const [goalTargetDate, setGoalTargetDate] = useState<Date | null>(null);
  const [showGoalTargetPicker, setShowGoalTargetPicker] = useState(false);
  const [eventName, setEventName] = useState('');
  const [runningExperience, setRunningExperience] = useState<RunningExperience>('unsure');
  const [wantsBeginnerPlan, setWantsBeginnerPlan] = useState(false);

  // speech
  const [speechTarget, setSpeechTarget] = useState<'title' | 'why'>('title');
  const whySpeechBaseRef = useRef('');

  useEffect(() => {
    if (buildFromGoal) setTitle(buildFromGoal);
  }, [buildFromGoal]);

  useSpeechRecognitionEvent('result', (event) => {
    const spokenText = event.results[0]?.transcript;
    if (!spokenText) return;
    if (speechTarget === 'why') {
      const existing = whySpeechBaseRef.current;
      setWhy(existing ? `${existing} ${spokenText}` : spokenText);
    } else {
      setTitle(spokenText);
    }
  });

  const startListening = async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone permission needed', 'Allow microphone access to speak your goal.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  };

  const whyFollowUpQuestion =
    whyReasons.length === 0
      ? ''
      : whyReasons.length > 1
        ? 'You chose a few reasons. Which one matters most to you right now?'
        : 'What makes that reason important to you?';

  const hasWhy = why.trim().length > 0 || whyReasons.length > 0;
  const timingHint = suggestGoalTiming(title);
  const runningGoal = isRunningTrainingGoal(title);
  const showTargetDate = goalTimingKind === 'finish-line' || (goalTimingKind === 'undecided' && timingHint === 'finish-line');

  function toggleScheduleDay(day: number) {
    setScheduleDays((current) => {
      const exists = current.some((item) => item.day === day);
      if (exists) return current.filter((item) => item.day !== day);
      return [...current, { day, times: [] }].sort((a, b) => a.day - b.day);
    });
  }

  function addTimeToDay(day: number, time: Date) {
    const timeString =
      `${String(time.getHours()).padStart(2, '0')}:` + `${String(time.getMinutes()).padStart(2, '0')}`;

    setScheduleDays((current) =>
      current.map((item) =>
        item.day === day && !item.times.includes(timeString)
          ? { ...item, times: [...item.times, timeString].sort() }
          : item
      )
    );
  }

  function removeTimeFromDay(day: number, time: string) {
    setScheduleDays((current) =>
      current.map((item) => (item.day === day ? { ...item, times: item.times.filter((t) => t !== time) } : item))
    );
  }

  function formatScheduleTime(time: string) {
    const [hourString, minute] = time.split(':');
    let hour = Number(hourString);
    const amPm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${amPm}`;
  }

  async function create() {
    if (saving) return;

    const cleanTitle = title.trim();
    const cleanOutcome = outcome.trim();
    const cleanWhy = [
      whyReasons.length ? `Why this matters: ${whyReasons.join('; ')}` : '',
      whyBarriers.length ? `Possible barriers: ${whyBarriers.join('; ')}` : '',
      why.trim() ? `User note: ${why.trim()}` : '',
      clarificationRef.answer.trim()
        ? `Additional clarification (${clarificationRef.question ?? 'Goal details'}): ${clarificationRef.answer.trim()}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (!cleanTitle) {
      Alert.alert('Add a goal', "Tell GOAL'D IN what you want to accomplish.");
      return;
    }

    // Dates are finish lines. Repeating days are the user's availability, not a finish date.
    const targetDate = showTargetDate && goalTargetDate
      ? localDateISO(goalTargetDate)
      : null;
    const scheduleSummary = describeSchedule(scheduleType, scheduleDays, deadline);
    const whenContext = [
      'WHEN CONTEXT — user choices (do not treat suggestions as facts):',
      `Goal type: ${goalTimingKind === 'undecided' ? 'Not confirmed; infer from the goal' : goalTimingKind}`,
      `Target finish/event date: ${targetDate ?? 'Not selected'}`,
      `Chosen work schedule: ${scheduleSummary ?? 'Not selected'}`,
      `Named event: ${showTargetDate ? eventName.trim() || 'None provided' : 'None provided'}`,
      ...(runningGoal ? [
        `Running experience: ${runningExperience === 'unsure' ? 'Not provided' : runningExperience}`,
        `Interested in a gradual beginner plan: ${wantsBeginnerPlan ? 'Yes' : 'Not specified'}`,
      ] : []),
      'Planning rules: Respect any days the user already chose. Never ask them to choose those days again.',
      'Do not assume they can add training days. Offer realistic adjustments as options, especially if preparing for a race.',
      'A repeating activity schedule is not a target completion date. Do not invent event listings or dates.',
      'For ongoing practices emphasize consistency, not a false 100% completion. If crucial details are missing, ask at most one useful question.',
    ].join('\n');

    setSaving(true);

    // The WHEN context travels with the existing WHY field until every backend
    // entry point is confirmed to forward the separately provided schedule.
    // The original user's WHY remains separately available in cleanWhy.
    const planningContext = [cleanWhy, whenContext].filter(Boolean).join('\n\n');
    const planDeadline = targetDate;
    const aiPlan = await getAIPlan({
      title: cleanTitle,
      outcome: cleanOutcome || null,
      why: planningContext || null,
      deadline: planDeadline,
      schedule: scheduleSummary,
    });

    if (!clarificationRef.question && aiPlan?.needsClarification && aiPlan.clarificationQuestion) {
      clarificationRef.question = aiPlan.clarificationQuestion;
      setClarificationQuestion(aiPlan.clarificationQuestion);
      setClarificationOptions(aiPlan.clarificationOptions ?? []);
      setClarificationAnswer('');
      setStep('clarification');
      setSaving(false);
      return;
    }

    const classification = aiPlan
      ? { horizon: aiPlan.horizon, planningMode: aiPlan.planningMode }
      : classifyGoal({ title: `${cleanTitle} ${cleanOutcome}`, deadline: planDeadline });

    const milestoneDrafts = aiPlan?.milestones?.length
      ? aiPlan.milestones
      : buildMilestoneDrafts({
          title: cleanTitle,
          outcome: cleanOutcome,
          why: planningContext,
          deadline: planDeadline,
          horizon: classification.horizon,
          planningMode: classification.planningMode,
        });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      Alert.alert('Sign in required', 'Please sign in and try again.');
      return;
    }

    const { data: goal, error } = await supabase
      .from('goals')
      .insert({
        user_id: user.id,
        title: cleanTitle,
        status: 'active',
        parent_goal_id: parentGoalId ?? null,
        // ongoing practices are flagged so Today and the Coach treat them as practices
        is_practice: isContinuingPractice || goalTimingKind === 'ongoing',
      })
      .select()
      .single();

    if (error || !goal) {
      setSaving(false);
      Alert.alert('Could not create goal', error?.message);
      return;
    }

    const milestoneRows = milestoneDrafts.map((milestone, index) => ({
      user_id: user.id,
      goal_id: goal.id,
      title: milestone.title,
      description: milestone.description ?? null,
      weight: Math.max(1, Math.min(100, Math.round(Number(milestone.weight)) || 1)),
      position: index,
      status: index === 0 ? 'active' : 'pending',
    }));

    const { data: createdMilestones, error: milestoneError } = await supabase
      .from('milestones')
      .insert(milestoneRows)
      .select('id, position, title, description');

    if (milestoneError) {
      setSaving(false);
      Alert.alert('Could not build milestones', milestoneError.message);
      return;
    }

    const firstMove =
      aiPlan?.firstMove ??
      (() => {
        const fallback = draftActions(cleanTitle)[0];
        return fallback
          ? { title: fallback[0], estimatedMinutes: fallback[1], steps: [] }
          : { title: `Take the first useful step toward ${cleanTitle}`, estimatedMinutes: 15, steps: [] };
      })();

    const orderedMilestones = [...(createdMilestones ?? [])].sort((a, b) => a.position - b.position);

    const acts = orderedMilestones.map((createdMilestone, index) => {
      const milestoneDraft = milestoneDrafts[createdMilestone.position];
      const plannedMove = index === 0 ? firstMove : milestoneDraft?.nextMove;

      return {
        user_id: user.id,
        goal_id: goal.id,
        milestone_id: createdMilestone.id,
        title: plannedMove?.title?.trim() || createdMilestone.description?.trim() || createdMilestone.title,
        status: 'pending',
        estimated_minutes: plannedMove?.estimatedMinutes ?? fallbackMinutes(draftActions(cleanTitle), index),
        steps: plannedMove?.steps ?? [],
        type: 'task',
        position: index,
      };
    });

    const { error: actionError } = await supabase.from('actions').insert(acts);

    if (actionError) {
      setSaving(false);
      Alert.alert('Could not build plan', actionError.message);
      return;
    }

    await supabase.from('events').insert({
      user_id: user.id,
      event_type: 'goal_created',
      object_id: goal.id,
      // Keep the chosen timing context on the existing goal-created event.
      // The Coach still needs a read path to use it on future visits.
      metadata: {
        title: cleanTitle,
        when_context: {
          version: 1,
          goal_type_choice: goalTimingKind,
          target_date: targetDate,
          schedule_type: scheduleType,
          schedule_days: scheduleType === 'repeat' ? scheduleDays : [],
          typed_schedule: scheduleType !== 'repeat' ? deadline.trim() || null : null,
          event_name: showTargetDate ? eventName.trim() || null : null,
          running_experience: runningGoal ? runningExperience : null,
          wants_beginner_plan: runningGoal ? wantsBeginnerPlan : null,
        },
      },
    });

    // Schedule the reminders chosen while creating this goal.
    if (scheduleType === 'repeat' && scheduleDays.length > 0) {
      const Notifications = await getNotifications();

      if (Notifications) {
        const { status } = await Notifications.requestPermissionsAsync();

        if (status === 'granted') {
          for (const item of scheduleDays) {
            for (const time of item.times) {
              const [hour, minute] = time.split(':').map(Number);
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `GOAL'D IN — ${cleanTitle}`,
                    body: firstMove.title || `Time to make progress on ${cleanTitle}.`,
                    sound: true,
                  },
                  trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                    weekday: item.day,
                    hour,
                    minute,
                  },
                });
              } catch (notifyError) {
                console.warn('Could not schedule a reminder:', notifyError);
              }
            }
          }
        }
      }
    }

    setTitle('');
    setOutcome('');
    setDeadline('');
    setWhy('');
    setGoalTimingKind('undecided');
    setGoalTargetDate(null);
    setEventName('');
    setRunningExperience('unsure');
    setWantsBeginnerPlan(false);
    setScheduleType(null);
    setScheduleDays([]);
    setOneTimeDate(null);
    setStep('goal');
    setShowSuccess(true);

    setTimeout(() => {
      setShowSuccess(false);
      router.replace('/today');
    }, 700);
  }

  function fallbackMinutes(list: ActionDraft[], index: number) {
    const pick = list[index % list.length];
    return pick ? pick[1] : 15;
  }

  return (
    <View style={s.page}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.replace('/today')} style={s.topBack}>
          <Text style={s.topBackText}>← BACK TO GOALS</Text>
        </Pressable>

        <Text style={s.brand}>GOAL'D IN</Text>

        {showSuccess && (
          <View style={s.successOverlay}>
            <Text style={s.successKicker}>GOAL'D IN</Text>
            <Text style={s.successBig}>GOAL'D IN ✓</Text>
            <Text style={s.successSub}>Your journey starts now.</Text>
          </View>
        )}

        {/* ================= GOAL ================= */}
        {step === 'goal' && (
          <>
            {buildFromGoal && (
              <View style={s.buildingOn}>
                <Text style={s.buildingOnLabel}>BUILDING ON</Text>
                <Text style={s.buildingOnTitle}>{buildFromGoal}</Text>
              </View>
            )}

            <Text style={s.h1}>{isBuildingFromGoal ? "What's next?" : 'What are we accomplishing?'}</Text>

            <Text style={s.copy}>
              {isBuildingFromGoal
                ? `You accomplished ${buildFromGoal}. What do you want to build from here?`
                : "Tell me what you want to make happen. You don't need to know every step yet."}
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="I want to..."
              placeholderTextColor="#667"
              style={s.input}
              multiline
            />

            <Pressable
              onPress={() => {
                setSpeechTarget('title');
                void startListening();
              }}
              style={s.speak}
            >
              <Text style={s.speakText}>🎙 SPEAK YOUR GOAL</Text>
            </Pressable>

            <Pressable onPress={() => setShowGoalIdeas((v) => !v)} style={s.ideasToggle}>
              <Text style={s.ideasToggleText}>{showGoalIdeas ? 'HIDE IDEAS ↑' : 'NOT SURE? FIND A GOAL →'}</Text>
            </Pressable>

            {showGoalIdeas && (
              <View style={{ gap: 10, marginBottom: 18 }}>
                {['Get stronger', 'Feel better', 'Get organized', 'Make more money', 'Learn something', 'Surprise me'].map(
                  (idea) => (
                    <Pressable key={idea} onPress={() => setTitle(idea)} style={s.idea}>
                      <Text style={s.ideaText}>{idea}</Text>
                    </Pressable>
                  )
                )}
              </View>
            )}

            <Pressable
              style={s.primary}
              onPress={() => {
                if (!title.trim()) {
                  Alert.alert('What are we accomplishing?', "Tell GOAL'D IN what you want to make happen.");
                  return;
                }
                setStep('why');
                setWhySuggestions([]);
setWhySuggestionsLoading(true);

void getWhySuggestions(title.trim())
  .then((suggestions) => {
    setWhySuggestions(suggestions);
  })
  .catch((error) => {
    console.error('Could not load WHY suggestions:', error);
  })
  .finally(() => {
    setWhySuggestionsLoading(false);
  });
              }}
            >
              <Text style={s.primaryText}>CONTINUE →</Text>
            </Pressable>
          </>
        )}

        {/* ================= WHY ================= */}
        {step === 'why' && (
          <>
            <Text style={s.h1}>Why does this matter to you?</Text>
            <Text style={s.copy}>
              How will achieving this goal make a difference in your life?
            </Text>

            <Text style={s.sectionLabel}>MY OWN WORDS</Text>
            <View style={s.whyInputWrap}>
              <TextInput
                value={why}
                onChangeText={setWhy}
                placeholder={whyFollowUpQuestion || `Imagine making progress on "${title.trim()}". What's different in your life?`}
                placeholderTextColor="#888888"
                style={s.whyInput}
                multiline
                accessibilityLabel="Tell your coach why this goal matters"
              />
              <Pressable
                onPress={() => {
                  whySpeechBaseRef.current = why.trim();
                  setSpeechTarget('why');
                  void startListening();
                }}
                style={s.whyMic}
                accessibilityRole="button"
                accessibilityLabel="Speak your why"
              >
                <Text style={s.whyMicText}>🎙 SPEAK</Text>
              </Pressable>
            </View>

            <Text style={s.pickLabel}>NEED A STARTING POINT?</Text>
            {whySuggestionsLoading ? (
              <Text style={s.whyHelpText}>Your coach is finding ideas for your goal...</Text>
            ) : whySuggestions.length === 0 ? (
              <Text style={s.whyHelpText}>
                No suggestions right now. Your own words are enough.
              </Text>
            ) : (
              <View style={s.wrap}>
                {whySuggestions.map((reason) => {
                  const selected = whyReasons.includes(reason);
                  return (
                    <Pressable
                      key={reason}
                      onPress={() =>
                        setWhyReasons((current) =>
                          current.includes(reason)
                            ? current.filter((item) => item !== reason)
                            : [...current, reason]
                        )
                      }
                      style={[s.reasonChip, selected && s.reasonChipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[s.reasonText, selected && s.reasonTextSelected]}>
                        {selected ? '✓ ' : ''}{reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {whyFollowUpQuestion !== '' && (
              <View style={s.whyCoachNote}>
                <Text style={s.whyCoachLabel}>YOUR COACH · OPTIONAL</Text>
                <Text style={s.whyCoachQuestion}>{whyFollowUpQuestion}</Text>
                <Text style={s.whyCoachHint}>You can answer in your own words above, or keep going.</Text>
              </View>
            )}

            <Text style={s.whyReassurance}>
              You don't need the perfect answer. Your WHY can help your coach
              support you on difficult days.
            </Text>

            <Pressable
              style={[s.primary, !hasWhy && s.whyDisabled]}
              disabled={!hasWhy}
              onPress={() => setStep('deadline')}
              accessibilityRole="button"
            >
              <Text style={s.primaryText}>CONTINUE WITH MY WHY →</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setWhy('');
                setWhyReasons([]);
                setWhyBarriers([]);
                setStep('deadline');
              }}
              accessibilityRole="button"
            >
              <Text style={s.whySkipText}>Not sure yet? Skip for now</Text>
            </Pressable>

            <Pressable onPress={() => setStep('goal')}>
              <Text style={s.backText}>← Back</Text>
            </Pressable>
          </>
        )}

        {/* ================= CLARIFICATION ================= */}
        {step === 'clarification' && (
          <>
            <Text style={s.h1}>One quick question</Text>

            <Text style={s.copy}>
              {clarificationQuestion ?? 'What would help us understand your goal better?'}
            </Text>

            {clarificationOptions.map((option, index) => (
              <Pressable
                key={index}
                style={[s.primary, clarificationAnswer === option && s.primarySelected]}
                onPress={() => {
                  setClarificationAnswer(option);
                  clarificationRef.answer = option;
                }}
              >
                <Text style={[s.primaryText, clarificationAnswer === option && { color: '#111' }]}>
                  {clarificationAnswer === option ? '✓ ' : ''}
                  {option}
                </Text>
              </Pressable>
            ))}

            <TextInput
              value={clarificationAnswer}
              onChangeText={(v) => {
                setClarificationAnswer(v);
                clarificationRef.answer = v;
              }}
              placeholder="Or tell us in your own words..."
              placeholderTextColor="#666"
              style={[s.input, { minHeight: 80 }]}
              multiline
            />

            <Pressable
              style={s.primary}
              onPress={() => {
                if (!clarificationAnswer.trim()) {
                  Alert.alert('One quick answer', 'Choose an option or tell us in your own words.');
                  return;
                }
                clarificationRef.answer = clarificationAnswer;
                void create();
              }}
            >
              <Text style={s.primaryText}>CONTINUE →</Text>
            </Pressable>

            <Pressable onPress={() => setStep('why')}>
              <Text style={s.backText}>← Back</Text>
            </Pressable>
          </>
        )}

        {/* ================= WHEN ================= */}
        {step === 'deadline' && (
          <>
            <Text style={s.h1}>When will this happen?</Text>
            <Text style={s.copy}>A finish line and the time you set aside to work on it are two different things. Let's make both useful.</Text>

            <View style={s.whenPanel}>
              <Text style={s.whenLabel}>WHAT KIND OF GOAL IS THIS?</Text>
              <View style={s.rowGap}>
                <Pressable
                  onPress={() => setGoalTimingKind('finish-line')}
                  style={[s.half, goalTimingKind === 'finish-line' && s.halfOn]}
                  accessibilityRole="button"
                >
                  <Text style={[s.halfText, goalTimingKind === 'finish-line' && { color: '#0B0B0B' }]}>FINISH LINE</Text>
                </Pressable>
                <Pressable
                  onPress={() => setGoalTimingKind('ongoing')}
                  style={[s.half, goalTimingKind === 'ongoing' && s.halfOn]}
                  accessibilityRole="button"
                >
                  <Text style={[s.halfText, goalTimingKind === 'ongoing' && { color: '#0B0B0B' }]}>ONGOING</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setGoalTimingKind('undecided')} accessibilityRole="button">
                <Text style={s.whenMuted}>Not sure yet — let my coach help me decide</Text>
              </Pressable>
              {goalTimingKind === 'undecided' && timingHint && (
                <Text style={s.whenMuted}>
                  This looks like {timingHint === 'ongoing' ? 'an ongoing practice' : 'a goal that could benefit from a finish date'}. You can choose differently.
                </Text>
              )}
              {showTargetDate && (
                <View style={{ marginTop: 14 }}>
                  <Text style={s.whenLabel}>TARGET COMPLETION / EVENT DATE · OPTIONAL</Text>
                  <Pressable onPress={() => setShowGoalTargetPicker(true)} style={s.pickButton}>
                    <Text style={s.pickButtonText}>
                      {goalTargetDate ? goalTargetDate.toLocaleDateString() : '+ CHOOSE A TARGET DATE'}
                    </Text>
                  </Pressable>
                  {goalTargetDate && (
                    <Pressable onPress={() => setGoalTargetDate(null)}>
                      <Text style={s.whenMuted}>Clear target date</Text>
                    </Pressable>
                  )}
                  <TextInput
                    value={eventName}
                    onChangeText={setEventName}
                    placeholder="Working toward a specific event? (optional)"
                    placeholderTextColor="#888888"
                    style={[s.input, { marginTop: 10, minHeight: 56, height: 56, paddingVertical: 12, fontSize: 16 }]}
                  />
                  <Text style={s.whenMuted}>We won't guess an event or registration deadline. Verified local suggestions can be added later.</Text>
                </View>
              )}
            </View>

            {runningGoal && (
              <View style={s.whenPanel}>
                <Text style={s.whenLabel}>ONE USEFUL QUESTION FROM YOUR COACH · OPTIONAL</Text>
                <Text style={s.whenPrompt}>How comfortable are you with running right now?</Text>
                {([
                  ['starting', 'Just starting / prefer run-walk'],
                  ['some', 'I can run a little'],
                  ['regular', 'I run regularly'],
                  ['unsure', 'Not sure / skip'],
                ] as const).map(([value, label]) => (
                  <Pressable
                    key={value}
                    onPress={() => setRunningExperience(value)}
                    style={[s.whenOption, runningExperience === value && s.whenOptionOn]}
                  >
                    <Text style={s.whenOptionText}>{runningExperience === value ? '✓  ' : ''}{label}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setWantsBeginnerPlan((current) => !current)} style={s.whenOption}>
                  <Text style={s.whenOptionText}>{wantsBeginnerPlan ? '✓  ' : ''}Help me build a gradual run/walk (Couch to 5K-style) plan</Text>
                </Pressable>
                {scheduleType === 'repeat' && scheduleDays.length === 1 && (
                  <Text style={s.whenMuted}>Your chosen day is a starting point. Your coach can suggest additional sessions, but won't add days without asking.</Text>
                )}
              </View>
            )}

            <Text style={s.whenLabel}>WHEN CAN YOU WORK ON IT?</Text>
            <Text style={s.whenMuted}>Choose a one-time action or a repeating routine. This is separate from your finish date.</Text>
            <Pressable onPress={() => setShowScheduleBuilder((current) => !current)} style={s.primary}>
              <Text style={s.primaryText}>MAKE A SCHEDULE</Text>
            </Pressable>

            {showScheduleBuilder && (
              <View style={s.builder}>
                <Text style={s.sectionLabel}>WHEN SHOULD THIS HAPPEN?</Text>

                <View style={s.rowGap}>
                  <Pressable
                    onPress={() => setScheduleType('once')}
                    style={[s.half, scheduleType === 'once' && s.halfOn]}
                  >
                    <Text style={[s.halfText, scheduleType === 'once' && { color: '#0B0B0B' }]}>ONE TIME</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setScheduleType('repeat')}
                    style={[s.half, scheduleType === 'repeat' && s.halfOn]}
                  >
                    <Text style={[s.halfText, scheduleType === 'repeat' && { color: '#0B0B0B' }]}>REPEATING</Text>
                  </Pressable>
                </View>

                {scheduleType === 'once' && (
                  <View style={[s.builder, { marginBottom: 18 }]}>
                    <Text style={s.sectionLabel}>CHOOSE DATE & TIME</Text>
                    <Pressable onPress={() => setShowTimePicker(true)} style={s.pickButton}>
                      <Text style={s.pickButtonText}>{deadline || '+ SELECT DATE & TIME'}</Text>
                    </Pressable>
                  </View>
                )}

                {scheduleType === 'repeat' && (
                  <>
                    <Text style={s.sectionLabel}>CHOOSE DAYS</Text>

                    <View style={[s.wrap, { marginBottom: 18 }]}>
                      {[
                        { label: 'SUN', day: 1 },
                        { label: 'MON', day: 2 },
                        { label: 'TUE', day: 3 },
                        { label: 'WED', day: 4 },
                        { label: 'THU', day: 5 },
                        { label: 'FRI', day: 6 },
                        { label: 'SAT', day: 7 },
                      ].map(({ label, day }) => {
                        const selected = scheduleDays.some((item) => item.day === day);
                        return (
                          <Pressable key={day} onPress={() => toggleScheduleDay(day)} style={[s.dayChip, selected && s.dayChipOn]}>
                            <Text style={[s.dayChipText, selected && { color: '#0B0B0B' }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={s.sectionLabel}>CHOOSE TIME</Text>

                    {scheduleDays.length === 0 ? (
                      <Text style={s.helpText}>Choose a day first.</Text>
                    ) : (
                      <View style={s.daysPanel}>
                        {scheduleDays.map((item) => {
                          const label = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][item.day - 1];
                          return (
                            <View key={item.day} style={s.dayPanel}>
                              <Text style={s.dayPanelLabel}>{label}</Text>
                              <View style={s.wrap}>
                                {item.times.map((time) => (
                                  <Pressable key={time} onPress={() => removeTimeFromDay(item.day, time)} style={s.timeChip}>
                                    <Text style={s.timeChipText}>{formatScheduleTime(time)} ×</Text>
                                  </Pressable>
                                ))}
                              </View>
                              <Pressable
                                onPress={() => {
                                  setActiveScheduleDay(item.day);
                                  setPendingTime(defaultTimePickerDate());
                                  setShowCustomPicker(true);
                                }}
                                style={[s.pickButton, { marginTop: 8 }]}
                              >
                                <Text style={s.pickButtonText}>+ ADD TIME</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            <Pressable
              onPress={async () => {
                const suggestion = await getSuggestedSchedule({ goalTitle: title, why, barriers: whyBarriers });

                if (!suggestion) {
                  Alert.alert("Couldn't create a schedule", 'Try again or make your schedule manually.');
                  return;
                }

                setScheduleType(suggestion.type);

                if (suggestion.type === 'repeat') {
                  setScheduleDays(suggestion.days.map((day) => ({ day, times: [suggestion.time] })));
                }

                setShowScheduleBuilder(true);
              }}
              style={s.suggestedButton}
            >
              <Text style={s.link}>USE SUGGESTED SCHEDULE</Text>
            </Pressable>

            <Text style={s.copy}>Or type it your way.</Text>

            <TextInput
              value={deadline}
              onChangeText={setDeadline}
              placeholder="e.g. Friday at 5 PM, every morning"
              placeholderTextColor="#666"
              style={[s.input, { minHeight: 56, height: 56, paddingVertical: 12 }]}
            />

            <View style={{ marginTop: 20 }}>
              <GoalItButton onPress={create} disabled={saving} loading={saving} />
            </View>

            <Pressable onPress={() => setStep('why')}>
              <Text style={s.backText}>← Back</Text>
            </Pressable>
          </>
        )}

        <GoalTimePicker
          show={showGoalTargetPicker}
          initialDate={goalTargetDate ?? defaultTimePickerDate()}
          onCancel={() => setShowGoalTargetPicker(false)}
          onAdd={(date) => {
            setGoalTargetDate(date);
            setShowGoalTargetPicker(false);
          }}
        />

        <GoalTimePicker
          show={showCustomPicker}
          showDate={false}
          initialDate={pendingTime}
          addedTimes={
            activeScheduleDay !== null
              ? scheduleDays.find((item) => item.day === activeScheduleDay)?.times.map(formatScheduleTime) ?? []
              : []
          }
          onCancel={() => setShowCustomPicker(false)}
          onAdd={(date) => {
            // add the chosen time to the day the user tapped, not to every selected day
            if (activeScheduleDay !== null) addTimeToDay(activeScheduleDay, date);
            setActiveScheduleDay(null);
            setShowCustomPicker(false);
          }}
        />

        <GoalTimePicker
          show={showTimePicker}
          initialDate={oneTimeDate ?? defaultTimePickerDate()}
          onCancel={() => setShowTimePicker(false)}
          onAdd={(date) => {
            setOneTimeDate(date);
            setShowTimePicker(false);
            setDeadline(
              date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            );
          }}
        />

        {step === 'outcome' && (
          <>
            <Text style={s.h1}>GOAL IT.</Text>

            <Text style={s.copy}>Describe the result you want. GOAL'D IN will use this to build the path.</Text>

            <TextInput
              value={outcome}
              onChangeText={setOutcome}
              placeholder="Work to achieve"
              placeholderTextColor="#666"
              style={s.input}
              multiline
            />

            <GoalItButton
              disabled={saving}
              loading={saving}
              onPress={() => {
                setShowTimePicker(false);
                void create();
              }}
            />

            <Pressable onPress={() => setStep('why')}>
              <Text style={s.backText}>← Back</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0B0D', padding: 24, paddingTop: 70 },
  topBack: { alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 4, marginBottom: 8 },
  topBackText: { color: '#D8B24A', fontSize: 14, fontWeight: '900' },
  brand: { color: '#F0D06A', fontWeight: '900', letterSpacing: 3 },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#090909',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successKicker: { color: '#F2CF63', fontSize: 16, fontWeight: '800', letterSpacing: 4 },
  successBig: { color: '#FFFFFF', fontSize: 42, fontWeight: '900', marginTop: 18 },
  successSub: { color: '#999', fontSize: 17, marginTop: 12 },
  buildingOn: { marginBottom: 18, padding: 14, borderWidth: 1, borderColor: '#D8B24A', borderRadius: 12 },
  buildingOnLabel: { color: '#D8B24A', fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  buildingOnTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  h1: { fontSize: 38, lineHeight: 41, color: '#E5E5E5', fontWeight: '600', marginTop: 16 },
  copy: { color: '#A9A9A9', fontSize: 16, lineHeight: 23, marginVertical: 20 },
  input: {
    minHeight: 120,
    backgroundColor: '#121214',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#E5E5E5',
    fontSize: 20,
    padding: 18,
    textAlignVertical: 'top',
  },
  speak: { marginTop: 10, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12 },
  speakText: { color: '#D4AF37', fontWeight: '700' },
  ideasToggle: { marginTop: 14, marginBottom: 12, paddingVertical: 12 },
  ideasToggleText: { color: '#D8B24A', fontSize: 18, fontWeight: '900', letterSpacing: 0.8, textAlign: 'center' },
  idea: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: '#3A3426', backgroundColor: '#111111' },
  ideaText: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  pickLabel: { color: '#D8B24A', marginTop: 18, marginBottom: 10, fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reasonChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#D8B24A', backgroundColor: 'transparent' },
  reasonChipSelected: { backgroundColor: '#D8B24A' },
  reasonText: { color: '#D8B24A', fontWeight: '800', fontSize: 14 },
  reasonTextSelected: { color: '#111111' },
  whyCoachNote: { backgroundColor: '#181715', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#514427', marginTop: 2, marginBottom: 2 },
  whyCoachLabel: { color: '#D8B24A', fontWeight: '800', fontSize: 12, marginBottom: 8 },
  whyCoachQuestion: { color: '#E5E5E5', fontSize: 16, lineHeight: 23 },
  whyCoachHint: { color: '#A9A9A9', fontSize: 13, marginTop: 8 },
  whyInputWrap: { minHeight: 154, borderColor: '#D8B24A', borderWidth: 1, borderRadius: 16, backgroundColor: '#121214' },
  whyInput: { color: '#FFFFFF', fontSize: 17, padding: 16, paddingBottom: 55, minHeight: 150, textAlignVertical: 'top' },
  whyMic: { position: 'absolute', right: 12, bottom: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#282316' },
  whyMicText: { color: '#E3BC5D', fontSize: 13, fontWeight: '800' },
  whyHelpText: { color: '#A9A9A9', fontSize: 14, lineHeight: 21, marginBottom: 12 },
  whyReassurance: { color: '#A9A9A9', fontSize: 13, lineHeight: 20, marginTop: 24 },
  whyDisabled: { opacity: 0.42 },
  whySkipText: { color: '#A9A9A9', textAlign: 'center', marginTop: 18, fontSize: 14 },
  sectionLabel: { color: '#D8B24A', fontWeight: '900', fontSize: 16, marginTop: 28, marginBottom: 14 },
  followUpQuestion: { color: '#D8B24A', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  goldInput: {
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8B24A',
    borderRadius: 10,
    padding: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  link: { color: '#D8B24A', fontWeight: '800', fontSize: 15 },
  barrierChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: '#D8B24A', backgroundColor: 'transparent' },
  barrierText: { color: '#D8B24A', fontWeight: '800', fontSize: 14 },
  builder: { marginTop: 14, padding: 16, borderWidth: 1, borderColor: '#3A3426', borderRadius: 16, backgroundColor: '#111111' },
  whenPanel: { marginTop: 18, padding: 16, borderWidth: 1, borderColor: '#3A3426', borderRadius: 16, backgroundColor: '#111111' },
  whenLabel: { color: '#D8B24A', fontSize: 13, fontWeight: '900', marginBottom: 12, letterSpacing: 0.5 },
  whenPrompt: { color: '#EAEAEA', fontSize: 16, lineHeight: 23, marginBottom: 12, fontWeight: '700' },
  whenMuted: { color: '#A9A9A9', fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 8 },
  whenOption: { borderWidth: 1, borderColor: '#4A4232', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 8 },
  whenOptionOn: { borderColor: '#D8B24A', backgroundColor: '#272217' },
  whenOptionText: { color: '#E3D5AE', fontSize: 14, lineHeight: 19 },
  rowGap: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  half: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#D8B24A', backgroundColor: '#111111', alignItems: 'center' },
  halfOn: { backgroundColor: '#D8B24A' },
  halfText: { color: '#D8B24A', fontWeight: '900' },
  pickButton: { borderWidth: 1, borderColor: '#D8B24A', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  pickButtonText: { color: '#D8B24A', fontWeight: '900' },
  dayChip: { minWidth: 72, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: '#D8B24A', backgroundColor: '#111111', alignItems: 'center' },
  dayChipOn: { backgroundColor: '#D8B24A' },
  dayChipText: { color: '#FFFFFF', fontWeight: '900' },
  helpText: { color: '#8E8E93', marginTop: 4, marginBottom: 8 },
  daysPanel: { padding: 14, borderWidth: 1, borderColor: '#3A3426', borderRadius: 14, backgroundColor: '#111111' },
  dayPanel: { marginBottom: 16 },
  dayPanelLabel: { color: '#D8B24A', fontWeight: '900', marginBottom: 8, letterSpacing: 1 },
  timeChip: { borderWidth: 1, borderColor: '#D8B24A', borderRadius: 99, paddingVertical: 8, paddingHorizontal: 12 },
  timeChipText: { color: '#D8B24A', fontWeight: '800' },
  suggestedButton: { paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  primary: {
    backgroundColor: '#F0D06A',
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 24,
    shadowColor: '#D6AA3F',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  primarySelected: { backgroundColor: '#D8B24A' },
  primaryText: { color: '#090909', fontSize: 15, fontWeight: '900', letterSpacing: 1.4 },
  backText: { color: '#A9A9A9', fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 22 },
});
