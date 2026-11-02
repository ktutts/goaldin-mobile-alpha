import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const GOLD = '#D8B24A';
const BG = '#0B0B0D';
const PANEL = '#171719';
type Kind = 'earned' | 'saved';
type Entry = { id: string; kind: Kind; amount: number; note: string; createdAt: string };
const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MoneyMoves() {
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>('earned');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (active) router.replace('/'); return; }
        const key = `goaldin-money-moves-v1-${user.id}`;
        const raw = await AsyncStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (active) {
          setStorageKey(key);
          setEntries(Array.isArray(parsed) ? parsed.filter((e: any) =>
            e && (e.kind === 'earned' || e.kind === 'saved') &&
            typeof e.amount === 'number' && Number.isFinite(e.amount) && e.amount > 0 &&
            typeof e.id === 'string' && typeof e.createdAt === 'string') : []);
        }
      } catch { if (active) Alert.alert('Could not load', 'Your Money Moves records are unavailable right now.'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []));

  const earned = entries.filter(e => e.kind === 'earned').reduce((sum, e) => sum + e.amount, 0);
  const saved = entries.filter(e => e.kind === 'saved').reduce((sum, e) => sum + e.amount, 0);
  const addEntry = async () => {
    if (!storageKey || saving) return;
    const value = Number(amount.trim());
    if (!Number.isFinite(value) || value <= 0 || value > 100000000 || !/^\d+(?:\.\d{1,2})?$/.test(amount.trim())) {
      Alert.alert('Check amount', 'Enter a positive dollar amount, up to two decimal places.'); return;
    }
    if (!note.trim()) { Alert.alert('Add a description', 'What did you earn or save money on?'); return; }
    const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, kind, amount: value, note: note.trim().slice(0, 160), createdAt: new Date().toISOString() }, ...entries];
    setSaving(true);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setEntries(next); setAmount(''); setNote('');
      Alert.alert('Progress recorded', kind === 'earned' ? 'Income added to your Money Moves history.' : 'Savings added to your Money Moves history.');
    } catch { Alert.alert('Not saved', 'Please try again.'); }
    finally { setSaving(false); }
  };
  const deleteEntry = (entry: Entry) => Alert.alert('Remove record?', `${money(entry.amount)} · ${entry.note}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      if (!storageKey) return;
      const next = entries.filter(e => e.id !== entry.id);
      try { await AsyncStorage.setItem(storageKey, JSON.stringify(next)); setEntries(next); }
      catch { Alert.alert('Not removed', 'Please try again.'); }
    } },
  ]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={GOLD} /></View>;
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button"><Ionicons name="arrow-back" size={20} color={GOLD} /><Text style={styles.backText}>BACK</Text></Pressable>
      <Text style={styles.eyebrow}>GOAL'D IN  /  SMART TOOLS</Text>
      <Text style={styles.title}>MONEY <Text style={styles.gold}>MOVES</Text></Text>
      <Text style={styles.subtitle}>Small actions. Real financial progress.</Text>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>TOTAL RECORDED IMPROVEMENT</Text>
        <Text style={styles.heroValue}>{money(earned + saved)}</Text>
        <Text style={styles.caption}>Money earned + money saved · recorded by you</Text>
        <View style={styles.stats}>
          <View style={styles.stat}><Ionicons name="trending-up-outline" color={GOLD} size={18} /><Text style={styles.statLabel}>EARNED</Text><Text style={styles.statValue}>{money(earned)}</Text></View>
          <View style={styles.stat}><Ionicons name="shield-checkmark-outline" color={GOLD} size={18} /><Text style={styles.statLabel}>SAVED</Text><Text style={styles.statValue}>{money(saved)}</Text></View>
        </View>
      </View>
      <Text style={styles.section}>RECORD A WIN</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Pressable onPress={() => setKind('earned')} style={[styles.switch, kind === 'earned' && styles.switchActive]}><Text style={[styles.switchText, kind === 'earned' && styles.switchTextActive]}>MONEY EARNED</Text></Pressable>
          <Pressable onPress={() => setKind('saved')} style={[styles.switch, kind === 'saved' && styles.switchActive]}><Text style={[styles.switchText, kind === 'saved' && styles.switchTextActive]}>MONEY SAVED</Text></Pressable>
        </View>
        <Text style={styles.inputLabel}>AMOUNT ($)</Text>
        <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor="#737373" keyboardType="decimal-pad" style={styles.input} accessibilityLabel="Dollar amount" />
        <Text style={styles.inputLabel}>WHAT DID YOU {kind === 'earned' ? 'EARN' : 'SAVE'} ON?</Text>
        <TextInput value={note} onChangeText={setNote} placeholder={kind === 'earned' ? 'Example: Sold an unused item' : 'Example: Canceled a subscription'} placeholderTextColor="#737373" style={styles.input} maxLength={160} accessibilityLabel="Record description" />
        <Pressable disabled={saving} onPress={() => void addEntry()} style={[styles.primary, saving && { opacity: 0.6 }]}><Text style={styles.primaryText}>{saving ? 'SAVING…' : 'RECORD THIS MOVE  →'}</Text></Pressable>
      </View>
      <Text style={styles.section}>YOUR NEXT MOVE</Text>
      <Pressable style={styles.ideaCard} onPress={() => setShowIdeas(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: showIdeas }}>
        <View style={{ flex: 1 }}><Text style={styles.ideaTitle}>Find one way to improve today</Text><Text style={styles.caption}>Ideas to act on—not promised earnings</Text></View><Ionicons name={showIdeas ? 'chevron-up' : 'chevron-down'} size={20} color={GOLD} />
      </Pressable>
      {showIdeas && <View style={styles.card}><Text style={styles.ideaLine}>• Review a recurring expense you no longer use.</Text><Text style={styles.ideaLine}>• List one unused item for sale.</Text><Text style={styles.ideaLine}>• Compare prices before your next grocery trip.</Text><Text style={styles.ideaLine}>• Identify one skill you could offer as a service.</Text><Text style={styles.caption}>Only record actual earnings or savings after they happen.</Text></View>}
      <Pressable onPress={() => setShowHistory(v => !v)} style={styles.historyHeader} accessibilityRole="button" accessibilityState={{ expanded: showHistory }}><Text style={styles.section}>YOUR HISTORY · {entries.length}</Text><Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} color={GOLD} size={19} /></Pressable>
      {showHistory && (entries.length ? entries.map(e => <Pressable key={e.id} onLongPress={() => deleteEntry(e)} style={styles.historyRow} accessibilityHint="Long press to remove this record"><View style={{ flex: 1 }}><Text style={styles.historyTitle}>{e.note}</Text><Text style={styles.caption}>{e.kind === 'earned' ? 'EARNED' : 'SAVED'} · {new Date(e.createdAt).toLocaleDateString()}</Text></View><Text style={styles.historyAmount}>+{money(e.amount)}</Text></Pressable>) : <Text style={styles.caption}>Your first recorded win will appear here.</Text>)}
      <Text style={styles.footnote}>Records are stored on this device for your signed-in account. They are not bank transactions or verified income, and do not sync between devices yet.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG }, center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }, content: { paddingHorizontal: 22, paddingTop: 48, paddingBottom: 65 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 25 }, backText: { color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  eyebrow: { color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 2.2 }, title: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: 0.5, marginTop: 9 }, gold: { color: GOLD }, subtitle: { color: '#C6C3BC', fontSize: 14, marginTop: 6, marginBottom: 24 },
  hero: { backgroundColor: '#191715', borderWidth: 1, borderColor: '#665124', borderRadius: 22, padding: 21 }, heroLabel: { color: GOLD, fontSize: 11, letterSpacing: 1.2, fontWeight: '900' }, heroValue: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginTop: 12 }, caption: { color: '#AFAAA0', fontSize: 12, lineHeight: 18, marginTop: 5 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 20 }, stat: { flex: 1, backgroundColor: '#28231A', borderRadius: 14, padding: 13, gap: 7 }, statLabel: { color: '#D7C9A9', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, statValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginTop: 28, marginBottom: 11 }, card: { backgroundColor: PANEL, borderColor: '#40382A', borderWidth: 1, borderRadius: 17, padding: 17 },
  switchRow: { flexDirection: 'row', gap: 8, marginBottom: 16 }, switch: { flex: 1, paddingVertical: 13, borderRadius: 10, borderColor: '#514735', borderWidth: 1, alignItems: 'center' }, switchActive: { backgroundColor: GOLD }, switchText: { color: '#C4BBA6', fontSize: 11, fontWeight: '900' }, switchTextActive: { color: '#17130A' },
  inputLabel: { color: '#D7C9A9', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 }, input: { color: '#FFFFFF', backgroundColor: '#242426', borderColor: '#514735', borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 17, fontSize: 16 },
  primary: { backgroundColor: GOLD, borderRadius: 12, alignItems: 'center', paddingVertical: 16 }, primaryText: { color: '#17130A', fontWeight: '900', letterSpacing: 1 }, ideaCard: { backgroundColor: PANEL, borderColor: '#40382A', borderWidth: 1, borderRadius: 15, padding: 17, flexDirection: 'row', alignItems: 'center' }, ideaTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 }, ideaLine: { color: '#E2DED4', fontSize: 14, lineHeight: 26 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#302C27' }, historyTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 }, historyAmount: { color: GOLD, fontWeight: '900', fontSize: 15 }, footnote: { color: '#85817A', fontSize: 11, lineHeight: 17, marginTop: 28 },
});
