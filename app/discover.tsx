import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { requestDiscovery, selectedDiscovery, discoveryImageKind, prepareDiscoveryExperience, askDiscoveryCoach, type DiscoveryCoachTurn, type DiscoveryExperience, type CoachDiscovery } from '@/lib/discoveryCoach';

import { createDiscoveryGoal } from '@/lib/discoveryGoal';
const GOLD = '#E8B93A';
const categories = [
  { key: 'BUILD', subtitle: 'Make or improve something', title: 'Build something worth keeping', detail: 'Consider a small improvement, a creative project, or sharing a skill you already know. What would make the result meaningful to you?' },
  { key: 'GO', subtitle: 'Go somewhere you have not been', title: 'A new place can change your perspective', detail: 'Think about a place that interests you, from a nearby park to a longer-term adventure. Explore what makes it special before deciding whether to go.' },
  { key: 'LEARN', subtitle: 'Try a skill you keep thinking about', title: 'Follow your curiosity', detail: 'Choose a skill you have wondered about. Learn what the first satisfying experience looks like before committing to a course or schedule.' },
  { key: 'FIX', subtitle: 'Handle something you have been putting off', title: 'Make room for something better', detail: 'Consider a repair or problem that would genuinely improve your life. Explore what it involves, then decide whether it deserves a place in your plans.' },
  { key: 'PUSH', subtitle: 'Challenge yourself physically or mentally', title: 'See what the next horizon could be', detail: 'A meaningful challenge should fit your experience, time, and resources. Imagine what would excite you, then explore a safe progression toward it.' },
  { key: 'CONNECT', subtitle: 'Connect with someone or a community', title: 'Make a meaningful connection', detail: 'Try a conversation, a shared experience, or learning from someone else.' },
  { key: 'MOVE', subtitle: 'Try a new way to move', title: 'Move in a new direction', detail: 'Explore an approachable, safe movement experience.' },
  { key: 'DO', subtitle: 'Cook, create, experiment or experience', title: 'Try something new today', detail: 'Make something real with the tools and ingredients you have.' },
] as const;

const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';

export default function Discover() {
  const params = useLocalSearchParams<{ title?: string; body?: string; detail?: string; doorway?: string; subject?: string; kind?: string; ai?: string }>();
  const [aiDiscovery, setAiDiscovery] = useState<CoachDiscovery | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachError, setCoachError] = useState('');
  const [experience, setExperience] = useState<DiscoveryExperience | null>(null);
  const [experienceBusy, setExperienceBusy] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  const goalLock = useRef(false);
  const [coachQuestion, setCoachQuestion] = useState('');
  const [coachTurns, setCoachTurns] = useState<DiscoveryCoachTurn[]>([]);
  const [askingCoach, setAskingCoach] = useState(false);
  const [winDraft, setWinDraft] = useState('');
  const [winBusy, setWinBusy] = useState(false);
  const [winPhoto, setWinPhoto] = useState<string | null>(null);
  const [winSaved, setWinSaved] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const askLock = useRef(false);
  const [askCount, setAskCount] = useState(0);
  async function tryThis() {
    if (experienceBusy) return;
    setExperienceBusy(true); setCoachError('');
    try {
      const idea = aiDiscovery || { title, idea: detail, category: selected || 'LEARN' } as CoachDiscovery;
      const prepared = await prepareDiscoveryExperience(idea);
      setCoachTurns([]); setExperience(prepared); setWinDraft(''); setWinPhoto(null); setWinSaved(false);
    } catch (e: any) { setCoachError(e?.message || 'Try again.'); }
    finally { setExperienceBusy(false); }
  }
  async function askCoach() {
    const question = coachQuestion.trim();
    if (!question || askLock.current || !experience) return;
    askLock.current = true; Keyboard.dismiss(); setAskingCoach(true); setCoachError('');
    try {
      const idea = aiDiscovery || { title, idea: detail, category: selected || 'LEARN' } as CoachDiscovery;
      const reply = await askDiscoveryCoach(idea, experience, question, coachTurns);
      setCoachTurns((previous) => [...previous, { question, ...reply }].slice(-8));
      setCoachQuestion(''); setAskCount((count) => count + 1);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) { setCoachError(e?.message || 'Coach is unavailable. Try again.'); }
    finally { askLock.current = false; setAskingCoach(false); }
  }
  async function makeGoal() {
    if (goalLock.current) return;
    goalLock.current = true; setGoalBusy(true); setCoachError('');
    try {
      const idea = aiDiscovery || { title, idea: detail, category: selected || 'LEARN' } as CoachDiscovery;
      const id = await createDiscoveryGoal(idea);
      router.replace(`/goal/${id}`);
    } catch (e: any) { setCoachError(e?.message || 'Could not create the goal.'); }
    finally { goalLock.current = false; setGoalBusy(false); }
  }
  async function choosePhoto(camera: boolean) {
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Photo permission', 'Allow photo access in your device settings to add a picture.'); return; }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
      if (!result.canceled && result.assets[0]?.uri) setWinPhoto(result.assets[0].uri);
    } catch (e: any) { Alert.alert('Photo unavailable', e?.message || 'Try again.'); }
  }
  async function openResource(query: string, images = false) {
    const q = encodeURIComponent(query.trim().slice(0, 180));
    if (!q) return;
    const url = images ? `https://www.google.com/search?tbm=isch&q=${q}` : `https://www.youtube.com/results?search_query=${q}`;
    try { await Linking.openURL(url); } catch { Alert.alert('Could not open resource', 'Please try again.'); }
  }
  async function recordWin() {
    if (winBusy || winSaved || !winDraft.trim()) return;
    setWinBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to record a Win.');
      // Save the Win first. A failed optional photo must never erase a real accomplishment.
      const { data: win, error } = await supabase.from('wins')
        .insert({ user_id: user.id, title: winDraft.trim().slice(0, 180) }).select('id').single();
      if (error) throw error;
      setWinSaved(true);
      if (winPhoto && win?.id) {
        try {
          const photo = await fetch(winPhoto);
          const bytes = await photo.arrayBuffer();
          const path = `${user.id}/${win.id}.jpg`;
          const upload = await supabase.storage.from('win-photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
          if (upload.error) throw upload.error;
          const update = await supabase.from('wins').update({ photo_url: path }).eq('id', win.id).eq('user_id', user.id);
          if (update.error) throw update.error;
        } catch (photoError: any) {
          Alert.alert('Win saved without photo', `Your Win was saved, but the picture could not be attached: ${photoError?.message || 'Upload failed'}`);
          router.replace('/wins'); return;
        }
      }
      Alert.alert('WIN RECORDED', 'Your progress is part of your Journey. What would you like to do next?', [
        { text: 'KEEP EXPLORING', onPress: () => {} },
        { text: 'VIEW WINS', onPress: () => router.replace('/wins') },
        { text: 'NEW DISCOVERY', onPress: () => {
          // The user chooses when this experience is finished. A learning Win
          // alone never silently marks the whole activity complete.
          void AsyncStorage.setItem(`goaldin-next-discovery-${user.id}`, JSON.stringify({ title, at: Date.now() }))
            .then(() => router.replace('/you'))
            .catch(() => router.replace('/you'));
        } },
      ]);
    } catch (e: any) { Alert.alert('Could not record Win', e?.message || 'Try again.'); }
    finally { setWinBusy(false); }
  }

  useEffect(() => {
    if (one(params.ai) !== '1') return;
    let mounted = true;
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const value = await selectedDiscovery(user.id);
      if (mounted) setAiDiscovery(value);
    }).catch(() => { if (mounted) setCoachError('Could not load this discovery.'); });
    return () => { mounted = false; };
  }, [params.ai]);
  async function exploreDirection(direction: string) {
    setSelected(direction); setShowDirections(false); setExpanded(false); setCoachError(''); setAiDiscovery(null); setExperience(null); setCoachTurns([]); setCoachQuestion('');
    setCoachBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to explore a personal discovery.');
      const [goals, wins] = await Promise.all([
        supabase.from('goals').select('title,status,completed_at,archived_at').eq('user_id', user.id).limit(40),
        supabase.from('wins').select('title').eq('user_id', user.id).limit(20),
      ]);
      if (goals.error || wins.error) throw new Error(goals.error?.message || wins.error?.message);
      const active = (goals.data || []).filter((g) => g.status === 'active' && !g.completed_at && !g.archived_at);
      const finished = (goals.data || []).filter((g) => g.status === 'completed' || !!g.completed_at);
      const discovery = await requestDiscovery(user.id, {
        direction, activeGoals: active.map((g) => ({ title: String(g.title || '') })),
        achievements: [...finished.map((g) => String(g.title || '')), ...(wins.data || []).map((w) => String(w.title || ''))].filter(Boolean).slice(0, 8),
        interests: Array.isArray(user.user_metadata?.interests) ? user.user_metadata.interests.map(String) : [],
      }, true);
      setAiDiscovery(discovery);
    } catch (error: any) { setCoachError(error?.message || 'Discovery is unavailable. Try again.'); }
    finally { setCoachBusy(false); }
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const fromYou = !!one(params.title) || one(params.ai) === '1';
  const category = categories.find((item) => item.key === selected);
  const title = aiDiscovery?.title || category?.title || one(params.title) || 'What could today open up?';
  const body = aiDiscovery?.hook || category?.subtitle || one(params.body) || 'Explore a possibility that feels meaningful to you.';
  const detail = aiDiscovery?.idea || category?.detail || one(params.detail) || 'Choose a direction below to explore an idea. You can enjoy a discovery without turning it into another commitment.';
  const doorway = aiDiscovery?.explore || (category ? 'Explore first. Decide what matters to you afterward.' : one(params.doorway));
  const kind = discoveryImageKind(aiDiscovery, category ? ({BUILD:'restoration',GO:'adventure',LEARN:'learning',FIX:'restoration',PUSH:'adventure'} as Record<string,string>)[category.key] : one(params.kind) || 'connection');
  const photoSource = kind === 'restoration' ? require('../assets/images/discovery-restoration.jpg') : kind === 'music' ? require('../assets/images/discovery-music.jpg') : kind === 'adventure' ? require('../assets/images/discovery-adventure.jpg') : kind === 'learning' ? require('../assets/images/discovery-learning.jpg') : require('../assets/images/discovery-connection.jpg');
  const [expanded, setExpanded] = useState(false);
  const directionsVisible = showDirections || (!fromYou && !selected);
  return (
    <View style={s.page}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" color={GOLD} size={20}/><Text style={s.backText}>BACK</Text></Pressable>
        <Text style={s.brand}>GOAL'D IN  /  DISCOVER</Text>
        <Text style={s.headline}>DISCOVER WHAT'S <Text style={{ color: GOLD }}>POSSIBLE.</Text></Text>
        <ImageBackground source={photoSource} resizeMode="cover" style={s.hero} imageStyle={s.heroImage}>
          <View style={s.imageShade}/>
          <Text style={s.imageBadge}>DISCOVERY · {kind.toUpperCase()}</Text>
        </ImageBackground>
        <View style={s.card}>
          <Text style={s.eyebrow}>{category ? `${category.key} · A DIRECTION TO EXPLORE` : fromYou ? 'INSPIRED BY YOUR JOURNEY' : 'BEGIN WITH CURIOSITY'}</Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.body}>{body}</Text>
          {!expanded ? (
            <Pressable style={s.explore} onPress={() => setExpanded(true)} accessibilityRole="button">
              <Text style={s.exploreText}>EXPLORE FURTHER  →</Text>
            </Pressable>
          ) : (
            <>
              <View style={s.rule}/>
              {!!aiDiscovery?.whyYou && <><Text style={s.section}>WHY THIS FITS YOUR JOURNEY</Text><Text style={s.detail}>{aiDiscovery.whyYou}</Text></>}
              <Text style={s.section}>IMAGINE THE POSSIBILITY</Text><Text style={s.detail}>{detail}</Text>
              {!!aiDiscovery?.possibilities?.length && <><Text style={s.section}>OTHER WAYS IT COULD COME TO LIFE</Text>{aiDiscovery.possibilities.map((possibility, index) => <Text key={`${index}-${possibility}`} style={[s.detail, { marginTop: 8 }]}>✦  {possibility}</Text>)}</>}
              {!!aiDiscovery?.readinessReason && <><Text style={s.section}>{aiDiscovery.readiness === 'within_reach' ? 'WITHIN REACH' : aiDiscovery.readiness === 'stretch' ? 'A STRETCH' : 'A BIGGER POSSIBILITY'}</Text><Text style={s.detail}>{aiDiscovery.readinessReason}</Text></>}
              {!!doorway && <><Text style={s.section}>A WAY TO EXPLORE</Text><Text style={s.detail}>{doorway}</Text></>}
              <Text style={s.note}>{aiDiscovery ? 'AI-generated creative possibility, not a verified local opportunity or an assessment of your abilities.' : 'Curated creative idea, not a verified local opportunity or a readiness assessment.'}</Text>
            </>
          )}
        </View>
        {expanded && <>
          <Pressable style={s.primary} disabled={experienceBusy || goalBusy} onPress={() => void tryThis()}><Text style={s.primaryText}>{experienceBusy ? 'COACH IS PREPARING...' : 'TRY THIS  →'}</Text></Pressable>
          <Text style={s.noteCentered}>Get practical steps and tools. No goal or schedule required.</Text>
          <Pressable style={[s.primary, { backgroundColor: '#211A0D', borderWidth: 1, borderColor: GOLD }]} disabled={goalBusy || experienceBusy} onPress={() => void makeGoal()}><Text style={[s.primaryText, { color: GOLD }]}>{goalBusy ? 'BUILDING YOUR PATH...' : 'MAKE IT A GOAL  →'}</Text></Pressable>
          <Text style={s.noteCentered}>Your confirmation creates a goal and Path immediately.</Text>
          {(experienceBusy || goalBusy) && <ActivityIndicator color={GOLD} style={{ marginTop: 14 }} />}
          {!!coachError && <Text style={[s.note, { color: '#FFB7A4' }]}>{coachError}</Text>}
          {!!experience && <View style={[s.card, { borderWidth: 1, borderTopWidth: 1, marginTop: 18, borderRadius: 18 }]}>
            <Text style={s.section}>LET'S EXPERIENCE IT</Text>
            <Text style={s.detail}>{experience.invitation}</Text>
            {experience.tools.length > 0 && <><Text style={s.section}>WHAT YOU NEED</Text>{experience.tools.map((tool, i) => <Text style={s.detail} key={i}>• {tool}</Text>)}</>}
            <Text style={s.section}>HOW TO START</Text>
            {experience.steps.map((step, i) => <Text style={[s.detail, { marginTop: 9 }]} key={i}>{i + 1}. {step}</Text>)}
            {!!experience.safetyNote && <><Text style={s.section}>KEEP IN MIND</Text><Text style={s.detail}>{experience.safetyNote}</Text></>}
            {!!experience.resourceSearch && <><Text style={s.section}>EXPLORE A RESOURCE</Text><Text style={s.detail}>Search for: {experience.resourceSearch}</Text>
              <Pressable style={s.resourceButton} onPress={() => void openResource(experience.resourceSearch)}><Text style={s.resourceText}>FIND VIDEOS ↗</Text></Pressable>
              <Pressable style={s.resourceButton} onPress={() => void openResource(experience.resourceSearch, true)}><Text style={s.resourceText}>SEE EXAMPLES ↗</Text></Pressable>
              <Text style={s.note}>Opens search results, not a verified tutorial.</Text></>}
            <Text style={s.section}>ASK YOUR COACH</Text>
            <Text style={s.note}>Ask for an example, a resource, another approach, or your next step. The Coach will follow your curiosity.</Text>
            {coachTurns.map((turn, i) => <View key={`${i}-${turn.question}`} style={{ marginTop: 14 }}>
              <Text style={[s.detail, { color: GOLD, fontWeight: '700' }]}>YOU: {turn.question}</Text>
              <Text style={[s.detail, { marginTop: 7 }]}>{turn.answer}</Text>
              {!!turn.resourceSearch && <View><Text style={[s.note, { marginTop: 6 }]}>Explore: {turn.resourceSearch}</Text>
                <Pressable onPress={() => void openResource(turn.resourceSearch!)} style={s.resourceButton}><Text style={s.resourceText}>FIND VIDEOS ↗</Text></Pressable>
                <Pressable onPress={() => void openResource(turn.resourceSearch!, true)} style={s.resourceButton}><Text style={s.resourceText}>SEE EXAMPLES ↗</Text></Pressable>
                <Text style={s.note}>Search results; sources not verified.</Text></View>}
            </View>)}
            <TextInput value={coachQuestion} onChangeText={setCoachQuestion} multiline
              placeholder="What would you like to know or do next?" placeholderTextColor="#85817A"
              style={{ color: '#FFF', borderColor: '#5B4A27', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 56 }} />
            <Pressable onPress={() => void askCoach()} disabled={askingCoach || !coachQuestion.trim()} style={s.secondary}>
              <Text style={s.secondaryText}>{askingCoach ? 'COACH IS THINKING...' : 'ASK →'}</Text>
            </Pressable>
            <Text style={s.section}>RECORD A REAL WIN</Text>
            <Text style={s.note}>Only record something you actually learned, tried, or accomplished. Edit this to describe what happened.</Text>
            <TextInput value={winDraft} onChangeText={setWinDraft} multiline placeholder="What did you learn, try, or accomplish?" placeholderTextColor="#85817A" style={{ color: '#FFF', borderColor: '#5B4A27', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 9, minHeight: 58 }} />
            <Text style={s.section}>CAPTURE THE MOMENT? (OPTIONAL)</Text>
            <Text style={s.note}>Add a photo of what you did. Private in your Journey.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[s.resourceButton, { flex: 1 }]} onPress={() => void choosePhoto(true)}><Text style={s.resourceText}>TAKE PHOTO</Text></Pressable>
              <Pressable style={[s.resourceButton, { flex: 1 }]} onPress={() => void choosePhoto(false)}><Text style={s.resourceText}>GALLERY</Text></Pressable>
            </View>
            {!!winPhoto && <View style={{ marginTop: 12 }}><Image source={{ uri: winPhoto }} style={{ width: '100%', height: 160, borderRadius: 12 }} resizeMode="cover" />
              <Pressable onPress={() => setWinPhoto(null)} style={s.secondary}><Text style={s.secondaryText}>REMOVE PHOTO</Text></Pressable></View>}
            <Pressable onPress={() => void recordWin()} disabled={winBusy || !winDraft.trim()} style={s.primary}><Text style={s.primaryText}>{winBusy ? 'SAVING...' : winSaved ? 'WIN SAVED ✓' : 'I DID IT — SAVE WIN ✓'}</Text></Pressable>
          </View>}
        </>}
        <Pressable style={s.secondary} onPress={() => { setShowDirections(!directionsVisible); if (selected) setSelected(null); setExpanded(false); }}><Text style={s.secondaryText}>{directionsVisible ? 'HIDE DIRECTIONS' : 'EXPLORE SOMETHING ELSE'}  {directionsVisible ? '↑' : '↓'}</Text></Pressable>
        {directionsVisible && <View style={s.directions}>{categories.map((item) => <Pressable key={item.key} style={[s.direction, selected === item.key && s.directionActive]} onPress={() => void exploreDirection(item.key)}><Text style={s.directionKey}>{item.key}</Text><Text style={s.directionSubtitle}>{item.subtitle}</Text><Ionicons name="chevron-forward" color={GOLD} size={18}/></Pressable>)}</View>}
        <Pressable style={s.finish} onPress={() => router.back()}><Text style={s.finishText}>JUST ENJOY THE IDEA</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#050505' }, scroll: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 70 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 }, backText: { color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  brand: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 2 }, headline: { color: '#F5F3ED', fontSize: 26, fontWeight: '900', letterSpacing: 0.8, marginTop: 10, marginBottom: 20 },
  hero: { height: 215, justifyContent: 'flex-end', padding: 18, overflow: 'hidden', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderColor: '#7C5B20', borderWidth: 1 }, heroImage: { borderTopLeftRadius: 22, borderTopRightRadius: 22 }, imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' }, imageBadge: { color: '#F8D77E', fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
  heroFallback: { height: 175, backgroundColor: '#1A150D', borderColor: '#7C5B20', borderWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, justifyContent: 'center', alignItems: 'center', gap: 20 },
  card: { backgroundColor: '#131313', borderColor: '#705425', borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, padding: 22 }, eyebrow: { color: GOLD, fontSize: 10, letterSpacing: 1.4, fontWeight: '900', marginBottom: 10 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', lineHeight: 34 }, body: { color: '#E5DFD2', fontSize: 16, lineHeight: 23, marginTop: 10 }, rule: { height: 1, backgroundColor: '#3B3223', marginVertical: 20 }, section: { color: GOLD, fontSize: 11, letterSpacing: 1.2, fontWeight: '900', marginTop: 12, marginBottom: 6 }, detail: { color: '#DDD9D1', fontSize: 15, lineHeight: 23 }, note: { color: '#98958E', fontSize: 12, lineHeight: 18, marginTop: 18 },
  resourceButton: { borderWidth: 1, borderColor: GOLD, borderRadius: 11, padding: 13, alignItems: 'center', marginTop: 9 },
  resourceText: { color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
  explore: { backgroundColor: '#E8B93A', padding: 15, borderRadius: 12, marginTop: 18, alignItems: 'center' }, exploreText: { color: '#090909', fontWeight: '900', letterSpacing: 1 },
  primary: { backgroundColor: GOLD, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 20 }, primaryText: { color: '#080808', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 }, noteCentered: { color: '#8E8A83', fontSize: 11, textAlign: 'center', marginTop: 9, lineHeight: 16 }, secondary: { padding: 18, alignItems: 'center', marginTop: 10 }, secondaryText: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, directions: { gap: 9, marginTop: 6 }, direction: { backgroundColor: '#151515', borderWidth: 1, borderColor: '#34302B', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }, directionActive: { borderColor: GOLD }, directionKey: { color: GOLD, fontWeight: '900', fontSize: 12, width: 52 }, directionSubtitle: { color: '#E6E1D8', fontSize: 13, flex: 1 }, finish: { alignItems: 'center', padding: 18, marginTop: 6 }, finishText: { color: '#A6A39E', fontSize: 12, fontWeight: '800' },
});
