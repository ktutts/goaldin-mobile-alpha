import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import GoalTimePicker from '@/components/GoalTimePicker';
import { supabase } from '@/lib/supabase';
import {
  buildMilestoneDrafts,
  classifyGoal,
} from '@/lib/goalPlanner';
import { getAIPlan } from '@/lib/aiPlanner';
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
      ['Choose what “in shape” means for you', 5],
      ['Pick 3 days this week to move', 5],
      ['Do a 20-minute workout or brisk walk', 20],
    ];
  }

  if (
    t.includes('run') ||
    t.includes('5k') ||
    t.includes('10k') ||
    t.includes('marathon')
  ) {
    return [
      ['Choose your target distance and date', 5],
      ['Pick 3 training days this week', 5],
      ['Complete an easy first run', 20],
    ];
  }

  if (
    t.includes('clean') ||
    t.includes('garage') ||
    t.includes('organize') ||
    t.includes('declutter')
  ) {
    return [
      ['Choose one small area to start with', 2],
      ['Remove obvious trash and donations', 10],
      ['Organize only what remains', 20],
    ];
  }

  if (
    t.includes('cake') ||
    t.includes('cook') ||
    t.includes('bake') ||
    t.includes('dinner') ||
    t.includes('meal')
  ) {
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

export default function GoalIt() {
    const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
const [showSuccess, setShowSuccess] = useState(false);
const [step, setStep] =
  useState<'goal' | 'outcome' | 'deadline' | 'why'>('goal');

const [outcome, setOutcome] = useState('');
const [deadline, setDeadline] = useState('');
const [showTimePicker, setShowTimePicker] = useState(false);
const [showGoalIdeas, setShowGoalIdeas] = useState(false);
const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
const [scheduleType, setScheduleType] =
  useState<'once' | 'repeat' | null>(null);
  const [scheduleDays, setScheduleDays] = useState<
  { day: number; times: string[] }[]
>([]);

const [activeScheduleDay, setActiveScheduleDay] =
  useState<number | null>(null);

const [oneTimeDate, setOneTimeDate] =
  useState<Date | null>(null);
const [pendingTime, setPendingTime] = useState<Date>(new Date());
const [showCustomPicker, setShowCustomPicker] = useState(false);
const [why, setWhy] = useState('');
function toggleScheduleDay(day: number) {
  setScheduleDays((current) => {
    const exists = current.some((item) => item.day === day);

    if (exists) {
      return current.filter((item) => item.day !== day);
    }

    return [...current, { day, times: [] }].sort(
      (a, b) => a.day - b.day
    );
  });
}

function addTimeToDay(day: number, time: Date) {
  const timeString =
    `${String(time.getHours()).padStart(2, '0')}:` +
    `${String(time.getMinutes()).padStart(2, '0')}`;

  setScheduleDays((current) =>
    current.map((item) =>
      item.day === day && !item.times.includes(timeString)
        ? {
            ...item,
            times: [...item.times, timeString].sort(),
          }
        : item
    )
  );
}

function removeTimeFromDay(day: number, time: string) {
  setScheduleDays((current) =>
    current.map((item) =>
      item.day === day
        ? {
            ...item,
            times: item.times.filter((t) => t !== time),
          }
        : item
    )
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
    const cleanTitle = title.trim();
    const cleanOutcome = outcome.trim();
const cleanWhy = why.trim();


const aiPlan = await getAIPlan({
  title: cleanTitle,
  outcome: cleanOutcome || null,
  why: cleanWhy || null,
  deadline: deadline || null,
});

const classification = aiPlan
  ? {
      horizon: aiPlan.horizon,
      planningMode: aiPlan.planningMode,
    }
  : classifyGoal({
      title: `${cleanTitle} ${cleanOutcome}`,
      deadline: deadline || null,
    });

const milestoneDrafts =
  aiPlan?.milestones?.length
    ? aiPlan.milestones
    : buildMilestoneDrafts({
        title: cleanTitle,
        outcome: cleanOutcome,
        why: cleanWhy,
        deadline: deadline || null,
        horizon: classification.horizon,
        planningMode: classification.planningMode,
      });

    if (!cleanTitle) {
      Alert.alert('Add a goal', 'Tell GOAL’D IN what you want to accomplish.');
      return;
    }

    setSaving(true);

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
      })
      .select()
      .single();

    if (error || !goal) {
      setSaving(false);
      Alert.alert('Could not create goal', error?.message);
      return;
    }

   const milestoneRows = milestoneDrafts.map((milestone) => ({
  user_id: user.id,
  goal_id: goal.id,
  title: milestone.title,
  description: milestone.description ?? null,
  weight: milestone.weight,
  position: milestone.position,
  status: milestone.position === 0 ? 'active' : 'pending',
}));

const { data: createdMilestones, error: milestoneError } = await supabase
  .from('milestones')
  .insert(milestoneRows)
  .select('id, position, title, status');

if (milestoneError) {
  setSaving(false);
  Alert.alert('Could not build milestones', milestoneError.message);
  return;
}

const firstMilestone = [...(createdMilestones ?? [])]
  .sort((a, b) => a.position - b.position)[0];

const firstMove =
  aiPlan?.firstMove ??
  (() => {
    const fallback = draftActions(cleanTitle)[0];

    return fallback
      ? {
          title: fallback[0],
          estimatedMinutes: fallback[1],
        }
      : {
          title: `Take the first useful step toward ${cleanTitle}`,
          estimatedMinutes: 5,
        };
  })();

const acts = [
  {
    user_id: user.id,
    goal_id: goal.id,
    milestone_id: firstMilestone?.id ?? null,
    title: firstMove.title,
    status: 'pending',
    estimated_minutes: firstMove.estimatedMinutes,
    type: firstMove.estimatedMinutes >= 10 ? 'timed' : 'task',
    position: 0,
  },
];
const { error: actionError } = await supabase
  .from('actions')
  .insert(acts);

if (actionError) {
  setSaving(false);
  Alert.alert('Could not build plan', actionError.message);
  return;
}
    await supabase.from('events').insert({
      user_id: user.id,
      event_type: 'goal_created',
      object_id: goal.id,
      metadata: {
        title: cleanTitle,
      },
    });
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

  return (
    <View style={s.page}>
    <Text style={s.brand}>GOAL'D IN</Text>
   {showSuccess && (
  <View
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#090909',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 100,
    }}
  >
    <Text
      style={{
        color: '#F2CF63',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 4,
      }}
    >
      GOAL'D IN
    </Text>

    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 42,
        fontWeight: '900',
        marginTop: 18,
      }}
    >
      GOAL'D IN ✓
    </Text>

    <Text
      style={{
        color: '#999',
        fontSize: 17,
        marginTop: 12,
      }}
    >
      Your journey starts now.
    </Text>
  </View>
)}

{step === 'goal' && (
  <>
    <Text style={s.h1}>What are we accomplishing?</Text>

    <Text style={s.copy}>
      Tell me what you want to make happen. You don't need to know every step yet.
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
  onPress={() => setShowGoalIdeas((v) => !v)}
  style={{
    marginTop: 14,
    marginBottom: 12,
    paddingVertical: 12,
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 0.8,
      textAlign: 'center',
    }}
  >
    {showGoalIdeas ? 'HIDE IDEAS ↑' : 'NOT SURE? FIND A GOAL →'}
  </Text>
</Pressable>

{showGoalIdeas && (
  <View
    style={{
      gap: 10,
      marginBottom: 18,
    }}
  >
    {[
      'Get stronger',
      'Feel better',
      'Get organized',
      'Make more money',
      'Learn something',
      'Surprise me',
    ].map((idea) => (
      <Pressable
        key={idea}
        onPress={() => setTitle(idea)}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#3A3426',
          backgroundColor: '#111111',
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          {idea}
        </Text>
      </Pressable>
    ))}
  </View>
)}
    <Pressable
      style={s.primary}
      onPress={() => {
        if (!title.trim()) {
          Alert.alert(
            'What are we accomplishing?',
            'Tell GOAL’D IN what you want to make happen.'
          );
          return;
        }

        setStep('why');
      }}
    >
      <Text style={s.primaryText}>CONTINUE →</Text>
    </Pressable>
  </>
)}
{step === 'why' && (
  <>
    <Text style={s.h1}>Why does this matter?</Text>

    <Text style={s.copy}>
      A clear reason makes the goal easier to stay connected to.
    </Text>

    <TextInput
      value={why}
      onChangeText={setWhy}
      placeholder="Why do you want this?"
      placeholderTextColor="#666"
      style={[s.input, { minHeight: 110 }]}
      multiline
    />

    <Pressable
      style={s.primary}
      onPress={() => setStep('deadline')}
    >
      <Text style={s.primaryText}>CONTINUE →</Text>
    </Pressable>

    <Pressable onPress={() => setStep('goal')}>
      <Text style={s.backText}>← Back</Text>
    </Pressable>
  </>
)}
{step === 'deadline' && (
  <>
    <Text style={s.copy}>
  Set timeline.
</Text>
<Pressable
  onPress={() => setShowScheduleBuilder(true)}
  style={s.primary}
>
  <Text style={s.primaryText}>MAKE A SCHEDULE</Text>
</Pressable>
{showScheduleBuilder && (
  <View
    style={{
      marginTop: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 16,
      backgroundColor: '#111111',
    }}
  >
    <Text
  style={{
    color: '#D8B24A',
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 12,
  }}
>
  WHEN SHOULD THIS HAPPEN?
</Text>

<View
  style={{
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  }}
>
  <Pressable
    onPress={() => setScheduleType('once')}
    style={{
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#D8B24A',
      backgroundColor:
        scheduleType === 'once' ? '#D8B24A' : '#111111',
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: scheduleType === 'once' ? '#0B0B0B' : '#D8B24A',
        fontWeight: '900',
      }}
    >
      ONE TIME
    </Text>
  </Pressable>

  <Pressable
    onPress={() => setScheduleType('repeat')}
    style={{
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#D8B24A',
      backgroundColor:
        scheduleType === 'repeat' ? '#D8B24A' : '#111111',
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: scheduleType === 'repeat' ? '#0B0B0B' : '#D8B24A',
        fontWeight: '900',
      }}
    >
      REPEATING
    </Text>
  </Pressable>
</View>
{scheduleType === 'once' && (
  <View
    style={{
      marginBottom: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 16,
      backgroundColor: '#111111',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        fontSize: 16,
        marginBottom: 12,
      }}
    >
      CHOOSE DATE & TIME
    </Text>

    <Pressable
      onPress={() => setShowTimePicker(true)}
      style={{
        borderWidth: 1,
        borderColor: '#D8B24A',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: '#D8B24A',
          fontWeight: '900',
        }}
      >
        {deadline || '+ SELECT DATE & TIME'}
      </Text>
    </Pressable>
  </View>
)}
{scheduleType === 'repeat' && (
  <>
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        fontSize: 16,
        marginBottom: 12,
      }}
      
    >
      CHOOSE DAYS
    </Text>

    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 18,
      }}
    >
{[
  { label: 'SUN', day: 1 },
  { label: 'MON', day: 2 },
  { label: 'TUE', day: 3 },
  { label: 'WED', day: 4 },
  { label: 'THU', day: 5 },
  { label: 'FRI', day: 6 },
  { label: 'SAT', day: 7 },
].map(({ label, day }) => {
  const selected = scheduleDays.some(
    (item) => item.day === day
  );

  return (
    <Pressable
      key={day}
      onPress={() => toggleScheduleDay(day)}
      style={{
        minWidth: 72,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#D8B24A',
        backgroundColor: selected ? '#D8B24A' : '#111111',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: selected ? '#0B0B0B' : '#FFFFFF',
          fontWeight: '900',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
})}
    </View>

    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        fontSize: 16,
        marginBottom: 10,
      }}
    >
      CHOOSE TIME
    </Text>

   {scheduleDays.length === 0 ? (
  <Text
    style={{
      color: '#8E8E93',
      marginTop: 4,
      marginBottom: 8,
    }}
  >
    Choose a day first.
  </Text>
) : (
  <View
  style={{
    padding: 14,
    borderWidth: 1,
    borderColor: '#3A3426',
    borderRadius: 14,
    backgroundColor: '#111111',
  }}
>
  <Pressable
    onPress={() => {
      if (scheduleDays.length === 0) return;

      setActiveScheduleDay(scheduleDays[0].day);
      setPendingTime(new Date());
      setShowCustomPicker(true);
    }}
    style={{
      borderWidth: 1,
      borderColor: '#D8B24A',
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
      }}
    >
      + ADD TIME
    </Text>
  </Pressable>

  {scheduleDays[0]?.times?.length > 0 && (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
      }}
    >
      {scheduleDays[0].times.map((time: string) => (
        <Pressable
          key={time}
          onPress={() => removeTimeFromDay(scheduleDays[0].day, time)}
          style={{
            borderWidth: 1,
            borderColor: '#D8B24A',
            borderRadius: 99,
            paddingVertical: 8,
            paddingHorizontal: 12,
          }}
        >
          <Text
            style={{
              color: '#D8B24A',
              fontWeight: '800',
            }}
          >
            {formatScheduleTime(time)} ×
          </Text>
        </Pressable>
      ))}
    </View>
  )}
</View>
)}

      </>
)}
  </View>
)}
<Pressable
  onPress={() => {
    // we will wire this to the suggested schedule next
  }}
  style={{
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontWeight: '900',
      letterSpacing: 0.8,
    }}
  >
    USE SUGGESTED SCHEDULE
  </Text>
</Pressable>
    <Text style={s.copy}>
      Or type it your way.
    </Text>

    <TextInput
  value={deadline}
  onChangeText={setDeadline}
  placeholder="e.g. Friday at 5 PM, every morning"
  placeholderTextColor="#666"
  style={[s.input, { minHeight: 56, height: 56, paddingVertical: 12 }]}
/>

    <Pressable
  disabled={saving}
  style={s.primary}
  onPress={() => {
    setShowTimePicker(false);
    create();
  }}
>
  <Text style={s.primaryText}>
    {saving ? 'BUILDING...' : 'GOAL IT →'}
  </Text>
</Pressable>

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
  

  scheduleDays.forEach((item) => {
    addTimeToDay(item.day, date);
  });

  setActiveScheduleDay(null);
}}
/>
<GoalTimePicker
  show={showTimePicker}
  initialDate={new Date()}
  onCancel={() => setShowTimePicker(false)}
  onAdd={(date) => {
    setShowTimePicker(false);

    const formatted = date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    setDeadline(formatted);
  }}
/>
{step === 'outcome' && (
  <>
    <Text style={s.h1}>GOAL IT.</Text>

    <Text style={s.copy}>
      Describe the result you want. GOAL'D IN will use this to build the path.
    </Text>

    <TextInput
      value={outcome}
      onChangeText={setOutcome}
      placeholder="Work to achieve"
      placeholderTextColor="664"
      style={s.input}
      multiline
    />

    <Pressable
      disabled={saving}
      style={s.primary}
      onPress={create}
    >
      <Text style={s.primaryText}>
        {saving ? 'BUILDING...' : 'GOAL IT →'}
      </Text>
    </Pressable>

    <Pressable onPress={() => setStep('why')}>
      <Text style={s.backText}>← Back</Text>
    </Pressable>
  </>
)}
     
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0B0B0D',
    padding: 24,
    paddingTop: 70,
  },
  brand: {
    color: '#F0D06A',
    fontWeight: '900',
    letterSpacing: 3,
  },
  h1: {
    fontSize: 38,
    lineHeight: 41,
    color: '#E5E5E5',
    fontWeight: '600',
    marginTop: 16,
  },
  copy: {
    color: '#A9A9A9',
    fontSize: 16,
    lineHeight: 23,
    marginVertical: 20,
  },
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
  button: {
    backgroundColor: '#F0D06A',
    padding: 17,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: '#D6AA3F',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontWeight: '900',
    color: '#090909',
  },
  cancel: {
    color: '#A9A9A9',
    textAlign: 'center',
    marginTop: 18,
  },
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
  primaryText: {
    color: '#090909',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  backText: {
    color: '#A9A9A9',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 22,
  },
});