import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import {
  deletePhotoFile, loadProgressPhotos, savePhotoFile, saveProgressPhotos,
  type ProgressPhoto,
} from '@/lib/privatePhotos';

const GOLD = '#E8B93A';
const MUTED = '#A8A49A';
type GoalChoice = { id: string; title: string };

export default function CameraTool() {
  const [userId, setUserId] = useState('');
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [goals, setGoals] = useState<GoalChoice[]>([]);
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [goalId, setGoalId] = useState('');
  const [chooseGoal, setChooseGoal] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) { router.replace('/'); return; }
      setUserId(user.id);
      const [existing, goalResponse] = await Promise.all([
        loadProgressPhotos(user.id),
        supabase.from('goals').select('id,title').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(30),
      ]);
      if (!mounted) return;
      setPhotos(existing);
      setGoals((goalResponse.data || []) as GoalChoice[]);
    })().catch((error) => { if (mounted) Alert.alert('Camera tool', String(error?.message || error)); });
    return () => { mounted = false; };
  }, []));

  const take = async (source: 'camera' | 'library') => {
    if (busy) return;
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera permission', 'GOAL\'D IN needs your permission to take a photo. You can change this in device settings.');
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setDraftUri(result.assets[0].uri);
        setNote('');
        setGoalId('');
      }
    } catch (error: any) {
      Alert.alert('Camera unavailable', error?.message || 'Try another photo source. A native rebuild may be required.');
    }
  };

  const save = async () => {
    if (!userId || !draftUri || busy) return;
    setBusy(true);
    let persistentUri = '';
    try {
      persistentUri = await savePhotoFile(userId, draftUri, 'progress');
      const selected = goals.find((goal) => goal.id === goalId);
      const next: ProgressPhoto[] = [{
        id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        uri: persistentUri,
        createdAt: new Date().toISOString(),
        note: note.trim(),
        goalId: selected?.id,
        goalTitle: selected?.title,
      }, ...photos];
      await saveProgressPhotos(userId, next);
      setPhotos(next);
      setDraftUri(null);
      setNote('');
      Alert.alert('Saved privately', 'This photo is saved on this device in GOAL\'D IN. It has not been shared or uploaded.');
    } catch (error: any) {
      if (persistentUri) deletePhotoFile(persistentUri);
      Alert.alert('Could not save', error?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (photo: ProgressPhoto) => {
    if (!userId) return;
    Alert.alert('Delete this photo?', 'This removes the local copy from GOAL\'D IN. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void (async () => {
        try {
          const next = photos.filter((item) => item.id !== photo.id);
          await saveProgressPhotos(userId, next);
          setPhotos(next);
          deletePhotoFile(photo.uri);
        } catch (e: any) { Alert.alert('Could not delete', e?.message || 'Try again.'); }
      })() },
    ]);
  };

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button">
          <Ionicons name="arrow-back" color={GOLD} size={18} />
          <Text style={s.backText}>BACK</Text>
        </Pressable>
        <Text style={s.eyebrow}>GOAL'D IN · SMART TOOLS</Text>
        <Text style={s.heading}>Capture what you do.</Text>
        <Text style={s.lede}>A picture of real progress. Private by default, available whenever you want to look back.</Text>
        <View style={s.options}>
          <Pressable style={s.mainAction} onPress={() => void take('camera')}>
            <Ionicons name="camera-outline" size={22} color="#050505" />
            <Text style={s.mainActionText}>TAKE A PHOTO</Text>
          </Pressable>
          <Pressable style={s.sideAction} onPress={() => void take('library')}>
            <Ionicons name="images-outline" size={21} color={GOLD} />
            <Text style={s.sideActionText}>CHOOSE PHOTO</Text>
          </Pressable>
        </View>

        {draftUri ? (
          <View style={s.previewCard}>
            <Image source={{ uri: draftUri }} style={s.previewImage} resizeMode="cover" />
            <Text style={s.fieldTitle}>A MOMENT WORTH KEEPING</Text>
            <TextInput style={s.input} placeholder="What did you do or learn? (optional)" placeholderTextColor="#797772" value={note} onChangeText={setNote} maxLength={250} multiline />
            <Pressable onPress={() => setChooseGoal(!chooseGoal)} style={s.goalSelector}>
              <Text style={s.goalText}>{goals.find((g) => g.id === goalId)?.title || 'Link to a goal (optional)'}</Text>
              <Ionicons name={chooseGoal ? 'chevron-up' : 'chevron-down'} color={GOLD} size={17} />
            </Pressable>
            {chooseGoal && (
              <View style={s.goalOptions}>
                <Pressable onPress={() => { setGoalId(''); setChooseGoal(false); }} style={s.goalOption}><Text style={s.goalText}>No goal</Text></Pressable>
                {goals.map((goal) => <Pressable key={goal.id} onPress={() => { setGoalId(goal.id); setChooseGoal(false); }} style={s.goalOption}><Text numberOfLines={2} style={s.goalText}>{goal.title}</Text></Pressable>)}
              </View>
            )}
            <Pressable disabled={busy} onPress={() => void save()} style={s.saveAction}>
              {busy ? <ActivityIndicator color="#090909" /> : <Text style={s.saveText}>SAVE PRIVATE PHOTO</Text>}
            </Pressable>
            <Pressable onPress={() => setDraftUri(null)} style={s.discard}><Text style={s.discardText}>DISCARD</Text></Pressable>
          </View>
        ) : null}

        <View style={s.sectionTop}>
          <Text style={s.sectionTitle}>YOUR CAPTURED MOMENTS</Text>
          <Text style={s.counter}>{photos.length}</Text>
        </View>
        {photos.length === 0 ? (
          <View style={s.empty}><Ionicons name="images-outline" color={GOLD} size={28}/><Text style={s.emptyTitle}>Your evidence begins here.</Text><Text style={s.muted}>Take a photo when something is worth remembering. No pressure to share.</Text></View>
        ) : (
          <View style={s.gallery}>
            {photos.map((photo) => (
              <View key={photo.id} style={s.galleryCard}>
                <Image source={{ uri: photo.uri }} style={s.thumb} resizeMode="cover" />
                <View style={s.galleryWords}>
                  <Text style={s.galleryTitle} numberOfLines={2}>{photo.goalTitle || 'A moment of progress'}</Text>
                  <Text style={s.muted} numberOfLines={3}>{photo.note || new Date(photo.createdAt).toLocaleDateString()}</Text>
                </View>
                <Pressable onPress={() => remove(photo)} accessibilityLabel="Delete photo" style={s.delete}>
                  <Ionicons name="trash-outline" color="#BA9C77" size={19}/>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={s.privateLine}><Ionicons name="lock-closed-outline" color={GOLD} size={17}/><Text style={s.privateText}>Saved only on this device inside GOAL'D IN. Not synced, attached to Supabase progress, or shared with your Circle.</Text></View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#080808' },
  scroll: { paddingHorizontal: 21, paddingTop: 56, paddingBottom: 75 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 31 },
  backText: { color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  eyebrow: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  heading: { color: '#F5F2EA', fontSize: 33, fontWeight: '800', marginTop: 10, letterSpacing: -0.5 },
  lede: { color: '#B6B1A8', fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 28 },
  options: { gap: 11 },
  mainAction: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 11, backgroundColor: GOLD },
  mainActionText: { fontSize: 13, color: '#090909', fontWeight: '900', letterSpacing: 0.7 },
  sideAction: { minHeight: 53, borderRadius: 15, borderWidth: 1, borderColor: '#66532A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  sideActionText: { color: GOLD, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  previewCard: { backgroundColor: '#131313', borderWidth: 1, borderColor: '#806333', borderRadius: 22, padding: 13, marginTop: 22 },
  previewImage: { height: 280, borderRadius: 15, width: '100%' },
  fieldTitle: { color: GOLD, fontSize: 11, fontWeight: '800', marginTop: 16, marginBottom: 10, letterSpacing: 1 },
  input: { color: '#F2EFE9', borderWidth: 1, borderColor: '#50402A', borderRadius: 13, minHeight: 64, padding: 13, fontSize: 15, textAlignVertical: 'top' },
  goalSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#37302A' },
  goalText: { color: '#D7D0C4', fontSize: 14 },
  goalOptions: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#342B22' },
  goalOption: { padding: 10 },
  saveAction: { marginTop: 19, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: GOLD },
  saveText: { fontSize: 13, fontWeight: '900', letterSpacing: 1, color: '#080808' },
  discard: { alignItems: 'center', paddingVertical: 13 },
  discardText: { color: '#A99A80', fontSize: 12, fontWeight: '800' },
  sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 38, marginBottom: 13 },
  sectionTitle: { color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 1.1 },
  counter: { color: GOLD, fontWeight: '800' },
  empty: { padding: 25, borderWidth: 1, borderColor: '#544226', borderRadius: 20, alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#EEE9DA', fontSize: 19, fontWeight: '800' },
  muted: { color: MUTED, fontSize: 13, lineHeight: 19 },
  gallery: { gap: 10 },
  galleryCard: { backgroundColor: '#141414', borderWidth: 1, borderColor: '#30271B', borderRadius: 17, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 67, height: 67, borderRadius: 10 },
  galleryWords: { flex: 1, gap: 5 },
  galleryTitle: { color: '#F1EBD8', fontWeight: '800', fontSize: 14 },
  delete: { padding: 8 },
  privateLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 28, padding: 14, borderTopWidth: 1, borderTopColor: '#3B3020' },
  privateText: { color: '#958E82', fontSize: 12, lineHeight: 18, flex: 1 },
});
