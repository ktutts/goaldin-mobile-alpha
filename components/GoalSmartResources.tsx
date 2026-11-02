import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Resource = { label: string; url: string; note: string };
const GOLD = '#D8B24A';
const keyFor = (goalId: string) => `goaldin-saved-resources-${goalId}`;

// Search entry points, NOT endorsements, verified instructions, or parts matches.
export function suggestResourceSearches(goal: string, move: string): Resource[] {
  const context = `${goal} ${move}`.trim();
  const quoted = context.match(/["“']([^"”']{2,100})["”']/)?.[1];
  const music = /guitar|chord|strum|fingerpick|tablature|\btabs?\b|song/i.test(context);
  const vehicle = /brake|alternator|truck|car|vehicle|engine|automotive|repair|replace|restore/i.test(context);
  const query = music ? `${quoted ?? goal} guitar` : context;
  const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const youtube = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  if (music) return [
    { label: 'LISTEN · YOUTUBE MUSIC', url: `https://music.youtube.com/search?q=${encodeURIComponent(quoted ?? goal)}`, note: 'Open search in your music service; sign-in may be required.' },
    { label: 'LISTEN · SPOTIFY', url: `https://open.spotify.com/search/${encodeURIComponent(quoted ?? goal)}`, note: 'Alternative music provider.' },
    { label: 'WATCH · GUITAR LESSON', url: youtube(`${query} lesson`), note: 'Browse third-party tutorials.' },
    { label: 'LEARN · CHORDS / TABS', url: search(`${query} chords tabs licensed`), note: 'Open a provider’s own page; terms may apply.' },
  ];
  if (vehicle) return [
    { label: 'FIND · SERVICE INFORMATION', url: search(`${query} manufacturer service manual procedure`), note: 'Confirm year, make, model, engine and specifications before following instructions.' },
    { label: 'WATCH · REPAIR TUTORIAL', url: youtube(`${query} repair tutorial`), note: 'Third-party demonstrations are not verified service procedures.' },
    { label: 'FIND · PARTS & TOOLS', url: search(`${query} compatible parts tools`), note: 'Verify fitment and safety requirements with the manufacturer or supplier.' },
  ];
  return [
    { label: 'FIND · HOW-TO GUIDES', url: search(`${query} step by step guide`), note: 'Browse original sources; check relevance.' },
    { label: 'WATCH · TUTORIALS', url: youtube(`${query} tutorial`), note: 'Browse third-party videos.' },
    { label: 'FIND · LOCAL HELP', url: search(`${query} classes help near me`), note: 'Check provider details and availability yourself.' },
  ];
}

export function GoalSmartResources({ goalId, goalTitle, moveTitle }: { goalId: string; goalTitle: string; moveTitle: string }) {
  const [saved, setSaved] = useState<Resource[]>([]);
  const reload = useCallback(() => {
    if (!goalId) return;
    void AsyncStorage.getItem(keyFor(goalId)).then((raw) => {
      const data: unknown = raw ? JSON.parse(raw) : [];
      setSaved(Array.isArray(data) ? data.filter((r): r is Resource =>
        !!r && typeof r.label === 'string' && typeof r.url === 'string' && /^https:\/\//.test(r.url) && typeof r.note === 'string') : []);
    }).catch(() => setSaved([]));
  }, [goalId]);
  useEffect(reload, [reload]);
  const changeSaved = async (item: Resource) => {
    const exists = saved.some((r) => r.url === item.url);
    const updated = exists ? saved.filter((r) => r.url !== item.url) : [...saved, item];
    try {
      await AsyncStorage.setItem(keyFor(goalId), JSON.stringify(updated));
      setSaved(updated);
    } catch { Alert.alert('Could not save resource', 'Please try again.'); }
  };
  const open = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert('Could not open resource', 'Try again when you have a connection.')); };
  const suggestions = suggestResourceSearches(goalTitle, moveTitle);
  return (
    <View style={{ borderWidth: 1, borderColor: '#66512A', borderRadius: 16, padding: 16, marginTop: 18, gap: 12, backgroundColor: '#151515' }}>
      <Text style={{ color: GOLD, fontWeight: '900', fontSize: 14 }}>SMART RESOURCES</Text>
      <Text style={{ color: '#CCCCCC', fontSize: 12, lineHeight: 18 }}>Open what helps. Save useful searches to this goal for later. These links are searches, not verified recommendations.</Text>
      {suggestions.map((item) => <View key={item.url} style={{ borderWidth: 1, borderColor: '#514329', borderRadius: 10, padding: 12, gap: 7 }}>
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>{item.label}</Text>
        <Text style={{ color: '#AAAAAA', fontSize: 11 }}>{item.note}</Text>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <Pressable accessibilityRole="link" onPress={() => open(item.url)}><Text style={{ color: GOLD, fontWeight: '800' }}>OPEN ↗</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void changeSaved(item)}><Text style={{ color: GOLD, fontWeight: '800' }}>{saved.some((r) => r.url === item.url) ? 'SAVED ✓ · REMOVE' : 'SAVE ☆'}</Text></Pressable>
        </View>
      </View>)}
      {saved.length > 0 && <View style={{ borderTopWidth: 1, borderTopColor: '#514329', paddingTop: 10, gap: 9 }}>
        <Text style={{ color: GOLD, fontWeight: '900', fontSize: 12 }}>SAVED TO THIS GOAL · {saved.length}</Text>
        {saved.map((item) => <View key={item.url} style={{ gap: 4 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 12 }}>{item.label}</Text>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Pressable onPress={() => open(item.url)}><Text style={{ color: GOLD }}>OPEN ↗</Text></Pressable>
            <Pressable onPress={() => void changeSaved(item)}><Text style={{ color: '#BBBBBB' }}>REMOVE</Text></Pressable>
          </View>
        </View>)}
      </View>}
      <Text style={{ color: '#999999', fontSize: 11 }}>Saved searches are stored on this device, not yet synced across devices. GOAL'D IN does not host copyrighted content. For repairs, verify safety and specifications with authoritative sources.</Text>
    </View>
  );
}
