import { useEffect, useState } from 'react';
import { Image, ScrollView, Share, StyleSheet, Text, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Goal, Win } from '@/types/models';

export default function Wins() {
  const [wins, setWins] = useState<Win[]>([]);
  const [photoLinks, setPhotoLinks] = useState<Record<string, string>>({});
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
        const links: Record<string, string> = {};
        await Promise.all((data || []).map(async (win: any) => {
          if (!win.photo_url || typeof win.photo_url !== 'string') return;
          const signed = await supabase.storage.from('win-photos').createSignedUrl(win.photo_url, 3600);
          if (signed.data?.signedUrl) links[win.id] = signed.data.signedUrl;
        }));
        setPhotoLinks(links);
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
    <View style={s.page}>
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Return to YOU" onPress={() => router.replace('/you')} hitSlop={12} style={s.topBack}>
          <Text style={s.topBackText}>←  YOU</Text>
        </Pressable>
        <Text style={s.brand}>WINS</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
      <Text style={s.h1}>Evidence.</Text>
      <Text style={s.copy}>Things you learned, tried, experienced, and accomplished.</Text>

      {wins.map((w) => (
        <View style={s.card} key={w.id}>
          <Text style={s.done}>GOAL'D IN ✓</Text>
          <Text style={s.title}>{w.title}</Text>
          {!!photoLinks[w.id] && <Image source={{ uri: photoLinks[w.id] }} style={{ width: '100%', height: 190, borderRadius: 12, marginBottom: 12 }} resizeMode="cover" />}
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
        <Text style={s.empty}>Try something, learn something, or finish a goal to record your first Win.</Text>
      )}

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
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0B0B0D',
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 80,
  },
  topBar: { paddingHorizontal: 22, paddingTop: 48, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBack: { paddingVertical: 12, paddingRight: 20 },
  topBackText: { color: '#F0D06A', fontWeight: '900', letterSpacing: 1.3, fontSize: 13 },
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
