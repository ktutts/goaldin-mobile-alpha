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
import { supabase } from '@/lib/supabase';
import {
  buildMilestoneDrafts,
  classifyGoal,
} from '@/lib/goalPlanner';

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

const [step, setStep] =
  useState<'goal' | 'outcome' | 'deadline' | 'why'>('goal');

const [outcome, setOutcome] = useState('');
const [deadline, setDeadline] = useState('');
const [why, setWhy] = useState('');
  async function create() {
    const cleanTitle = title.trim();
    const cleanOutcome = outcome.trim();
const cleanWhy = why.trim();

const classification = classifyGoal({
  title: `${cleanTitle} ${cleanOutcome}`,
  deadline: deadline || null,
});

const milestoneDrafts = buildMilestoneDrafts({
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

    const acts = draftActions(cleanTitle).map(([name, min], i) => ({
      user_id: user.id,
      goal_id: goal.id,
      title: name,
      status: 'pending',
      estimated_minutes: min,
      position: i,
    
    }));

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

    router.replace('/today');
  }

  return (
    <View style={s.page}>
    <Text style={s.brand}>GOAL'D IN</Text>

{step === 'goal' && (
  <>
    <Text style={s.h1}>What are we accomplishing?</Text>

    <Text style={s.copy}>
      Tell me what you want to make happen. You don't need to know every step yet.
    </Text>

    <TextInput
      value={title}
      onChangeText={setTitle}
      placeholder="Relaunch mygoaldin.com by August 11..."
      placeholderTextColor="#666"
      style={s.input}
      multiline
    />

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

        setStep('deadline');
      }}
    >
      <Text style={s.primaryText}>CONTINUE →</Text>
    </Pressable>
  </>
)}

{step === 'deadline' && (
  <>
    <Text style={s.h1}>When does this need to happen?</Text>

    <Text style={s.copy}>
      A deadline helps GOAL'D IN work backward and keep the next move realistic.
    </Text>

    <TextInput
      value={deadline}
      onChangeText={setDeadline}
      placeholder="August 11"
      placeholderTextColor="#666"
      style={s.input}
    />

    <Pressable
      style={s.primary}
      onPress={() => setStep('outcome')}
    >
      <Text style={s.primaryText}>CONTINUE →</Text>
    </Pressable>

    <Pressable onPress={() => setStep('goal')}>
      <Text style={s.backText}>← Back</Text>
    </Pressable>
  </>
)}

{step === 'outcome' && (
  <>
    <Text style={s.h1}>What does winning look like?</Text>

    <Text style={s.copy}>
      Describe the result you want. GOAL'D IN will use this to build the path.
    </Text>

    <TextInput
      value={outcome}
      onChangeText={setOutcome}
      placeholder="The site represents the brand, explains the mission and app, promotes the products, and sends people to the Shopify store."
      placeholderTextColor="#666"
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

    <Pressable onPress={() => setStep('deadline')}>
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
    minHeight: 150,
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