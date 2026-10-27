import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const G = '#E8B93A', C = '#101010', T = '#F4F1E8', M = '#9C9A92', LINE = '#2A2A2A';
const TODAY_ROUTE = '/today'; // change to your Today / Next Move route
const MAX_CIRCLE = 5;

type Member = { conn_id: string; member_id: string; display_name: string; tagline: string; interests: string[]; status: string; incoming: boolean };
type CircleGoal = { goal_id: string; owner_id: string; title: string; category: string | null; target_date: string | null; needs_push: boolean; next_move: string | null; next_minutes: number | null };
type CircleWin = { win_id: string; owner_id: string; title: string; summary: string | null; created_at: string; cheer_count: number; cheered_by_me: boolean };
type Note = { note_id: string; from_name: string; goal_title: string; message: string; created_at: string };
type MyGoal = { id: string; title: string; circle_visible: boolean; needs_push: boolean };
type MyWin = { id: string; title: string; circle_visible: boolean; created_at: string };

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

export default function Social() {
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [uid, setUid] = useState('');
  const [myCode, setMyCode] = useState('');
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [goals, setGoals] = useState<CircleGoal[]>([]);
  const [wins, setWins] = useState<CircleWin[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [mineGoals, setMineGoals] = useState<MyGoal[]>([]);
  const [mineWins, setMineWins] = useState<MyWin[]>([]);
  const [pushFor, setPushFor] = useState<CircleGoal | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);

      // make sure this user has a profile (and with it, an invite code)
      let { data: prof, error: pe } = await supabase.from('profiles').select('invite_code').eq('id', user.id).maybeSingle();
      if (pe) throw pe;
      if (!prof) {
        const meta: any = user.user_metadata || {};
        const { error: ie } = await supabase.from('profiles').insert({
          id: user.id,
          display_name: String(meta.full_name || (user.email ? user.email.split('@')[0] : '')),
          tagline: String(meta.tagline || ''),
          about: String(meta.about || ''),
          interests: Array.isArray(meta.interests) ? meta.interests.map(String) : [],
        });
        if (ie && (ie as any).code !== '23505') throw ie;
        const again = await supabase.from('profiles').select('invite_code').eq('id', user.id).maybeSingle();
        prof = again.data;
      }
      setMyCode(prof?.invite_code || '');

      const [m, g, w, n, mg, mw] = await Promise.all([
        supabase.rpc('circle_members'),
        supabase.rpc('circle_goals'),
        supabase.rpc('circle_wins'),
        supabase.rpc('my_notes'),
        supabase.from('goals').select('id,title,circle_visible,needs_push').eq('user_id', user.id).eq('status', 'active').is('archived_at', null).order('updated_at', { ascending: false }).limit(20),
        supabase.from('wins').select('id,title,circle_visible,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      ]);
      const failed = [m, g, w, n, mg, mw].find((r) => r.error);
      if (failed?.error) throw failed.error;

      setMembers((m.data as Member[]) || []);
      setGoals((g.data as CircleGoal[]) || []);
      setWins((w.data as CircleWin[]) || []);
      setNotes((n.data as Note[]) || []);
      setMineGoals((mg.data as MyGoal[]) || []);
      setMineWins((mw.data as MyWin[]) || []);
      setSetupError('');
    } catch (e: any) {
      setSetupError(e?.message || 'Could not load your circle.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => PromiseLike<{ error: any }>) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { Alert.alert('Could not do that', error.message || 'Please try again.'); return false; }
    await load();
    return true;
  }

  async function connect() {
    const code = entry.trim();
    if (!code) return;
    const ok = await act(() => supabase.rpc('request_connection', { p_code: code }));
    if (ok) { setEntry(''); Alert.alert('Request sent', 'They will see your request under YOU → YOUR CIRCLE → INNER 5.'); }
  }

  function confirmRemove(m: Member) {
    Alert.alert('Remove from circle', `Stop sharing with ${m.display_name || 'this person'}? They will no longer see anything of yours.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void act(() => supabase.rpc('remove_connection', { p_conn: m.conn_id })) },
    ]);
  }

  async function cheer(w: CircleWin) {
    setWins((list) => list.map((x) => (x.win_id === w.win_id ? { ...x, cheered_by_me: !x.cheered_by_me, cheer_count: x.cheer_count + (x.cheered_by_me ? -1 : 1) } : x)));
    const { error } = await supabase.rpc('cheer_win', { p_win: w.win_id });
    if (error) { Alert.alert('Could not cheer', error.message); void load(); }
  }

  async function sendPush() {
    if (!pushFor) return;
    const text = msg.trim();
    if (!text) return;
    const ok = await act(() => supabase.rpc('send_note', { p_goal: pushFor.goal_id, p_message: text }));
    if (ok) { setPushFor(null); setMsg(''); Alert.alert('Sent', 'Short and useful is the point.'); }
  }

  async function patchGoal(g: MyGoal, patch: Partial<MyGoal>) {
    setMineGoals((l) => l.map((x) => (x.id === g.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from('goals').update(patch).eq('id', g.id).eq('user_id', uid);
    if (error) { Alert.alert('Could not update', error.message); void load(); }
  }
  async function patchWin(w: MyWin, visible: boolean) {
    setMineWins((l) => l.map((x) => (x.id === w.id ? { ...x, circle_visible: visible } : x)));
    const { error } = await supabase.from('wins').update({ circle_visible: visible }).eq('id', w.id).eq('user_id', uid);
    if (error) { Alert.alert('Could not update', error.message); void load(); }
  }

  if (loading) return <View style={{ paddingVertical: 40 }}><ActivityIndicator color={G} /></View>;

  if (setupError) {
    return (
      <View style={[s.card, { marginTop: 18 }]}>
        <Text style={s.big}>Your circle is not ready yet.</Text>
        <Text style={s.muted}>{setupError}</Text>
        <Text style={s.muted}>If this is the first time, run circle.sql in the Supabase SQL editor, then reopen this tab.</Text>
        <Pressable style={s.secondary} onPress={() => { setLoading(true); void load(); }}><Text style={s.secondaryText}>TRY AGAIN</Text></Pressable>
      </View>
    );
  }

  const accepted = members.filter((m) => m.status === 'accepted');
  const incoming = members.filter((m) => m.status === 'pending' && m.incoming);
  const outgoing = members.filter((m) => m.status === 'pending' && !m.incoming);
  const nameOf = (id: string) => members.find((m) => m.member_id === id)?.display_name || 'Someone';
  const needsPush = goals.filter((g) => g.needs_push);
  const otherGoals = goals.filter((g) => !g.needs_push);

  return (
    <View>
      {/* ----- connect ----- */}
      <Head title={`YOUR CIRCLE · ${accepted.length}/${MAX_CIRCLE}`} />
      <View style={s.card}>
        <Text style={s.cap}>YOUR INVITE CODE</Text>
        <Text style={s.code}>{myCode ? (myCode.match(/.{1,4}/g) || []).join(' ') : '—'}</Text>
        <Text style={s.muted}>Give it to someone you trust. Only people with your code can request to connect, and you approve each one.</Text>
        <Pressable
          style={s.primary}
          onPress={() => void Share.share({ message: `Connect with me in GOAL'D IN's Inner 5. Open YOU → YOUR CIRCLE → INNER 5, enter my code, and request a connection. I'll approve it before anything is shared. Code: ${(myCode.match(/.{1,4}/g) || []).join(' ')}` })}
          disabled={!myCode}
        >
          <Text style={s.primaryText}>SHARE MY CODE</Text>
        </Pressable>
        <Text style={[s.cap, { marginTop: 20 }]}>HAVE A CODE?</Text>
        <View style={s.row}>
          <TextInput value={entry} onChangeText={(v) => setEntry(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} placeholder="Enter their code" placeholderTextColor={M} style={[s.input, { flex: 1 }]} autoCapitalize="characters" autoCorrect={false} maxLength={12} />
          <Pressable style={s.addBtn} onPress={() => void connect()} disabled={busy}><Text style={s.addBtnText}>CONNECT</Text></Pressable>
        </View>
      </View>

      {incoming.map((m) => (
        <View key={m.conn_id} style={s.card}>
          <Text style={s.cap}>REQUEST</Text>
          <Text style={s.big}>{m.display_name || 'Someone'} wants to join your circle</Text>
          <Text style={s.muted}>Accepting lets each of you see only what the other chooses to share.</Text>
          <View style={[s.row, { marginTop: 14, gap: 10 }]}>
            <Pressable style={[s.primary, { flex: 1, marginTop: 0 }]} onPress={() => void act(() => supabase.rpc('respond_connection', { p_conn: m.conn_id, p_accept: true }))} disabled={busy}><Text style={s.primaryText}>ACCEPT</Text></Pressable>
            <Pressable style={[s.secondary, { flex: 1, marginTop: 0 }]} onPress={() => void act(() => supabase.rpc('respond_connection', { p_conn: m.conn_id, p_accept: false }))} disabled={busy}><Text style={s.secondaryText}>DECLINE</Text></Pressable>
          </View>
        </View>
      ))}
      {outgoing.map((m) => (
        <View key={m.conn_id} style={s.card}>
          <Text style={s.muted}>Waiting for {m.display_name || 'them'} to accept.</Text>
          <Pressable onPress={() => void act(() => supabase.rpc('remove_connection', { p_conn: m.conn_id }))}><Text style={[s.link, { marginTop: 8 }]}>Cancel request</Text></Pressable>
        </View>
      ))}

      {accepted.length === 0 ? (
        <View style={s.card}>
          <Text style={s.big}>Start with one person.</Text>
          <Text style={s.muted}>One partner who knows what you are working on is enough. Quality beats size here.</Text>
        </View>
      ) : (
        accepted.map((m) => (
          <View key={m.conn_id} style={s.card}>
            <View style={s.row}>
              <View style={s.avatar}><Text style={s.avatarText}>{(m.display_name || '?').slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.big}>{m.display_name || 'Partner'}</Text>
                {!!m.tagline && <Text style={s.muted} numberOfLines={2}>{m.tagline}</Text>}
              </View>
              <Pressable hitSlop={10} onPress={() => confirmRemove(m)}><Ionicons name="close" size={20} color={M} /></Pressable>
            </View>
          </View>
        ))
      )}

      {/* ----- notes for you ----- */}
      {notes.length > 0 && (
        <>
          <Head title="NOTES FOR YOU" />
          {notes.map((n) => (
            <View key={n.note_id} style={s.card}>
              <Text style={s.cap}>{(n.from_name || 'Someone').toUpperCase()} · {n.goal_title}</Text>
              <Text style={s.noteText}>{n.message}</Text>
              <Text style={s.muted}>{ago(n.created_at)}</Text>
            </View>
          ))}
        </>
      )}

      {/* ----- what your circle shared ----- */}
      {accepted.length > 0 && (
        <>
          {needsPush.length > 0 && (
            <>
              <Head title="ASKING FOR A PUSH" />
              {needsPush.map((g) => (
                <View key={g.goal_id} style={[s.card, s.cardGold]}>
                  <Text style={s.cap}>{nameOf(g.owner_id).toUpperCase()}</Text>
                  <Text style={s.big}>{g.title}</Text>
                  <NextMoveLine g={g} />
                  <Pressable style={s.primary} onPress={() => { setMsg(''); setPushFor(g); }}><Text style={s.primaryText}>SEND A PUSH</Text></Pressable>
                </View>
              ))}
            </>
          )}

          <Head title="WINS · LAST 14 DAYS" />
          {wins.length === 0 && <View style={s.card}><Text style={s.muted}>Nothing shared recently.</Text></View>}
          {wins.map((w) => (
            <View key={w.win_id} style={s.card}>
              <Text style={s.cap}>{nameOf(w.owner_id).toUpperCase()} · {ago(w.created_at).toUpperCase()}</Text>
              <Text style={s.big}>{w.title}</Text>
              {!!w.summary && <Text style={s.muted}>{w.summary}</Text>}
              <Pressable style={[s.cheer, w.cheered_by_me && s.cheerOn]} onPress={() => void cheer(w)}>
                <Ionicons name={w.cheered_by_me ? 'flame' : 'flame-outline'} size={16} color={w.cheered_by_me ? '#080808' : G} />
                <Text style={[s.cheerText, w.cheered_by_me && { color: '#080808' }]}>{w.cheered_by_me ? 'CHEERED' : 'CHEER'}{w.cheer_count > 0 ? ` · ${w.cheer_count}` : ''}</Text>
              </Pressable>
            </View>
          ))}

          {otherGoals.length > 0 && (
            <>
              <Head title="WHAT THEY'RE WORKING ON" />
              {otherGoals.map((g) => (
                <View key={g.goal_id} style={s.card}>
                  <Text style={s.cap}>{nameOf(g.owner_id).toUpperCase()}{g.category ? ` · ${g.category.toUpperCase()}` : ''}</Text>
                  <Text style={s.big}>{g.title}</Text>
                  <NextMoveLine g={g} />
                  <Pressable onPress={() => { setMsg(''); setPushFor(g); }}><Text style={[s.link, { marginTop: 10 }]}>Send a note</Text></Pressable>
                </View>
              ))}
            </>
          )}

          <View style={[s.card, s.cardGold, { alignItems: 'center' }]}>
            <Text style={s.big}>You're caught up.</Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>That's everything new. Your own Next Move is the thing that counts today.</Text>
            <Pressable style={s.primary} onPress={() => router.push(TODAY_ROUTE as any)}><Text style={s.primaryText}>BACK TO MY NEXT MOVE</Text></Pressable>
          </View>
        </>
      )}

      {/* ----- what you share ----- */}
      <Head title="WHAT YOU SHARE" />
      <Text style={s.muted}>Everything is private until you switch it on. Only your accepted circle can see what you share.</Text>

      <Text style={[s.cap, { marginTop: 16 }]}>GOALS</Text>
      {mineGoals.length === 0 && <View style={s.card}><Text style={s.muted}>No active goals yet.</Text></View>}
      {mineGoals.map((g) => (
        <View key={g.id} style={s.card}>
          <Text style={s.big}>{g.title}</Text>
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Share with my circle</Text>
            <Toggle on={g.circle_visible} onPress={() => void patchGoal(g, g.circle_visible ? { circle_visible: false, needs_push: false } : { circle_visible: true })} />
          </View>
          {g.circle_visible && (
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>Ask for a push</Text>
              <Toggle on={g.needs_push} onPress={() => void patchGoal(g, { needs_push: !g.needs_push })} />
            </View>
          )}
        </View>
      ))}

      <Text style={[s.cap, { marginTop: 16 }]}>RECENT WINS</Text>
      {mineWins.length === 0 && <View style={s.card}><Text style={s.muted}>Your wins will appear here.</Text></View>}
      {mineWins.map((w) => (
        <View key={w.id} style={s.card}>
          <Text style={s.big}>{w.title}</Text>
          <Text style={s.muted}>{ago(w.created_at)}</Text>
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Share with my circle</Text>
            <Toggle on={w.circle_visible} onPress={() => void patchWin(w, !w.circle_visible)} />
          </View>
        </View>
      ))}

      {/* ----- push note sheet ----- */}
      <Modal visible={!!pushFor} transparent animationType="slide" onRequestClose={() => setPushFor(null)}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setPushFor(null)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.cap}>{pushFor ? nameOf(pushFor.owner_id).toUpperCase() : ''}</Text>
            <Text style={s.big}>{pushFor?.title}</Text>
            <TextInput value={msg} onChangeText={setMsg} placeholder="One useful sentence" placeholderTextColor={M} style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={140} />
            <Text style={[s.muted, { textAlign: 'right' }]}>{msg.length}/140 · one note per goal every 24 hours</Text>
            <Pressable style={s.primary} onPress={() => void sendPush()} disabled={busy || !msg.trim()}><Text style={s.primaryText}>{busy ? 'SENDING…' : 'SEND'}</Text></Pressable>
            <Pressable style={s.secondary} onPress={() => setPushFor(null)}><Text style={s.secondaryText}>CANCEL</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NextMoveLine({ g }: { g: CircleGoal }) {
  if (!g.next_move) return null;
  return (
    <View style={s.moveLine}>
      <Text style={s.cap}>NEXT MOVE{g.next_minutes ? ` · ${g.next_minutes} MIN` : ''}</Text>
      <Text style={s.moveText}>{g.next_move}</Text>
    </View>
  );
}

function Head({ title }: { title: string }) {
  return <View style={s.head}><Text style={s.headT}>{title}</Text></View>;
}
function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.tgl, on && s.tglOn]}>
      <View style={[s.knob, on && s.knobOn]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { marginTop: 28, marginBottom: 12 },
  headT: { color: T, fontSize: 14, fontWeight: '900', letterSpacing: 1.6 },
  card: { backgroundColor: C, borderWidth: 1, borderColor: LINE, borderRadius: 20, padding: 18, marginBottom: 10 },
  cardGold: { backgroundColor: '#14110A', borderColor: '#4A3C14' },
  cap: { color: M, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  big: { color: T, fontSize: 17, fontWeight: '800', marginTop: 4 },
  muted: { color: M, fontSize: 13, lineHeight: 19, marginTop: 4 },
  moveLine: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE },
  moveText: { color: T, fontSize: 15, lineHeight: 21, marginTop: 4 },
  noteText: { color: T, fontSize: 16, lineHeight: 22, marginTop: 6 },
  code: { color: G, fontSize: 26, fontWeight: '900', letterSpacing: 3, marginTop: 6 },
  link: { color: G, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1608', borderWidth: 1, borderColor: '#4A3C14', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: G, fontWeight: '900', fontSize: 18 },
  input: { color: T, fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 10, marginTop: 6 },
  addBtn: { marginLeft: 10, backgroundColor: G, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14 },
  addBtnText: { color: '#080808', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  primary: { backgroundColor: G, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#080808', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  secondary: { borderWidth: 1, borderColor: '#4B4122', borderRadius: 15, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  secondaryText: { color: G, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  cheer: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#4B4122', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14, marginTop: 12 },
  cheerOn: { backgroundColor: G, borderColor: G },
  cheerText: { color: G, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  toggleLabel: { color: T, fontSize: 14 },
  tgl: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#2A2A2A', padding: 3, justifyContent: 'center' },
  tglOn: { backgroundColor: G },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#888' },
  knobOn: { backgroundColor: '#080808', alignSelf: 'flex-end' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' },
  sheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: '#333', padding: 22, paddingBottom: 34 },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: '#444', alignSelf: 'center', marginBottom: 18 },
});
