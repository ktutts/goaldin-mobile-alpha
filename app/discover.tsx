import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

const ideas = [
  ['BUILD', 'Make or improve something'],
  ['GO', 'Go somewhere you have not been'],
  ['LEARN', 'Try a skill you keep thinking about'],
  ['FIX', 'Handle something you have been putting off'],
  ['PUSH', 'Challenge yourself physically or mentally'],
];

export default function Discover() {
  return (
    <View style={s.page}>
      <Text style={s.brand}>DISCOVER</Text>
      <Text style={s.h1}>Need something worth doing?</Text>
      <Text style={s.copy}>
        Later this screen will learn from saves, completions, skips and time available.
        For Alpha 0.1, choose a direction.
      </Text>

      {ideas.map(([a, b]) => (
        <Pressable key={a} style={s.card} onPress={() => router.push('/goal-it')}>
          <Text style={s.k}>{a}</Text>
          <Text style={s.v}>{b}</Text>
        </Pressable>
      ))}

      <Pressable onPress={() => router.back()}>
        <Text style={s.back}>← Back</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0B0B0D',
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
    fontSize: 36,
    fontWeight: '600',
    marginTop: 10,
  },
  copy: {
    color: '#A9A9A9',
    fontSize: 15,
    lineHeight: 22,
    marginVertical: 18,
  },
  card: {
    backgroundColor: '#121214',
    padding: 18,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  k: {
    color: '#F0D06A',
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  v: {
    color: '#E5E5E5',
    fontSize: 17,
    marginTop: 5,
  },
  back: {
    color: '#A9A9A9',
    marginTop: 8,
  },
});
