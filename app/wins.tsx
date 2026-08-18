import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Win } from '@/types/models';

export default function Wins() {
  const [wins, setWins] = useState<Win[]>([]);

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
