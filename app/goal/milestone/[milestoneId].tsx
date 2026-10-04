import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { completeNextMove as completeNextMoveEngine } from '../../../lib/completeNextMove';
type ProgressEntryType =
  | 'result'
  | 'learned'
  | 'decision'
  | 'blocker'
  | 'note';

const PROGRESS_TYPES: ProgressEntryType[] = [
  'result',
  'learned',
  'decision',
  'blocker',
  'note',
];
export default function MilestoneWorkspace() {
  const params = useLocalSearchParams<{ milestoneId: string }>();
  const milestoneId = params.milestoneId;

  const [milestone, setMilestone] = useState<any>(null);
  const [nextMove, setNextMove] = useState<any>(null);
  const [savingStep, setSavingStep] = useState(false);
  const [progressEntries, setProgressEntries] = useState<any[]>([]);
const [progressText, setProgressText] = useState('');
const [savingProgress, setSavingProgress] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressType, setProgressType] =
  useState<ProgressEntryType>('note');

  useEffect(() => {
    async function loadWorkspace() {
      if (!milestoneId) return;

      setLoading(true);
      setError(null);

      try {
        // Load this milestone
        const { data: milestoneData, error: milestoneError } =
          await supabase
            .from('milestones')
            .select('*')
            .eq('id', milestoneId)
            .single();

        if (milestoneError) throw milestoneError;

        setMilestone(milestoneData);

        // Load the current pending move that belongs to this milestone
        const { data: moveData, error: moveError } =
          await supabase
            .from('actions')
            .select('*')
            .eq('milestone_id', milestoneId)
            .eq('status', 'pending')
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (moveError) throw moveError;

        setNextMove(moveData);
        const { data: progressData, error: progressError } =
  await supabase
    .from('progress_entries')
    .select('*')
    .eq('milestone_id', milestoneId)
    .order('created_at', { ascending: false });

if (progressError) {
  console.error('Could not load progress entries:', progressError);
} else {
  setProgressEntries(progressData ?? []);
}
      } catch (err: any) {
        console.error('Milestone workspace load error:', err);
        setError(err?.message ?? 'Could not load milestone workspace.');
      } finally {
        setLoading(false);
      }
    }

    void loadWorkspace();
  }, [milestoneId]);
async function toggleStep(step: string) {
  if (!nextMove || savingStep) return;

  const completedSteps = Array.isArray(nextMove.completed_steps)
    ? nextMove.completed_steps
    : [];

  const isCompleted = completedSteps.includes(step);

  const updatedSteps = isCompleted
    ? completedSteps.filter((item: string) => item !== step)
    : [...completedSteps, step];

  // Update the screen immediately
  setNextMove({
    ...nextMove,
    completed_steps: updatedSteps,
  });

  setSavingStep(true);

  const { error } = await supabase
    .from('actions')
    .update({
      completed_steps: updatedSteps,
    })
    .eq('id', nextMove.id);

  setSavingStep(false);

  if (error) {
    console.error('Could not save completed step:', error);

    // Put it back if saving failed
    setNextMove({
      ...nextMove,
      completed_steps: completedSteps,
    });
  }
}
async function completeNextMove() {
  if (!nextMove) return;

  try {
    const result = await completeNextMoveEngine(nextMove.id);

    console.log('Progression result:', result);

    router.back();
  } catch (error) {
    console.error('Could not complete Next Move:', error);
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

    if (userError || !user) {
      throw userError ?? new Error('No signed-in user.');
    }

    const { data, error } = await supabase
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

    if (error) throw error;

    setProgressEntries((current) => [data, ...current]);
    setProgressText('note');
  } catch (err) {
    console.error('Could not record progress:', err);
  } finally {
    setSavingProgress(false);
  }
}
  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#0B0B0B',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color="#D8B24A" />
        <Text
          style={{
            color: '#8E8E93',
            marginTop: 12,
          }}
        >
          Loading workspace...
        </Text>
      </SafeAreaView>
    );
  }

  if (error || !milestone) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#0B0B0B',
          padding: 18,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text
            style={{
              color: '#D8B24A',
              fontWeight: '900',
            }}
          >
            ← BACK
          </Text>
        </Pressable>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 20,
            fontWeight: '900',
            marginTop: 30,
          }}
        >
          Workspace unavailable
        </Text>

        <Text
          style={{
            color: '#8E8E93',
            marginTop: 10,
          }}
        >
          {error ?? 'Milestone not found.'}
        </Text>
      </SafeAreaView>
    );
  }

  const steps = Array.isArray(nextMove?.steps) ? nextMove.steps : [];
const completedSteps = Array.isArray(nextMove?.completed_steps)
  ? nextMove.completed_steps
  : [];

const completedStepCount = steps.filter((step: string) =>
  completedSteps.includes(step)
).length;

const moveProgress =
  steps.length > 0
    ? Math.round((completedStepCount / steps.length) * 100)
    : 0;
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#0B0B0B',
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 40,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
  marginTop: 24,
  marginBottom: 22,
  paddingVertical: 12,
  paddingHorizontal: 8,
  alignSelf: "flex-start",
}}
        >
          <Text
            style={{
              color: '#D8B24A',
              fontWeight: '900',
            }}
          >
            ← YOUR PATH
          </Text>
        </Pressable>

        <Text
          style={{
            color: '#D8B24A',
            fontSize: 12,
            fontWeight: '900',
            letterSpacing: 1.6,
          }}
        >
          MILESTONE WORKSPACE
        </Text>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 25,
            fontWeight: '900',
            lineHeight: 31,
            marginTop: 10,
          }}
        >
          {milestone.title}
        </Text>

        {milestone.description ? (
          <Text
            style={{
              color: '#A5A5AA',
              fontSize: 15,
              lineHeight: 22,
              marginTop: 12,
            }}
          >
            {milestone.description}
          </Text>
        ) : null}

        <View
          style={{
            height: 1,
            backgroundColor: '#302B20',
            marginVertical: 24,
          }}
        />

        <Text
          style={{
            color: '#D8B24A',
            fontSize: 12,
            fontWeight: '900',
            letterSpacing: 1.4,
            marginBottom: 10,
          }}
        >
          CURRENT NEXT MOVE
        </Text>

        {nextMove ? (
          <View
            style={{
              backgroundColor: '#111111',
              borderWidth: 1,
              borderColor: '#3A321F',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 18,
                fontWeight: '900',
                lineHeight: 24,
              }}
            >
              {nextMove.title}
            </Text>

          {nextMove.estimated_minutes ? (
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 12,
      fontWeight: '800',
      marginTop: 7,
    }}
  >
    {nextMove.estimated_minutes} MIN
  </Text>
) : null}

{steps.length > 0 ? (
  <View style={{ marginTop: 16, marginBottom: 4 }}>
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 7,
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
        MOVE PROGRESS
      </Text>

      <Text
        style={{
          color: '#D8B24A',
          fontSize: 12,
          fontWeight: '900',
        }}
      >
        {completedStepCount}/{steps.length} · {moveProgress}%
      </Text>
    </View>

    <View
      style={{
        height: 6,
        backgroundColor: '#292929',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${moveProgress}%`,
          backgroundColor: '#D8B24A',
          borderRadius: 999,
        }}
      />
    </View>
  </View>
) : null}

            {steps.length > 0 ? (
              <View style={{ marginTop: 18 }}>
               {steps.map((step: string, index: number) => {
  const isCompleted =
    Array.isArray(nextMove.completed_steps) &&
    nextMove.completed_steps.includes(step);

  return (
    <Pressable
      key={`${index}-${step}`}
      onPress={() => toggleStep(step)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 14,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: '#D8B24A',
          backgroundColor: isCompleted ? '#D8B24A' : 'transparent',
          marginRight: 10,
          marginTop: 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isCompleted ? (
          <Text
            style={{
              color: '#0B0B0B',
              fontSize: 12,
              fontWeight: '900',
            }}
          >
            ✓
          </Text>
        ) : null}
      </View>

      <Text
        style={{
          flex: 1,
          color: isCompleted ? '#8E8E93' : '#D6D6D8',
          fontSize: 15,
          lineHeight: 21,
          textDecorationLine: isCompleted ? 'line-through' : 'none',
        }}
      >
        {step}
      </Text>
    </Pressable>
  );
})}
{moveProgress >= 100 && (
  <Pressable
    onPress={completeNextMove}
    style={{
      marginTop: 10,
      minHeight: 52,
      borderRadius: 12,
      backgroundColor: '#D8B24A',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    }}
  >
    <Text
      style={{
        color: '#0B0B0B',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
      }}
    >
      COMPLETE NEXT MOVE
    </Text>
  </Pressable>
)}
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#111111',
              borderWidth: 1,
              borderColor: '#3A321F',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontWeight: '800',
              }}
            >
              No pending Next Move for this milestone.
            </Text>
          </View>
        )}

        <View
  style={{
    marginTop: 22,
    borderWidth: 1,
    borderColor: '#3A321F',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#111111',
  }}
>
  <Text
    style={{
      color: '#D8B24A',
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 1.3,
    }}
  >
    RECORD PROGRESS
  </Text>

  <Text
    style={{
      color: '#8E8E93',
      fontSize: 13,
      lineHeight: 19,
      marginTop: 7,
    }}
  >
    What happened? What did you learn or discover?
    
  </Text>
<View
  style={{
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  }}
>
  {PROGRESS_TYPES.map((type) => {
    const selected = progressType === type;

    return (
      <Pressable
        key={type}
        onPress={() => setProgressType(type)}
        style={{
          paddingHorizontal: 11,
          paddingVertical: 7,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: selected ? '#D8B24A' : '#3A3426',
          backgroundColor: selected ? '#D8B24A' : '#111111',
        }}
      >
        <Text
          style={{
            color: selected ? '#0B0B0B' : '#A5A5AA',
            fontSize: 11,
            fontWeight: '900',
            letterSpacing: 0.7,
          }}
        >
          {type.toUpperCase()}
        </Text>
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
    style={{
      marginTop: 14,
      minHeight: 100,
      borderWidth: 1,
      borderColor: '#3A3426',
      borderRadius: 12,
      padding: 12,
      color: '#FFFFFF',
      fontSize: 15,
      lineHeight: 21,
      textAlignVertical: 'top',
    }}
  />

  <Pressable
    onPress={recordProgress}
    disabled={!progressText.trim() || savingProgress}
    style={{
      marginTop: 12,
      backgroundColor:
        progressText.trim() && !savingProgress ? '#D8B24A' : '#393939',
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color:
          progressText.trim() && !savingProgress
            ? '#0B0B0B'
            : '#777777',
        fontWeight: '900',
        letterSpacing: 1,
      }}
    >
      {savingProgress ? 'SAVING...' : 'RECORD PROGRESS'}
    </Text>
  </Pressable>
</View>

{progressEntries.length > 0 ? (
  <View style={{ marginTop: 24 }}>
    <Text
      style={{
        color: '#8E8E93',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1.3,
        marginBottom: 10,
      }}
    >
      RECORDED
    </Text>

    {progressEntries.map((entry) => (
      <View
        key={entry.id}
        style={{
          borderLeftWidth: 2,
          borderLeftColor: '#D8B24A',
          paddingLeft: 12,
          marginBottom: 18,
        }}
      >
        <Text
  style={{
    color: '#D8B24A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 5,
  }}
>
  {(entry.entry_type ?? 'note').toUpperCase()}
</Text>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {entry.content}
        </Text>

        <Text
          style={{
            color: '#666666',
            fontSize: 11,
            marginTop: 6,
          }}
        >
          {new Date(entry.created_at).toLocaleString()}
        </Text>
      </View>
    ))}
  </View>
) : null}
      </ScrollView>
    </SafeAreaView>
  );
}