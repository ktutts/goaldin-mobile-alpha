import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import SocialCircle from '@/components/SocialCircle';

const GOLD = '#E7BA55';
const BG = '#070707';
const CARD = '#151411';
const TEXT = '#F6F2E8';
const DIM = '#B3ADA1';
const LINE = '#403725';

type Panel = 'inner' | 'network' | 'teams';
type NetworkPerson = {
  conn_id: string; member_id: string; display_name: string; tagline: string | null;
  status: 'pending' | 'accepted'; incoming: boolean;
  available_to_help: boolean; help_topics: string[]; help_modes: string[];
};
type InnerPerson = { conn_id: string; member_id: string; display_name: string; status: string; incoming: boolean };
type MyGoal = { id: string; title: string };
type TeamRow = {
  invite_id: string; goal_id: string; goal_title: string; person_id: string; person_name: string;
  role: 'supporter' | 'advisor' | 'teammate'; access_scope: 'title_only' | 'current_move';
  status: 'pending' | 'accepted'; incoming: boolean; invitation_note: string;
};
type Preferences = { available_to_help: boolean; help_topics: string[]; help_modes: string[] };
type TeamMove = { goal_id: string; move_title: string | null };
type TeamMessage = { message_id: string; invite_id: string; from_name: string; message: string; created_at: string };
const TOPICS = ['Restoration', 'Fitness', 'Running', 'Business', 'Career', 'Learning', 'Creative', 'Home'];
const HELP_MODES = [
  { id: 'encouragement', label: 'Encouragement' },
  { id: 'advice', label: 'Advice' },
  { id: 'hands_on', label: 'Hands-on help' },
  { id: 'accountability', label: 'Accountability' },
];

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.segment, active && styles.segmentOn]}>
      <Text style={[styles.segmentText, active && styles.segmentTextOn]}>{label}</Text>
    </Pressable>
  );
}
function Heading({ title, description }: { title: string; description?: string }) {
  return (
    <View style={{ marginTop: 22, marginBottom: 11 }}>
      <Text style={styles.heading}>{title}</Text>
      {description ? <Text style={styles.muted}>{description}</Text> : null}
    </View>
  );
}
function GoldButton({ title, onPress, disabled = false, muted = false }: { title: string; onPress: () => void; disabled?: boolean; muted?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, muted && styles.outline, disabled && { opacity: 0.45 }]}>
      <Text style={[styles.buttonText, muted && { color: GOLD }]}>{title}</Text>
    </Pressable>
  );
}
function Avatar({ name }: { name: string }) {
  return <View style={styles.avatar}><Text style={styles.avatarText}>{(name || '?').slice(0, 1).toUpperCase()}</Text></View>;
}
function SelectChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function CircleScreen() {
  const [panel, setPanel] = useState<Panel>('inner');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [networkReady, setNetworkReady] = useState(true);
  const [error, setError] = useState('');
  const [myCode, setMyCode] = useState('');
  const [code, setCode] = useState('');
  const [network, setNetwork] = useState<NetworkPerson[]>([]);
  const [inner, setInner] = useState<InnerPerson[]>([]);
  const [myGoals, setMyGoals] = useState<MyGoal[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [teamMoves, setTeamMoves] = useState<TeamMove[]>([]);
  const [teamMessages, setTeamMessages] = useState<TeamMessage[]>([]);
  const [messageDrafts, setMessageDrafts] = useState<Record<string,string>>({});
  const [prefs, setPrefs] = useState<Preferences>({ available_to_help: false, help_topics: [], help_modes: [] });
  const [editOffer, setEditOffer] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSource, setInviteSource] = useState<'network' | 'new' | null>(null);
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [goalId, setGoalId] = useState('');
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState<TeamRow['role']>('supporter');
  const [scope, setScope] = useState<TeamRow['access_scope']>('title_only');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;
    if (!user) {
      setError('Sign in to open your Circle.'); setLoading(false); return;
    }
    try {
      // Same private per-user invite code already used by the existing Inner 5.
      let profile = await supabase.from('profiles').select('invite_code').eq('id', user.id).maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data) {
        const meta: any = user.user_metadata || {};
        const insert = await supabase.from('profiles').insert({
          id: user.id, display_name: String(meta.full_name || user.email?.split('@')[0] || 'Member'),
          tagline: String(meta.tagline || ''), about: String(meta.about || ''),
          interests: Array.isArray(meta.interests) ? meta.interests : [],
        });
        if (insert.error && insert.error.code !== '23505') throw insert.error;
        profile = await supabase.from('profiles').select('invite_code').eq('id', user.id).maybeSingle();
      }
      setMyCode(String(profile.data?.invite_code || ''));

      const [members, goals] = await Promise.all([
        supabase.rpc('circle_members'),
        supabase.from('goals').select('id,title').eq('user_id', user.id).eq('status', 'active')
          .is('archived_at', null).is('completed_at', null).order('updated_at', { ascending: false }).limit(60),
      ]);
      if (members.error) throw members.error;
      if (goals.error) throw goals.error;
      setInner((members.data || []) as InnerPerson[]);
      setMyGoals((goals.data || []) as MyGoal[]);

      const [people, pref, invitations, moves, messages] = await Promise.all([
        supabase.rpc('network_members'),
        supabase.rpc('my_network_preferences'),
        supabase.rpc('my_goal_team'),
        supabase.rpc('my_goal_team_moves'),
        supabase.rpc('my_goal_team_messages'),
      ]);
      const bad = [people, pref, invitations, moves, messages].find(x => x.error);
      if (bad?.error) {
        // The old Inner 5 still works if the additive migration has not been run.
        setNetworkReady(false);
        setError(`Broader Network and Goal Teams are not ready: ${bad.error.message}`);
      } else {
        setNetworkReady(true);
        setNetwork((people.data || []) as NetworkPerson[]);
        setTeam((invitations.data || []) as TeamRow[]);
        setTeamMoves((moves.data || []) as TeamMove[]);
        setTeamMessages((messages.data || []) as TeamMessage[]);
        const p = (pref.data || [])[0] as Preferences | undefined;
        setPrefs({ available_to_help: Boolean(p?.available_to_help), help_topics: p?.help_topics || [], help_modes: p?.help_modes || [] });
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load Circle right now.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function run(action: () => PromiseLike<{ error: any }>, success?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      if (result.error) throw result.error;
      if (success) Alert.alert('GOAL\'D IN', success);
      await load();
    } catch (e: any) {
      Alert.alert('Could not complete', e?.message || 'Please try again.');
    } finally { setBusy(false); }
  }
  const toggleTopic = (value: string) => setPrefs((p) => ({ ...p, help_topics: p.help_topics.includes(value)
    ? p.help_topics.filter(t => t !== value) : [...p.help_topics, value].slice(0, 8) }));
  const toggleMode = (value: string) => setPrefs((p) => ({ ...p, help_modes: p.help_modes.includes(value)
    ? p.help_modes.filter(t => t !== value) : [...p.help_modes, value] }));
  const acceptedNetwork = network.filter(n => n.status === 'accepted');
  const acceptedInner = inner.filter(n => n.status === 'accepted');
  const acceptedPeople = [...acceptedInner.map(n => ({ id: n.member_id, name: n.display_name || 'Friend', kind: 'Inner 5' })),
    ...acceptedNetwork.filter(n => !acceptedInner.some(i => i.member_id === n.member_id))
      .map(n => ({ id: n.member_id, name: n.display_name || 'Connection', kind: 'Network' }))];
  const selectedGoal = myGoals.find(g => g.id === goalId);
  const selectedPerson = acceptedPeople.find(p => p.id === personId);

  async function shareNewPersonCode() {
    if (!myCode) {
      Alert.alert('Invite code unavailable', 'Return to Circle and refresh before inviting someone.');
      return;
    }
    try {
      // This is an invite to connect, not an unapproved grant of goal access.
      // Do not include the selected goal, its WHY, or its current move here.
      await Share.share({
        title: "Connect on GOAL'D IN",
        message: `I'd like to connect with you on GOAL'D IN so we can help each other make progress.\n\nWhen you're using the current GOAL'D IN app, open YOU → Your Circle → Network, enter my code ${myCode}, and request a connection.\n\nOnce I accept, I can send a separate invitation for the goal I'd like help with. You'll decide whether to join and what to see. Nothing is shared automatically.`,
      });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message || 'Try again or share your code manually.');
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={GOLD} size="large"/></View>;
  return (
    <View style={styles.page}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={19} color={GOLD}/><Text style={styles.backText}>YOU</Text></Pressable>
        <View style={styles.masthead}>
          <Ionicons name="people-circle-outline" size={22} color={GOLD}/>
          <Text style={styles.kicker}>GOAL'D IN · CONNECTION WITH PURPOSE</Text>
        </View>
        <Text style={styles.title}>Your people.{'\n'}Your possibilities.</Text>
        <Text style={styles.description}>Ask for a push. Share a win. Find the right person to help with what matters.</Text>
        <View style={styles.segments}>
          <Segment label="INNER 5" active={panel==='inner'} onPress={() => setPanel('inner')}/>
          <Segment label="NETWORK" active={panel==='network'} onPress={() => setPanel('network')}/>
          <Segment label="GOAL TEAMS" active={panel==='teams'} onPress={() => setPanel('teams')}/>
        </View>

        {!!error && <View style={styles.notice}>
          <Text style={styles.muted}>{error}</Text>
          <GoldButton title="RETRY" muted onPress={() => { setLoading(true); void load(); }}/>
        </View>}

        {panel === 'inner' && (
          <>
            <View style={styles.hint}>
              <Text style={styles.hintTitle}>Your closest people · {acceptedInner.length}/5</Text>
              <Text style={styles.muted}>Your five trusted anchors for encouragement and accountability. The original invitation and sharing controls remain below.</Text>
            </View>
            <SocialCircle />
          </>
        )}

        {panel === 'network' && networkReady && (
          <>
            <Heading title={`YOUR NETWORK · ${acceptedNetwork.length}`} description="Beyond your five closest people. Every connection requires acceptance." />
            <View style={styles.card}>
              <Text style={styles.smallCap}>INVITE A CONNECTION</Text>
              <Text style={styles.muted}>Share your code privately. Enter someone else's code to ask to connect.</Text>
              <Text style={styles.inviteCode}>{(myCode.match(/.{1,4}/g) || []).join(' ') || '—'}</Text>
              <GoldButton title="SHARE MY CODE" muted disabled={!myCode} onPress={() => void Share.share({ message: `Connect with me on GOAL'D IN. Open YOU → Your Circle → Network and enter my code: ${myCode}` })}/>
              <View style={styles.formRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={code} onChangeText={v => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12))} placeholder="Their 12-character code" placeholderTextColor="#847E74" autoCapitalize="characters"/>
                <GoldButton title="REQUEST" disabled={busy || code.length!==12} onPress={() => void run(() => supabase.rpc('request_network_connection',{p_code:code}), 'Connection requested. They choose whether to accept.').then(() => setCode(''))}/>
              </View>
            </View>
            {network.filter(n => n.status === 'pending').map(n => (
              <View key={n.conn_id} style={styles.card}>
                <Text style={styles.smallCap}>{n.incoming ? 'NEW REQUEST' : 'AWAITING ACCEPTANCE'}</Text>
                <Text style={styles.cardTitle}>{n.display_name || 'Member'}</Text>
                {n.incoming ? <View style={styles.formRow}>
                  <GoldButton title="ACCEPT" disabled={busy} onPress={() => void run(() => supabase.rpc('respond_network_connection',{p_conn:n.conn_id,p_accept:true}))}/>
                  <GoldButton title="DECLINE" muted disabled={busy} onPress={() => void run(() => supabase.rpc('respond_network_connection',{p_conn:n.conn_id,p_accept:false}))}/>
                </View> : <GoldButton title="CANCEL REQUEST" muted disabled={busy} onPress={() => void run(() => supabase.rpc('remove_network_connection',{p_conn:n.conn_id}))}/>}
              </View>
            ))}
            {acceptedNetwork.length === 0 && <View style={styles.hint}><Text style={styles.hintTitle}>Quality before quantity.</Text><Text style={styles.muted}>Invite one person who can encourage or help with a goal. No public feed or stranger discovery.</Text></View>}
            {acceptedNetwork.map(n => (
              <View key={n.conn_id} style={styles.card}>
                <View style={styles.formRow}>
                  <Avatar name={n.display_name}/>
                  <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{n.display_name || 'Connection'}</Text>
                    {n.tagline ? <Text style={styles.muted}>{n.tagline}</Text> : null}
                  </View>
                </View>
                {n.available_to_help ? <>
                  <Text style={styles.smallCap}>THEY'VE CHOSEN TO OFFER</Text>
                  <Text style={styles.muted}>{n.help_modes.length ? n.help_modes.map(m => HELP_MODES.find(x=>x.id===m)?.label||m).join(' · ') : 'Open to requests'}</Text>
                  {n.help_topics.length ? <Text style={[styles.muted,{marginTop:5}]}>Areas: {n.help_topics.join(' · ')}</Text> : null}
                </> : <Text style={styles.muted}>No help preferences shared. You can still ask if they want to join a goal.</Text>}
                <GoldButton title="INVITE TO A GOAL" muted onPress={() => { setPersonId(n.member_id); setInviteSource('network'); setInviteOpen(true); setPanel('teams'); }}/>
                <Pressable onPress={() => Alert.alert('Remove connection', `Remove ${n.display_name || 'this person'} and revoke their goal-team access?`, [
                  {text:'Cancel',style:'cancel'},
                  {text:'Remove',style:'destructive',onPress:()=>void run(()=>supabase.rpc('remove_network_connection',{p_conn:n.conn_id}))},
                ])}><Text style={styles.danger}>REMOVE CONNECTION</Text></Pressable>
              </View>
            ))}
            <Heading title="WHAT YOU ALLOW" description="Other accepted contacts may see this only if you opt in. They never gain access to your private goals automatically."/>
            <View style={styles.card}>
              <View style={[styles.formRow,{justifyContent:'space-between'}]}>
                <View style={{flex:1}}><Text style={styles.cardTitle}>I'm open to helping</Text><Text style={styles.muted}>Share these preferences with accepted network contacts</Text></View>
                <Switch value={prefs.available_to_help} onValueChange={available_to_help=>setPrefs(p=>({...p,available_to_help}))} trackColor={{false:'#35302A',true:'#A68A4F'}} thumbColor={GOLD}/>
              </View>
              <Pressable onPress={() => setEditOffer(v=>!v)} style={{marginTop:15}}><Text style={styles.link}>{editOffer?'HIDE OPTIONS  −':'EDIT HELP PREFERENCES  +'}</Text></Pressable>
              {editOffer && <>
                <Text style={[styles.smallCap,{marginTop:18}]}>AREAS I'M COMFORTABLE HELPING WITH</Text>
                <View style={styles.chips}>{[...new Set([...TOPICS,...prefs.help_topics])].map(t => <SelectChip key={t} label={t} on={prefs.help_topics.includes(t)} onPress={()=>toggleTopic(t)}/>)}</View>
                <View style={styles.formRow}><TextInput style={[styles.input,{flex:1}]} value={newTopic} onChangeText={setNewTopic} placeholder="Add an area" placeholderTextColor="#847E74" maxLength={32}/><GoldButton title="ADD" muted onPress={()=>{const t=newTopic.trim();if(t&&!prefs.help_topics.includes(t)) toggleTopic(t);setNewTopic('');}}/></View>
                <Text style={[styles.smallCap,{marginTop:18}]}>HOW I'M HAPPY TO HELP</Text>
                <View style={styles.chips}>{HELP_MODES.map(m=><SelectChip key={m.id} label={m.label} on={prefs.help_modes.includes(m.id)} onPress={()=>toggleMode(m.id)}/>)}</View>
              </>}
              <GoldButton title="SAVE WHAT I ALLOW" disabled={busy} onPress={() => void run(() => supabase.rpc('save_network_preferences',{p_available:prefs.available_to_help,p_topics:prefs.help_topics,p_modes:prefs.help_modes}), 'Your help preferences were saved.')}/>
            </View>
          </>
        )}

        {panel === 'teams' && networkReady && (
          <>
            <Heading title="GOAL TEAMS" description="A different group for every goal. The owner chooses access; the invited person chooses whether to join."/>
            <View style={styles.hint}>
              <Text style={styles.hintTitle}>Invite someone into one goal.</Text>
              <Text style={styles.muted}>They will only see the goal's title, or the current move if you explicitly allow it. No private WHY, notes, health data, images, or other goals.</Text>
              <GoldButton title={inviteOpen?'CLOSE INVITATION':'INVITE A PERSON'} onPress={()=>{
                setInviteOpen(v => !v);
                if (inviteOpen) { setInviteSource(null); setGoalPickerOpen(false); }
              }} muted={!inviteOpen}/>
            </View>
            {inviteOpen && <View style={styles.card}>
              <Text style={styles.smallCap}>1 · WHO WOULD YOU LIKE TO INVITE?</Text>
              <Pressable accessibilityRole="button" accessibilityState={{selected:inviteSource==='network'}}
                onPress={()=>setInviteSource('network')} style={[styles.choiceCard,inviteSource==='network' && styles.choiceOn]}>
                <View style={styles.choiceTitleRow}><Ionicons name="people-outline" color={GOLD} size={21}/><Text style={styles.cardTitle}>Choose from My Network</Text></View>
                <Text style={styles.muted}>Invite someone you've already connected with to a particular goal.</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{selected:inviteSource==='new'}}
                onPress={()=>setInviteSource('new')} style={[styles.choiceCard,inviteSource==='new' && styles.choiceOn]}>
                <View style={styles.choiceTitleRow}><Ionicons name="person-add-outline" color={GOLD} size={21}/><Text style={styles.cardTitle}>Invite Someone New</Text></View>
                <Text style={styles.muted}>Share your private connection code. You can invite them to a goal after you both accept the connection.</Text>
              </Pressable>
              {inviteSource==='new' && <View style={styles.inviteNewInfo}>
                <Text style={styles.smallCap}>YOUR PRIVATE CONNECTION CODE</Text>
                <Text selectable style={styles.inviteCode}>{(myCode.match(/.{1,4}/g)||[]).join(' ') || 'UNAVAILABLE'}</Text>
                <GoldButton title="SHARE CONNECTION INVITE" disabled={!myCode} onPress={()=>void shareNewPersonCode()}/>
                <Text style={styles.muted}>They'll need the current GOAL'D IN app and their own account to request a connection. When you accept, return here and select them from My Network to send the goal-specific invitation. No goal details are included in the shared code.</Text>
                <GoldButton muted title="VIEW CONNECTION REQUESTS" onPress={()=>{setInviteOpen(false);setInviteSource(null);setPanel('network');}}/>
              </View>}
              {inviteSource==='network' && <>
                <Text style={[styles.smallCap,{marginTop:18}]}>2 · CHOOSE YOUR PERSON</Text>
                {acceptedPeople.length===0 && <View style={styles.inviteNewInfo}>
                  <Text style={styles.muted}>No accepted connections yet. Invite someone new now. After they request a connection and you accept, they'll appear here.</Text>
                  <GoldButton title="INVITE SOMEONE NEW" onPress={()=>setInviteSource('new')}/>
                </View>}
                {acceptedPeople.length>0 && <View style={styles.chips}>{acceptedPeople.map(p => <SelectChip key={p.id} label={`${p.name} · ${p.kind}`} on={personId===p.id} onPress={()=>setPersonId(p.id)}/>)}</View>}
              </>}
              {inviteSource==='network' && selectedPerson && <>
                <Text style={[styles.smallCap,{marginTop:18}]}>3 · CHOOSE ONE GOAL</Text>
                <Pressable accessibilityRole="button" onPress={()=>setGoalPickerOpen(v=>!v)} style={styles.goalSelector}>
                  <Text style={styles.goalSelectorText} numberOfLines={2}>{selectedGoal?.title || 'Select an active goal'}</Text>
                  <Ionicons name={goalPickerOpen?'chevron-up':'chevron-down'} size={18} color={GOLD}/>
                </Pressable>
                {goalPickerOpen && <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.goalChoices}>
                  {myGoals.map(g => <Pressable key={g.id} accessibilityRole="button" onPress={()=>{setGoalId(g.id);setGoalPickerOpen(false);}} style={[styles.goalChoice,goalId===g.id && styles.goalChoiceSelected]}>
                    <Ionicons name={goalId===g.id?'radio-button-on':'radio-button-off'} color={GOLD} size={18}/>
                    <Text style={styles.goalChoiceText}>{g.title}</Text>
                  </Pressable>)}
                  {myGoals.length===0 && <Text style={styles.muted}>Create an active goal first.</Text>}
                </ScrollView>}
                <Text style={[styles.smallCap,{marginTop:17}]}>4 · HOW CAN THEY HELP?</Text>
              <View style={styles.chips}>
                <SelectChip label="Encourage" on={role==='supporter'} onPress={()=>setRole('supporter')}/>
                <SelectChip label="Advise" on={role==='advisor'} onPress={()=>setRole('advisor')}/>
                <SelectChip label="Collaborate (view only)" on={role==='teammate'} onPress={()=>setRole('teammate')}/>
              </View>
              <Text style={[styles.smallCap,{marginTop:17}]}>5 · WHAT CAN THEY SEE?</Text>
              <View style={styles.chips}>
                <SelectChip label="Goal title only" on={scope==='title_only'} onPress={()=>setScope('title_only')}/>
                <SelectChip label="Goal + current move" on={scope==='current_move'} onPress={()=>setScope('current_move')}/>
              </View>
              <Text style={styles.muted}>They won't be able to edit your goal or see your full history. You can remove access at any time.</Text>
              <Text style={[styles.smallCap,{marginTop:17}]}>6 · OPTIONAL MESSAGE</Text>
              <TextInput style={[styles.input,{minHeight:72,textAlignVertical:'top'}]} multiline value={note} onChangeText={setNote} maxLength={160} placeholder="What would you like help with?" placeholderTextColor="#847E74"/>
              <GoldButton title="REVIEW & SEND INVITATION" disabled={busy || !selectedGoal || !selectedPerson} onPress={()=>Alert.alert('Invite to this goal?',
                `${selectedPerson?.name}\nGoal: ${selectedGoal?.title}\nRole: ${role}\nCan see: ${scope==='title_only'?'Title only':'Title and current move'}\n\nNothing else is shared.`,[
                {text:'Cancel',style:'cancel'},
                {text:'SEND INVITATION',onPress:()=>void run(()=>supabase.rpc('invite_goal_teammate',{p_goal:goalId,p_member:personId,p_role:role,p_scope:scope,p_note:note}), 'Invitation sent. They must approve before any additional goal information is available.').then(()=>{setInviteOpen(false);setNote('');})},
              ])}/>
              </>}
            </View>}
            <Heading title="INVITATIONS & TEAM MEMBERS"/>
            {team.length===0 && <View style={styles.card}><Text style={styles.muted}>No goal invitations yet. Invite one person who could help with a meaningful next step.</Text></View>}
            {team.map(item=> (
              <View key={item.invite_id} style={styles.card}>
                <Text style={styles.smallCap}>{item.incoming?'YOU WERE INVITED':item.status==='pending'?'WAITING FOR ACCEPTANCE':'GOAL CONNECTION'}</Text>
                <Text style={styles.cardTitle}>{item.goal_title}</Text>
                <Text style={styles.muted}>{item.incoming?'From':'With'} {item.person_name} · {item.role}</Text>
                <Text style={[styles.muted,{marginTop:5}]}>Allowed: {item.access_scope==='title_only'?'Goal title only':'Goal title and current move'}</Text>
                {item.invitation_note ? <Text style={[styles.muted,{marginTop:7}]}>“{item.invitation_note}”</Text> : null}
                {item.incoming && item.status==='accepted' && item.access_scope==='current_move' ?
                  <Text style={[styles.muted,{marginTop:7}]}>Current move: {teamMoves.find(x=>x.goal_id===item.goal_id)?.move_title || 'Not set yet'}</Text> : null}
                {item.status === 'accepted' ? <>
                  {teamMessages.filter(m=>m.invite_id===item.invite_id).map(m => (
                    <View key={m.message_id} style={styles.message}>
                      <Text style={styles.smallCap}>{m.from_name || 'Member'}</Text>
                      <Text style={styles.muted}>{m.message}</Text>
                    </View>
                  ))}
                  <Text style={[styles.smallCap,{marginTop:14}]}>A NOTE OR A PUSH · ONE PER 24 HOURS</Text>
                  <TextInput style={styles.input} placeholder="A useful note, question, or encouragement" placeholderTextColor="#847E74"
                    value={messageDrafts[item.invite_id] || ''} maxLength={160}
                    onChangeText={v=>setMessageDrafts(x=>({...x,[item.invite_id]:v}))}/>
                  <GoldButton title="SEND A NOTE" muted disabled={busy || !(messageDrafts[item.invite_id]||'').trim()}
                    onPress={()=>void run(()=>supabase.rpc('send_goal_team_message',{
                      p_invite:item.invite_id,p_message:messageDrafts[item.invite_id]||'',
                    }), 'Your note was sent.').then(()=>setMessageDrafts(x=>({...x,[item.invite_id]:''})))}/>
                </> : null}
                {item.incoming && item.status==='pending' ? <View style={styles.formRow}>
                  <GoldButton title="ACCEPT" disabled={busy} onPress={()=>void run(()=>supabase.rpc('respond_goal_teammate',{p_invite:item.invite_id,p_accept:true}))}/>
                  <GoldButton title="DECLINE" muted disabled={busy} onPress={()=>void run(()=>supabase.rpc('respond_goal_teammate',{p_invite:item.invite_id,p_accept:false}))}/>
                </View> : <GoldButton title={item.incoming?'LEAVE GOAL':item.status==='pending'?'CANCEL INVITATION':'REMOVE ACCESS'} muted disabled={busy} onPress={()=>Alert.alert('End goal connection?', 'This will remove the invitation and any access granted for this goal.', [
                  {text:'Keep',style:'cancel'},
                  {text:'REMOVE',style:'destructive',onPress:()=>void run(()=>supabase.rpc('remove_goal_teammate',{p_invite:item.invite_id}))},
                ])}/>}
              </View>
            ))}
          </>
        )}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Connection serves the goal. Sharing is a choice. Real life comes first.</Text>
          <GoldButton muted title="OPEN TODAY" onPress={()=>router.push('/today')}/>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  content: { paddingHorizontal: 18, paddingTop: 53, paddingBottom: 70 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 21 },
  backText: { color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 1.6 },
  masthead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  kicker: { color: GOLD, fontSize: 10, letterSpacing: 1.2, fontWeight: '900', flex: 1 },
  title: { fontSize: 34, fontWeight: '900', color: TEXT, lineHeight: 39, letterSpacing: -0.7 },
  description: { color: DIM, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 19 },
  segments: { flexDirection: 'row', backgroundColor: '#1D1A14', borderRadius: 17, padding: 4, borderColor: LINE, borderWidth: 1 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingVertical: 13 },
  segmentOn: { backgroundColor: GOLD },
  segmentText: { color: '#BEB6A2', fontWeight: '900', letterSpacing: 0.8, fontSize: 10 },
  segmentTextOn: { color: '#080808' },
  heading: { color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 1.25, marginBottom: 5 },
  muted: { color: DIM, fontSize: 13, lineHeight: 19, marginTop: 4 },
  hint: { backgroundColor: '#201B13', borderRadius: 18, borderWidth: 1, borderColor: '#63502D', padding: 17, marginTop: 15 },
  hintTitle: { fontSize: 17, fontWeight: '800', color: TEXT, marginBottom: 5 },
  notice: { backgroundColor: '#2B1C15', borderColor: '#75513E', borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 18 },
  message: { borderTopWidth: 1, borderTopColor: LINE, marginTop: 14, paddingTop: 9 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: '#3C352A', borderRadius: 18, padding: 16, marginTop: 11 },
  smallCap: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 1.15, marginTop: 8, marginBottom: 6 },
  cardTitle: { color: TEXT, fontSize: 18, fontWeight: '800', marginBottom: 3 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  button: { backgroundColor: GOLD, borderColor: GOLD, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  outline: { backgroundColor: '#201B13', borderColor: '#806334' },
  buttonText: { fontSize: 11, color: '#060606', fontWeight: '900', letterSpacing: 0.5 },
  input: { borderBottomWidth: 1, borderBottomColor: '#7B6949', paddingHorizontal: 8, paddingVertical: 11, color: TEXT, fontSize: 14 },
  inviteCode: { color: GOLD, fontSize: 26, letterSpacing: 2, fontWeight: '900', marginTop: 15 },
  avatar: { width: 45, height: 45, borderRadius: 23, borderWidth: 2, borderColor: GOLD, backgroundColor: '#292112', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GOLD, fontSize: 20, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 11 },
  chip: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: '#615039', backgroundColor: '#201C15' },
  chipOn: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { color: '#E6D1A6', fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: '#11100C' },
  danger: { textAlign: 'right', color: '#D7A58B', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, paddingTop: 17, paddingBottom: 3 },
  link: { color: GOLD, fontWeight: '900', letterSpacing: 0.7, fontSize: 11 },
  choiceCard: { marginTop: 12, padding: 15, borderWidth: 1, borderColor: LINE, borderRadius: 15, backgroundColor: '#1E1B16', gap: 7 },
  choiceOn: { borderColor: GOLD, backgroundColor: '#262015' },
  choiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteNewInfo: { marginTop: 14, backgroundColor: '#242018', borderRadius: 14, padding: 15, gap: 11 },
  goalSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, borderColor: '#826837', borderWidth: 1, borderRadius: 13, paddingVertical: 14, paddingHorizontal: 15, gap: 10 },
  goalSelectorText: { color: TEXT, fontSize: 14, fontWeight: '700', flex: 1 },
  goalChoices: { maxHeight: 245, marginTop: 5, borderRadius: 12, backgroundColor: '#211E18', overflow: 'hidden' },
  goalChoice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomColor: '#373027', borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 13 },
  goalChoiceSelected: { backgroundColor: '#423520' },
  goalChoiceText: { flex: 1, fontSize: 13, color: TEXT },
  footer: { marginTop: 33, marginBottom: 35, paddingTop: 19, borderTopWidth: 1, borderTopColor: LINE, alignItems: 'center' },
  footerText: { color: DIM, fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
