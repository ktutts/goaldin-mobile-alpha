import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Goal, Win } from '@/types/models';

export default function Wins() {
  const [wins, setWins] = useState<Win[]>([]);
const [archivedGoals, setArchivedGoals] = useState<Goal[]>([]);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('wins')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        setWins((data || []) as Win[]);
        const { data: archivedData } = await supabase
  .from('goals')
  .select('*')
  .eq('user_id', user.id)
  .eq('status', 'archived')
  .order('created_at', { ascending: false });

setArchivedGoals((archivedData || []) as Goal[]);
      }
    })();
  }, []);

  return (
    <ScrollView style={s.page} contentContainerStyle={s.scroll}>
      <Text style={s.brand}>WINS</Text>
      <Text style={s.h1}>Evidence.</Text>
      <Text style={s.copy}>The things you said you would do — and did.</Text>

      {wins.map((w) => (
        <View style={s.card} key={w.id}>
          <Text style={s.done}>GOAL'D IN ✓</Text>
          <Text style={s.title}>{w.title}</Text>
          <Pressable
            onPress={() =>
              Share.share({
                message: `GOAL'D IN ✓\n${w.title}\nI said I'd do it. I did it.`,
              })
            }
          >
            <Text style={s.share}>SHARE THE WIN →</Text>
          </Pressable>
        </View>
      ))}

      {wins.length === 0 && (
        <Text style={s.empty}>Finish a goal and your first Win will show up here.</Text>
      )}

      <Pressable onPress={() => router.back()}>
        <Text style={s.back}>← Back</Text>
      </Pressable>
      {archivedGoals.length > 0 && (
  <View style={{ marginTop: 32 }}>
    <Text
      style={{
        color: '#D8B24A',
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 14,
      }}
    >
      ARCHIVED ACHIEVEMENTS
    </Text>

    {archivedGoals.map((goal) => (
      <View
        key={goal.id}
        style={{
          backgroundColor: '#111111',
          borderWidth: 1,
          borderColor: '#2A2A2D',
          borderRadius: 20,
          padding: 20,
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            color: '#D8B24A',
            fontSize: 12,
            fontWeight: '900',
            letterSpacing: 1.5,
          }}
        >
          GOAL'D IN ✓
        </Text>

        <Text
          style={{
            color: '#E5E5E5',
            fontSize: 22,
            fontWeight: '800',
            marginTop: 8,
          }}
        >
          {goal.title}
        </Text>

        <Text
  style={{
    color: '#777777',
    fontSize: 13,
    marginTop: 8,
  }}
>
  {goal.completed_at
    ? `Completed ${new Date(goal.completed_at).toLocaleDateString()}`
    : 'Completed'}
</Text>

{goal.archived_at && (
  <Text
    style={{
      color: '#666666',
      fontSize: 12,
      marginTop: 4,
    }}
  >
    {`Archived ${new Date(goal.archived_at).toLocaleDateString()}`}
  </Text>
)}
      </View>
    ))}
  </View>
)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0B0B0D',
  },
  scroll: {
    padding: 22,
    paddingTop: 60,
  },
  brand: {
    color: '#F0D06A',
    fontWeight: '900',
    letterSpacing: 3,
  },
  h1: {
    color: '#E5E5E5',
    fontSize: 40,
    fontWeight: '600',
    marginTop: 10,
  },
  copy: {
    color: '#A9A9A9',
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#121214',
    padding: 20,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  done: {
    color: '#F0D06A',
    fontWeight: '900',
  },
  title: {
    color: '#E5E5E5',
    fontSize: 22,
    fontWeight: '700',
    marginVertical: 10,
  },
  share: {
    color: '#F0D06A',
    fontWeight: '900',
  },
  empty: {
    color: '#A9A9A9',
    paddingVertical: 20,
  },
  back: {
    color: '#A9A9A9',
    marginTop: 10,
  },
});
