import React from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

/** Discovery links only. No copyrighted audio, lyrics, tablature, or video is
 * copied into GOAL'D IN. Results are provided by the destination service. */
export function guitarLearningLinks(text: string) {
  const match = text.match(/["“']([^"”']{2,100})["”']/);
  const song = match?.[1]?.trim() || '';
  const query = song ? `${song} guitar` : 'beginner guitar';
  const encoded = encodeURIComponent(query);
  return [
    { label: 'LISTEN · FIND THE SONG', url: `https://open.spotify.com/search/${encoded}`, note: 'Opens Spotify search. Playback may require an account.' },
    { label: 'WATCH · FIND A LESSON', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' lesson')}`, note: 'Browse tutorials on YouTube.' },
    { label: 'LEARN · FIND CHORDS OR TABS', url: `https://www.google.com/search?q=${encodeURIComponent(query + ' site:ultimate-guitar.com tabs chords')}`, note: 'Find charts from their original provider; access terms may apply.' },
  ];
}

export function GuitarLearningResources({ goalText }: { goalText: string }) {
  if (!/guitar|chord|strum|fingerpick|tablature|\btabs?\b/i.test(goalText)) return null;
  const links = guitarLearningLinks(goalText);
  return (
    <View style={{ borderWidth: 1, borderColor: '#66512A', borderRadius: 16, padding: 16, marginTop: 18, gap: 10, backgroundColor: '#151515' }}>
      <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 14 }}>TOOLS FOR LEARNING</Text>
      <Text style={{ color: '#CCCCCC', fontSize: 12, lineHeight: 18 }}>Find the song, explore a lesson, then come back to practice. These are external searches, not Coach-verified recommendations.</Text>
      {links.map((item) => (
        <Pressable key={item.label} accessibilityRole="link" onPress={() => {
          void Linking.openURL(item.url).catch(() => Alert.alert('Could not open resource', 'Try again when you have an internet connection.'));
        }} style={{ borderWidth: 1, borderColor: '#66512A', borderRadius: 10, padding: 12, gap: 4 }}>
          <Text style={{ color: '#F0D06A', fontWeight: '800', fontSize: 12 }}>{item.label} ↗</Text>
          <Text style={{ color: '#AAAAAA', fontSize: 11 }}>{item.note}</Text>
        </Pressable>
      ))}
      <Text style={{ color: '#888888', fontSize: 11 }}>GOAL'D IN does not host music or tabs. Use resources according to each provider's terms.</Text>
    </View>
  );
}
