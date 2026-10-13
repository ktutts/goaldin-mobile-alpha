import { useEffect, useState } from 'react';
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
import { getAIPlan } from '@/lib/aiPlanner';
import { getSuggestedSchedule } from '@/lib/suggestedSchedule';
type ActionDraft = [string, number];

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
  const [whyBarriers, setWhyBarriers] = useState<string[]>([]);
  const [whyFollowUp, setWhyFollowUp] = useState('');
  const [showWhyText, setShowWhyText] = useState(false);

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
  const [pendingTime, setPendingTime] = useState<Date>(new Date());
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // speech
  const [speechTarget, setSpeechTarget] = useState<'title' | 'why'>('title');

  useEffect(() => {
    if (buildFromGoal) setTitle(buildFromGoal);
  }, [buildFromGoal]);

  useSpeechRecognitionEvent('result', (event) => {
    const spokenText = event.results[0]?.transcript;
    if (!spokenText) return;
    if (speechTarget === 'why') setWhy(spokenText);
    else setTitle(spokenText);
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

  const whyFollowUpQuestion = whyReasons.includes('I want to feel better')
    ? 'What would feeling better allow you to do?'
    : whyReasons.includes('I need this handled')
    ? 'What would tell you this is taken care of?'
    : whyReasons.includes('It will make life easier')
    ? 'What would become easier in your everyday life?'
    : whyReasons.includes('I want to prove I can do it')
    ? 'What would achieving this mean to you?'
    : whyReasons.includes('Someone else is counting on me')
    ? 'Who benefits from this, and what matters most to them?'
    : whyReasons.includes('This opens the door to something bigger')
    ? 'What possibility are you hoping this creates?'
    : '';

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
      whyFollowUp.trim() ? `Follow-up insight (${whyFollowUpQuestion}): ${whyFollowUp.trim()}` : '',
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

    setSaving(true);

    const aiPlan = await getAIPlan({
      title: cleanTitle,
      outcome: cleanOutcome || null,
      why: cleanWhy || null,
      deadline: deadline || null,
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
      : classifyGoal({ title: `${cleanTitle} ${cleanOutcome}`, deadline: deadline || null });

    const milestoneDrafts = aiPlan?.milestones?.length
      ? aiPlan.milestones
      : buildMilestoneDrafts({
          title: cleanTitle,
          outcome: cleanOutcome,
          why: cleanWhy,
          deadline: deadline || null,
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
        is_practice: isContinuingPractice,
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
      metadata: { title: cleanTitle },
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
              }}
            >
              <Text style={s.primaryText}>CONTINUE →</Text>
            </Pressable>
          </>
        )}

        {/* ================= WHY ================= */}
        {step === 'why' && (
          <>
            <Text style={s.h1}>What would you like to be different?</Text>

            <Text style={s.copy}>
              You don't need the perfect answer. Tell us what matters right now. We'll help you explore why.
            </Text>

            <Text style={s.pickLabel}>PICK WHAT FITS</Text>

            <View style={s.wrap}>
              {[
                'I want to feel better',
                'I need this handled',
                'It will make life easier',
                'I want to prove I can do it',
                'Someone else is counting on me',
                'This opens the door to something bigger',
              ].map((reason) => {
                const selected = whyReasons.includes(reason);
                return (
                  <Pressable
                    key={reason}
                    onPress={() =>
                      setWhyReasons((current) =>
                        current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]
                      )
                    }
                    style={s.reasonChip}
                  >
                    <Text style={[s.reasonText, selected && { color: '#111' }]}>{reason}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.sectionLabel}>MY OWN WORDS</Text>

            {whyFollowUpQuestion !== '' && (
              <View style={{ marginTop: 24, marginBottom: 12 }}>
                <Text style={s.followUpQuestion}>{whyFollowUpQuestion}</Text>
                <TextInput
                  value={whyFollowUp}
                  onChangeText={setWhyFollowUp}
                  placeholder="Your answer (optional)"
                  placeholderTextColor="#888888"
                  multiline
                  style={s.goldInput}
                />
              </View>
            )}

            <Pressable onPress={() => setShowWhyText((current) => !current)} style={{ paddingVertical: 14 }}>
              <Text style={s.link}>{showWhyText ? '− HIDE MY OWN WORDS' : '+ ADD SOMETHING IN MY OWN WORDS'}</Text>
            </Pressable>

            {showWhyText && (
              <>
                <TextInput
                  value={why}
                  onChangeText={setWhy}
                  placeholder="Anything else GOAL'D IN should know?"
                  placeholderTextColor="#666"
                  style={[s.input, { minHeight: 90 }]}
                  multiline
                />
                <Pressable
                  onPress={() => {
                    setSpeechTarget('why');
                    void startListening();
                  }}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                >
                  <Text style={s.link}>🎙 SPEAK MY WORDS</Text>
                </Pressable>
              </>
            )}

            <Text style={s.sectionLabel}>WHAT COULD GET IN THE WAY?</Text>

            <View style={s.wrap}>
              {['Time', 'Money', 'Tools or parts', 'Not sure how', 'Motivation', 'Other people', 'Not sure yet'].map(
                (barrier) => {
                  const selected = whyBarriers.includes(barrier);
                  return (
                    <Pressable
                      key={barrier}
                      onPress={() =>
                        setWhyBarriers((current) =>
                          current.includes(barrier) ? current.filter((item) => item !== barrier) : [...current, barrier]
                        )
                      }
                      style={s.barrierChip}
                    >
                      <Text style={[s.barrierText, selected && { color: '#111' }]}>{barrier}</Text>
                    </Pressable>
                  );
                }
              )}
            </View>

            <Pressable style={s.primary} onPress={() => setStep('deadline')}>
              <Text style={s.primaryText}>CONTINUE →</Text>
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
                setStep('deadline');
              }}
            >
              <Text style={s.primaryText}>CONTINUE →</Text>
            </Pressable>

            <Pressable onPress={() => setStep('why')}>
              <Text style={s.backText}>← Back</Text>
            </Pressable>
          </>
        )}

        {/* ================= DEADLINE ================= */}
        {step === 'deadline' && (
          <>
            <Text style={s.copy}>Set timeline.</Text>

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
                                  setPendingTime(new Date());
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
          initialDate={oneTimeDate ?? new Date()}
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
  reasonText: { color: '#D8B24A', fontWeight: '800', fontSize: 14 },
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
