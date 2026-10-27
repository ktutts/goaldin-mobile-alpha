import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { deletePhotoFile, loadYouArt, savePhotoFile, saveYouArt, type YouArt } from '@/lib/privatePhotos';

const G = '#E8B93A', BG = '#050505', C = '#101010', T = '#F4F1E8', M = '#9C9A92', LINE = '#2A2A2A';
const DEFAULT_TAGLINE = 'Today is full of opportunity. Stay Ready. Stay Goal\'D In.';
const SUGGESTED = ['Fitness', 'Family', 'Projects', 'Mindset', 'Nutrition', 'Career', 'Money', 'Faith', 'Learning', 'Home', 'Creative', 'Health'];
const DONE = ['done', 'complete', 'completed', 'archived', 'abandoned', 'cancelled', 'canceled'];

type Tab = 'overview' | 'history' | 'patterns';
type Profile = { name: string; tagline: string; about: string; interests: string[] };
type Row = Record<string, any>;
type CirclePerson = { member_id: string; display_name: string; status: string };

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rowDate = (r: Row) => {
  const v = r.created_at || r.completed_at || r.inserted_at;
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};
const winTitle = (w: Row) => String(w.title || w.name || w.summary || w.content || w.note || 'Win');
const isActive = (g: Row) => {
  if (DONE.includes(String(g.status ?? '').toLowerCase())) return false;
  return !(g.completed_at || g.archived_at);
};

function streakOf(wins: Row[]) {
  const days = new Set(wins.map(rowDate).filter(Boolean).map((d) => dayKey(d as Date)));
  const cur = new Date();
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1); // today not logged yet doesn't break the streak
  let n = 0;
  while (days.has(dayKey(cur))) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

export default function You() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<Profile>({ name: '', tagline: '', about: '', interests: [] });
  const [goals, setGoals] = useState<Row[]>([]);
  const [wins, setWins] = useState<Row[]>([]);
  const [innerCircle, setInnerCircle] = useState<CirclePerson[]>([]);
  const [editing, setEditing] = useState<null | 'profile' | 'about' | 'interests'>(null);
  const [draft, setDraft] = useState<Profile>(profile);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [userId, setUserId] = useState('');
  const [youArt, setYouArt] = useState<YouArt>({});
  const [customizing, setCustomizing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const meta: any = user.user_metadata || {};
      setUserId(user.id);
      setYouArt(await loadYouArt(user.id));
      setEmail(user.email || '');
      setProfile({
        name: String(meta.full_name || (user.email ? user.email.split('@')[0] : '')),
        tagline: String(meta.tagline || ''),
        about: String(meta.about || ''),
        interests: Array.isArray(meta.interests) ? meta.interests.map(String) : [],
      });
      const [g, w] = await Promise.all([
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('wins').select('*').eq('user_id', user.id),
      ]);
      const byNewest = (a: Row, b: Row) => (rowDate(b)?.getTime() || 0) - (rowDate(a)?.getTime() || 0);
      setGoals(((g.data as Row[]) || []).sort(byNewest));
      setWins(((w.data as Row[]) || []).sort(byNewest));
      // Circle is optional. If its schema has not been installed yet,
      // do not break the private YOU profile or make up connections.
      const circleResult = await supabase.rpc('circle_members');
      if (!circleResult.error) {
        setInnerCircle(((circleResult.data || []) as CirclePerson[])
          .filter((p) => p.status === 'accepted').slice(0, 5));
      } else {
        setInnerCircle([]);
      }
    } catch (e: any) {
      Alert.alert('Could not load', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { setDraft(profile); }, [profile]);

  async function saveProfile(next: Profile) {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: next.name.trim(), tagline: next.tagline.trim(), about: next.about.trim(), interests: next.interests },
      });
      if (error) throw error;
      setProfile({ ...next, name: next.name.trim(), tagline: next.tagline.trim(), about: next.about.trim() });
      setEditing(null);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Personal imagery is app-local and never automatically shared to Circle or Supabase.
  async function changeYouPhoto(kind: 'portrait' | 'background', source: 'camera' | 'library') {
    if (!userId || photoBusy) return;
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera permission', 'Allow camera access in Android settings to take a picture.');
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: kind === 'portrait', aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: kind === 'portrait', aspect: [1, 1] });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setPhotoBusy(true);
      const uri = await savePhotoFile(userId, result.assets[0].uri, kind);
      const next = kind === 'portrait' ? { ...youArt, portraitUri: uri } : { ...youArt, backgroundUri: uri };
      await saveYouArt(userId, next);
      setYouArt(next);
      const replaced = kind === 'portrait' ? youArt.portraitUri : youArt.backgroundUri;
      if (replaced && replaced !== uri) deletePhotoFile(replaced);
      setCustomizing(false);
    } catch (error: any) {
      Alert.alert('Photo unavailable', error?.message || 'Check permissions and try again. The photo tool may need a new Android build.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function restoreDefaultYouArt() {
    if (!userId) return;
    try {
      const next: YouArt = {};
      await saveYouArt(userId, next);
      setYouArt(next);
      if (youArt.portraitUri) deletePhotoFile(youArt.portraitUri);
      if (youArt.backgroundUri) deletePhotoFile(youArt.backgroundUri);
      setCustomizing(false);
    } catch (error: any) {
      Alert.alert('Could not reset', error?.message || 'Try again.');
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={G} /></View>;

  const activeCount = goals.filter(isActive).length;
  const streak = streakOf(wins);
  const latest = wins[0];
  const initials = (profile.name || email || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  /* ---------- patterns ---------- */
  const now = Date.now();
  const inLast = (r: Row, days: number) => { const d = rowDate(r); return !!d && now - d.getTime() <= days * 864e5; };
  const wins7 = wins.filter((w) => inLast(w, 7)).length;
  const wins30 = wins.filter((w) => inLast(w, 30)).length;
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  wins.filter((w) => inLast(w, 90)).forEach((w) => { const d = rowDate(w); if (d) weekdayCounts[d.getDay()]++; });
  const maxDay = Math.max(...weekdayCounts);
  const WK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const WKFULL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const bestDay = maxDay > 0 ? WKFULL[weekdayCounts.indexOf(maxDay)] : '';

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* header */}
        <View style={s.topRow}>
          <Text style={s.brand}>YOU</Text>
          <View style={s.topIcons}>
            <Pressable hitSlop={10} onPress={() => setMenu(true)}><Ionicons name="settings-outline" size={26} color={G} /></Pressable>
            <Pressable hitSlop={10} onPress={() => router.push('/circle')} style={{ marginLeft: 22 }}><Ionicons name="person-add-outline" size={26} color={G} /></Pressable>
          </View>
        </View>

        {/* Brand-first identity: premium default, optional private portrait/cover. */}
        <View style={s.heroPanel}>
          <View pointerEvents="none" style={s.heroArt}>
            <Svg width="100%" height="100%" viewBox="0 0 380 260" preserveAspectRatio="xMidYMid slice">
              <Defs>
                <RadialGradient id="goldglow" cx="75%" cy="10%" rx="78%" ry="105%">
                  <Stop offset="0" stopColor="#8B6421" stopOpacity="0.42" />
                  <Stop offset="0.45" stopColor="#2F2513" stopOpacity="0.32" />
                  <Stop offset="1" stopColor="#050505" stopOpacity="1" />
                </RadialGradient>
              </Defs>
              <Rect width="380" height="260" fill="url(#goldglow)" />
              <Circle cx="318" cy="64" r="91" stroke="#AF8B3A" strokeWidth="1" strokeOpacity="0.38" fill="none" />
              <Circle cx="318" cy="64" r="116" stroke="#967233" strokeWidth="1" strokeOpacity="0.22" fill="none" />
              <Circle cx="318" cy="64" r="145" stroke="#8F7134" strokeWidth="1" strokeOpacity="0.14" fill="none" />
            </Svg>
          </View>
          {youArt.backgroundUri ? (
            <>
              <Image style={s.heroBackground} source={{ uri: youArt.backgroundUri }} resizeMode="cover" />
              <View pointerEvents="none" style={s.heroVeil} />
            </>
          ) : null}
          <View style={s.heroTopline}>
            <View style={s.heroIdentity}>
              <Ionicons name="diamond-outline" color={G} size={14} />
              <Text style={s.heroTopText}>YOUR JOURNEY</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Personalize YOU" onPress={() => setCustomizing(true)} style={s.customizePill}>
              <Ionicons name="options-outline" size={15} color={G} />
              <Text style={s.customizeText}>CUSTOMIZE</Text>
            </Pressable>
          </View>
          <View style={s.profileRow}>
            <Pressable onPress={() => setCustomizing(true)} accessibilityRole="button" accessibilityLabel="Change profile photo">
              <View style={s.avatarRing}>
                <View style={s.avatar}>
                  {youArt.portraitUri ? (
                    <Image source={{ uri: youArt.portraitUri }} style={s.avatarPhoto} resizeMode="cover" />
                  ) : <Text style={s.avatarText}>{initials}</Text>}
                </View>
              </View>
              <View style={s.pencil}><Ionicons name="camera-outline" size={14} color="#080808" /></View>
            </Pressable>
            <View style={{ flex: 1, marginLeft: 18 }}>
              <Text style={s.name} numberOfLines={2}>{profile.name || 'Your name'}</Text>
              <Text style={s.stay}>STAY READY</Text>
              <Text style={s.tag}>“{profile.tagline || DEFAULT_TAGLINE}”</Text>
            </View>
          </View>
          <View style={s.heroFooter}>
            <View style={s.heroGoldLine} />
            <Text style={s.heroFootText}>IDENTITY · DIRECTION · ACTION</Text>
          </View>
        </View>

        {/* The meaningful entry point: real identity, connection, then action. */}
        <Pressable style={s.todayPreview} onPress={() => router.push('/today')}>
          <View style={s.previewHeading}>
            <Ionicons name="sunny-outline" size={21} color={G} />
            <Text style={s.previewCap}>TODAY · YOUR DIRECTION</Text>
            <Ionicons name="arrow-forward" size={18} color={G} />
          </View>
          <Text style={s.previewTitle}>What matters today?</Text>
          <Text style={s.previewBody}>See what you chose, what is scheduled, and the one thing to act on next.</Text>
          <Text style={s.previewLink}>OPEN TODAY  →</Text>
        </Pressable>

        <Pressable style={s.circlePreview} onPress={() => router.push('/circle')}>
          <View style={s.previewHeading}>
            <Ionicons name="people-outline" size={21} color={G} />
            <Text style={s.previewCap}>YOUR INNER CIRCLE</Text>
            <Text style={s.circleCount}>{innerCircle.length}/5</Text>
          </View>
          <View style={s.circleFaces}>
            {Array.from({ length: 5 }).map((_, i) => {
              const person = innerCircle[i];
              return (
                <View key={i} style={[s.circleSlot, person && s.circleFilled]}>
                  <Text style={s.circleInitial}>{person ? (person.display_name || '?').charAt(0).toUpperCase() : '+'}</Text>
                </View>
              );
            })}
          </View>
          <Text style={s.previewBody}>{innerCircle.length
            ? `${innerCircle.length} trusted ${innerCircle.length === 1 ? 'person' : 'people'} beside you. Share only what you choose.`
            : 'Start with one person you trust. Private encouragement and accountability, not another feed.'}</Text>
          <Text style={s.previewLink}>YOUR CIRCLE  →</Text>
        </Pressable>

        {/* stats */}
        <View style={s.statsRow}>
          <Stat n={wins.length} l="WINS" />
          <Stat n={goals.length} l="GOALS" />
          <Stat n={activeCount} l="ACTIVE" />
          <Stat n={streak} l="STREAK" last />
        </View>

        <Pressable style={s.becomes} onPress={() => setTab('history')}>
          <View style={s.bookWrap}><Ionicons name="book-outline" size={30} color={G} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cap}>WHAT THIS BECOMES</Text>
            <Text style={s.becomesText}>Your accomplishment history, patterns, interests, streaks and the evidence of what you actually do. This is your journey.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={M} />
        </Pressable>

        {/* tabs */}
        <View style={s.tabs}>
          {(['overview', 'history', 'patterns'] as Tab[]).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tabBtn, tab === k && s.tabOn]}>
              <Text style={[s.tabText, tab === k && s.tabTextOn]}>{k.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {/* ===== OVERVIEW ===== */}
        {tab === 'overview' && (
          <>
            <Pressable style={s.latest} onPress={() => setTab('history')}>
              <View style={s.trophyWrap}><Ionicons name="trophy-outline" size={30} color={G} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cap}>LATEST WIN</Text>
                {latest ? (
                  <>
                    <Text style={s.latestBig} numberOfLines={2}>{winTitle(latest)}</Text>
                    <Text style={s.muted}>{wins.length} win{wins.length === 1 ? '' : 's'} · {goals.length} goals created so far</Text>
                  </>
                ) : (
                  <>
                    <Text style={s.latestBig}>No wins yet.</Text>
                    <Text style={s.muted}>Finish a Next Move and it lands here.</Text>
                  </>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={M} />
            </Pressable>

            <Head title="MY PATH" action="See All" onAction={() => router.push('/goals' as any)} />
            <View style={s.tiles}>
              <Tile icon="locate-outline" l="Active Goals" v={String(activeCount)} />
              <Tile icon="stats-chart-outline" l="Total Goals" v={String(goals.length)} />
              <Tile icon="trophy-outline" l="Wins" v={String(wins.length)} />
              <Tile icon="flame-outline" l="Current Streak" v={`${streak} day${streak === 1 ? '' : 's'}`} />
            </View>

            <Head title="INTERESTS & AREAS" action="Edit" onAction={() => { setDraft(profile); setEditing('interests'); }} />
            {profile.interests.length === 0 ? (
              <Pressable style={s.emptyCard} onPress={() => { setDraft(profile); setEditing('interests'); }}>
                <Text style={s.muted}>Add the areas of life you're working on, like Fitness, Family or Projects.</Text>
              </Pressable>
            ) : (
              <View style={s.chips}>
                {profile.interests.map((i) => <View key={i} style={s.chip}><Text style={s.chipText}>{i}</Text></View>)}
                <Pressable style={s.chipAdd} onPress={() => { setDraft(profile); setEditing('interests'); }}><Ionicons name="add" size={20} color={T} /></Pressable>
              </View>
            )}

            <Head title="ABOUT ME" action="Edit" onAction={() => { setDraft(profile); setEditing('about'); }} />
            <Pressable style={s.about} onPress={() => { setDraft(profile); setEditing('about'); }}>
              <Text style={profile.about ? s.aboutText : s.muted}>{profile.about || 'Tell people who you are and what you are building toward.'}</Text>
            </Pressable>
          </>
        )}

        {/* ===== HISTORY ===== */}
        {tab === 'history' && (
          <>
            <Head title={`WINS · ${wins.length}`} />
            {wins.length === 0 && <View style={s.emptyCard}><Text style={s.muted}>Your wins will build up here as you complete Next Moves.</Text></View>}
            {wins.slice(0, 100).map((w, i) => {
              const d = rowDate(w);
              return (
                <View key={String(w.id ?? i)} style={s.histRow}>
                  <View style={s.histDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.histTitle}>{winTitle(w)}</Text>
                    {!!d && <Text style={s.muted}>{d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
                  </View>
                </View>
              );
            })}
            {wins.length > 100 && <Text style={[s.muted, { textAlign: 'center', marginTop: 10 }]}>Showing your latest 100 wins.</Text>}
          </>
        )}

        {/* ===== PATTERNS ===== */}
        {tab === 'patterns' && (
          <>
            <Head title="WHAT YOU ACTUALLY DO" />
            <View style={s.tiles}>
              <Tile icon="calendar-outline" l="Last 7 days" v={String(wins7)} />
              <Tile icon="calendar-number-outline" l="Last 30 days" v={String(wins30)} />
              <Tile icon="flame-outline" l="Streak" v={`${streak}d`} />
              <Tile icon="trophy-outline" l="All wins" v={String(wins.length)} />
            </View>
            <Head title="WINS BY DAY · LAST 90 DAYS" />
            <View style={s.chartCard}>
              <View style={s.bars}>
                {weekdayCounts.map((n, i) => (
                  <View key={i} style={s.barCol}>
                    <Text style={s.barNum}>{n || ''}</Text>
                    <View style={[s.bar, { height: maxDay ? Math.max(6, (n / maxDay) * 90) : 6 }, n === maxDay && maxDay > 0 && { backgroundColor: G }]} />
                    <Text style={s.barLab}>{WK[i]}</Text>
                  </View>
                ))}
              </View>
              <Text style={[s.muted, { marginTop: 14 }]}>{bestDay ? `Your strongest day is ${bestDay}. Schedule your hardest Moves there.` : 'Complete a few Moves and your strongest day shows up here.'}</Text>
            </View>
            <Text style={[s.muted, { marginTop: 14 }]}>Streak counts consecutive days with at least one win. Missing today doesn't break it until the day ends.</Text>
          </>
        )}


      </ScrollView>

      {/* ===== PRIVATE YOU PERSONALIZATION ===== */}
      <Modal visible={customizing} transparent animationType="slide" onRequestClose={() => setCustomizing(false)}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setCustomizing(false)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.personalizeLabel}>MAKE IT YOURS</Text>
            <Text style={s.personalizeTitle}>Your story. Your space.</Text>
            <Text style={s.personalizeBody}>The gold signature look is the default. Add your own photo only if you want it. Images stay on this device and are not shared with your Circle.</Text>
            <Text style={s.personalizeSection}>PROFILE PHOTO</Text>
            <View style={s.personalizeActions}>
              <Pressable disabled={photoBusy} style={s.personalizeAction} onPress={() => void changeYouPhoto('portrait', 'camera')}><Ionicons name="camera-outline" color={G} size={18}/><Text style={s.personalizeActionText}>Camera</Text></Pressable>
              <Pressable disabled={photoBusy} style={s.personalizeAction} onPress={() => void changeYouPhoto('portrait', 'library')}><Ionicons name="images-outline" color={G} size={18}/><Text style={s.personalizeActionText}>Photos</Text></Pressable>
            </View>
            <Text style={s.personalizeSection}>PERSONAL BACKGROUND</Text>
            <View style={s.personalizeActions}>
              <Pressable disabled={photoBusy} style={s.personalizeAction} onPress={() => void changeYouPhoto('background', 'camera')}><Ionicons name="camera-outline" color={G} size={18}/><Text style={s.personalizeActionText}>Camera</Text></Pressable>
              <Pressable disabled={photoBusy} style={s.personalizeAction} onPress={() => void changeYouPhoto('background', 'library')}><Ionicons name="images-outline" color={G} size={18}/><Text style={s.personalizeActionText}>Photos</Text></Pressable>
            </View>
            <Pressable style={s.personalizeRestore} disabled={photoBusy} onPress={() => void restoreDefaultYouArt()}>
              <Ionicons name="refresh-outline" color={G} size={19} />
              <Text style={s.personalizeRestoreText}>RESTORE SIGNATURE BLACK + GOLD</Text>
            </Pressable>
            <Pressable style={s.secondary} onPress={() => setCustomizing(false)}><Text style={s.secondaryText}>DONE</Text></Pressable>
          </View>
        </View>
      </Modal>

      {/* ===== EDIT SHEETS ===== */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditing(null)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <ScrollView keyboardShouldPersistTaps="handled">
              {editing === 'profile' && (
                <>
                  <Text style={s.cap}>NAME</Text>
                  <TextInput value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Your name" placeholderTextColor={M} style={s.input} maxLength={40} />
                  <Text style={[s.cap, { marginTop: 18 }]}>YOUR LINE</Text>
                  <TextInput value={draft.tagline} onChangeText={(v) => setDraft({ ...draft, tagline: v })} placeholder={DEFAULT_TAGLINE} placeholderTextColor={M} style={[s.input, { minHeight: 70 }]} multiline maxLength={120} />
                </>
              )}
              {editing === 'about' && (
                <>
                  <Text style={s.cap}>ABOUT ME</Text>
                  <TextInput value={draft.about} onChangeText={(v) => setDraft({ ...draft, about: v })} placeholder="Who you are and what you are building toward" placeholderTextColor={M} style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]} multiline maxLength={400} />
                  <Text style={[s.muted, { textAlign: 'right' }]}>{draft.about.length}/400</Text>
                </>
              )}
              {editing === 'interests' && (
                <>
                  <Text style={s.cap}>TAP TO ADD OR REMOVE</Text>
                  <View style={[s.chips, { marginTop: 12 }]}>
                    {[...new Set([...SUGGESTED, ...draft.interests])].map((i) => {
                      const on = draft.interests.includes(i);
                      return (
                        <Pressable key={i} onPress={() => setDraft({ ...draft, interests: on ? draft.interests.filter((x) => x !== i) : [...draft.interests, i] })} style={[s.chip, on && s.chipOn]}>
                          <Text style={[s.chipText, on && { color: '#080808' }]}>{i}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={[s.row, { marginTop: 18 }]}>
                    <TextInput value={custom} onChangeText={setCustom} placeholder="Add your own" placeholderTextColor={M} style={[s.input, { flex: 1 }]} maxLength={20} />
                    <Pressable style={s.addBtn} onPress={() => { const v = custom.trim(); if (v && !draft.interests.includes(v)) setDraft({ ...draft, interests: [...draft.interests, v] }); setCustom(''); }}>
                      <Text style={s.addBtnText}>ADD</Text>
                    </Pressable>
                  </View>
                </>
              )}
              <Pressable style={s.primary} onPress={() => void saveProfile(draft)} disabled={saving}>
                <Text style={s.primaryText}>{saving ? 'SAVING…' : 'SAVE'}</Text>
              </Pressable>
              <Pressable style={s.secondary} onPress={() => { setDraft(profile); setEditing(null); }}><Text style={s.secondaryText}>CANCEL</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== SETTINGS ===== */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setMenu(false)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.cap}>ACCOUNT</Text>
            <Text style={[s.aboutText, { marginTop: 6 }]}>{email}</Text>
            <Pressable style={s.secondary} onPress={() => { setMenu(false); void logout(); }}><Text style={s.secondaryText}>SIGN OUT</Text></Pressable>
            <Pressable style={s.secondary} onPress={() => setMenu(false)}><Text style={s.secondaryText}>CLOSE</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- small components ---------- */

function Stat({ n, l, last = false }: { n: number; l: string; last?: boolean }) {
  return (
    <View style={[s.stat, !last && s.statDiv]}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{l}</Text>
    </View>
  );
}
function Tile({ icon, l, v }: { icon: keyof typeof Ionicons.glyphMap; l: string; v: string }) {
  return (
    <View style={s.tile}>
      <Ionicons name={icon} size={26} color={G} />
      <Text style={s.tileL}>{l}</Text>
      <Text style={s.tileV}>{v}</Text>
    </View>
  );
}
function Head({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.head}>
      <Text style={s.headT}>{title}</Text>
      {!!action && <Pressable hitSlop={10} onPress={onAction}><Text style={s.headA}>{action}{action === 'See All' ? ' ›' : ''}</Text></Pressable>}
    </View>
  );
}

const s = StyleSheet.create({
  heroPanel: { marginTop: 22, backgroundColor: '#0A0907', minHeight: 250, overflow: 'hidden', borderRadius: 26, borderWidth: 1, borderColor: '#84642C', paddingHorizontal: 17, paddingTop: 16, paddingBottom: 18 },
  heroArt: { ...StyleSheet.absoluteFillObject },
  heroBackground: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.59)' },
  heroTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroIdentity: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroTopText: { color: '#DCC17E', letterSpacing: 1.5, fontSize: 10, fontWeight: '900' },
  customizePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#886A35', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(0,0,0,0.33)' },
  customizeText: { color: '#E8C36A', letterSpacing: 0.5, fontSize: 10, fontWeight: '800' },
  avatarPhoto: { width: '100%', height: '100%', borderRadius: 53 },
  heroFooter: { marginTop: 19, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroGoldLine: { width: 30, height: 1, backgroundColor: '#CA9E46' },
  heroFootText: { color: '#DCC17E', letterSpacing: 2, fontSize: 8, fontWeight: '800' },
  personalizeLabel: { color: G, letterSpacing: 1.8, fontWeight: '900', fontSize: 11 },
  personalizeTitle: { color: T, fontWeight: '900', fontSize: 25, marginTop: 8 },
  personalizeBody: { color: M, fontSize: 13, lineHeight: 20, marginTop: 9 },
  personalizeSection: { marginTop: 20, marginBottom: 10, fontSize: 11, letterSpacing: 1, color: G, fontWeight: '800' },
  personalizeActions: { flexDirection: 'row', gap: 10 },
  personalizeAction: { flex: 1, borderWidth: 1, borderColor: '#63502C', backgroundColor: '#1D1A13', paddingVertical: 14, borderRadius: 14, justifyContent: 'center', alignItems: 'center', gap: 8 },
  personalizeActionText: { color: '#E8DFCC', fontSize: 13, fontWeight: '700' },
  personalizeRestore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, borderWidth: 1, borderColor: '#6B5129', borderRadius: 14, paddingVertical: 15 },
  personalizeRestoreText: { color: G, fontWeight: '800', letterSpacing: 0.4, fontSize: 11 },
  todayPreview: { marginTop: 25, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#69512B', backgroundColor: '#18150F' },
  circlePreview: { marginTop: 12, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#35312B', backgroundColor: '#121111' },
  previewHeading: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  previewCap: { color: G, flex: 1, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  previewTitle: { color: T, fontSize: 22, fontWeight: '800', marginTop: 12 },
  previewBody: { color: '#BDB8AC', fontSize: 13, lineHeight: 19, marginTop: 8 },
  previewLink: { color: G, fontSize: 11, fontWeight: '900', letterSpacing: 0.9, marginTop: 14 },
  circleCount: { color: G, fontSize: 12, fontWeight: '900' },
  circleFaces: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'center' },
  circleSlot: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#1D1B18', borderWidth: 1, borderColor: '#63502B', alignItems: 'center', justifyContent: 'center' },
  circleFilled: { backgroundColor: '#30271A', borderColor: G },
  circleInitial: { color: G, fontWeight: '800', fontSize: 16 },
  page: { flex: 1, backgroundColor: BG },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 60 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: G, fontWeight: '900', letterSpacing: 3, fontSize: 15 },
  topIcons: { flexDirection: 'row', alignItems: 'center' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: 25 },
  avatarRing: { width: 124, height: 124, borderRadius: 62, borderWidth: 4, borderColor: G, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 106, height: 106, borderRadius: 53, backgroundColor: '#1A1608', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: G, fontSize: 36, fontWeight: '900' },
  pencil: { position: 'absolute', right: 2, bottom: 4, width: 32, height: 32, borderRadius: 16, backgroundColor: G, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: BG },
  name: { color: T, fontSize: 28, fontWeight: '800' },
  stay: { color: M, fontSize: 13, fontWeight: '800', letterSpacing: 4, marginTop: 8 },
  tag: { color: T, fontSize: 15, lineHeight: 22, marginTop: 10, opacity: 0.9 },
  statsRow: { flexDirection: 'row', marginTop: 26 },
  stat: { flex: 1, alignItems: 'center' },
  statDiv: { borderRightWidth: 1, borderRightColor: LINE },
  statN: { color: T, fontSize: 30, fontWeight: '800' },
  statL: { color: M, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginTop: 4 },
  becomes: { flexDirection: 'row', alignItems: 'center', backgroundColor: C, borderWidth: 1, borderColor: LINE, borderRadius: 20, padding: 16, marginTop: 24, gap: 14 },
  bookWrap: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  cap: { color: M, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  becomesText: { color: T, fontSize: 15, lineHeight: 21, marginTop: 6 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: LINE, borderRadius: 22, padding: 4, marginTop: 18 },
  tabBtn: { flex: 1, paddingVertical: 13, borderRadius: 18, alignItems: 'center' },
  tabOn: { backgroundColor: G },
  tabText: { color: M, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  tabTextOn: { color: '#080808' },
  latest: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#14110A', borderWidth: 1, borderColor: '#4A3C14', borderRadius: 20, padding: 16, marginTop: 16, gap: 14 },
  trophyWrap: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: '#3A3A3A', backgroundColor: '#0B0B0B', alignItems: 'center', justifyContent: 'center' },
  latestBig: { color: T, fontSize: 21, fontWeight: '800', marginTop: 4 },
  muted: { color: M, fontSize: 13, lineHeight: 19, marginTop: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  headT: { color: T, fontSize: 14, fontWeight: '900', letterSpacing: 1.6 },
  headA: { color: G, fontSize: 14, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: C, borderWidth: 1, borderColor: LINE, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  tileL: { color: M, fontSize: 13, marginTop: 8, textAlign: 'center' },
  tileV: { color: T, fontSize: 26, fontWeight: '800', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#3A3A3A', backgroundColor: '#111', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16 },
  chipOn: { backgroundColor: G, borderColor: G },
  chipText: { color: T, fontSize: 14, fontWeight: '600' },
  chipAdd: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#3A3A3A', alignItems: 'center', justifyContent: 'center' },
  about: { backgroundColor: C, borderWidth: 1, borderColor: LINE, borderRadius: 20, padding: 18 },
  aboutText: { color: T, fontSize: 16, lineHeight: 23 },
  emptyCard: { backgroundColor: C, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 18 },
  histRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 14, marginBottom: 8 },
  histDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: G, marginTop: 6, marginRight: 12 },
  histTitle: { color: T, fontSize: 15, fontWeight: '700' },
  chartCard: { backgroundColor: C, borderWidth: 1, borderColor: LINE, borderRadius: 20, padding: 18 },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 130 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 6, backgroundColor: '#4B4122' },
  barNum: { color: M, fontSize: 11, marginBottom: 4, height: 14 },
  barLab: { color: M, fontSize: 11, fontWeight: '800', marginTop: 6 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' },
  sheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: '#333', padding: 22, paddingBottom: 34, maxHeight: '86%' },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: '#444', alignSelf: 'center', marginBottom: 18 },
  input: { color: T, fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 10, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  addBtn: { marginLeft: 10, backgroundColor: G, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16 },
  addBtnText: { color: '#080808', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  primary: { backgroundColor: G, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  primaryText: { color: '#080808', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  secondary: { borderWidth: 1, borderColor: '#4B4122', borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  secondaryText: { color: G, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
});
