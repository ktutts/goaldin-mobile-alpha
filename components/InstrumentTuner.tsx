import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioManager, AudioRecorder } from 'react-native-audio-api';
import { pitchFromSamples, type PitchReading } from '../lib/smartTools/pitchDetection';

const GOLD = '#D8B24A';
const STRINGS = [
  { name: 'E2', midi: 40 }, { name: 'A2', midi: 45 }, { name: 'D3', midi: 50 },
  { name: 'G3', midi: 55 }, { name: 'B3', midi: 59 }, { name: 'E4', midi: 64 },
];
const RATE = 16000;
export default function InstrumentTuner() {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<'guitar'|'chromatic'>('guitar');
  const [stringIndex, setStringIndex] = useState<number | null>(null);
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [error, setError] = useState('');
  const recorder = useRef<AudioRecorder | null>(null);
  const ring = useRef(new Float32Array(8192));
  const filled = useRef(0);
  const lastUpdate = useRef(0);
  const activeRef = useRef(false);
  const modeRef = useRef(mode);
  const stringRef = useRef(stringIndex);
  modeRef.current = mode;
  stringRef.current = stringIndex;

  const stop = useCallback(async () => {
    activeRef.current = false;
    const r = recorder.current;
    recorder.current = null;
    if (r) {
      try { r.clearOnAudioReady(); await r.stop(); } catch (e) { console.warn('Tuner stop:', e); }
    }
    try { await AudioManager.setAudioSessionActivity(false); } catch {}
    setActive(false);
    setReading(null);
    filled.current = 0;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && activeRef.current) void stop();
    });
    return () => { sub.remove(); void stop(); };
  }, [stop]);

  const start = async () => {
    if (activeRef.current) return;
    setError('');
    try {
      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== 'Granted') { setError('Microphone permission is needed to tune.'); return; }
      AudioManager.setAudioSessionOptions({ iosCategory: 'record', iosMode: 'default', iosOptions: [] });
      await AudioManager.setAudioSessionActivity(true);
      const r = new AudioRecorder();
      recorder.current = r;
      filled.current = 0;
      r.onAudioReady({ sampleRate: RATE, bufferLength: 4096, channelCount: 1 }, ({ buffer, numFrames }) => {
        if (!activeRef.current) return;
        const samples = buffer.getChannelData(0);
        const count = Math.min(numFrames, samples.length);
        if (count <= 0) return;
        const old = ring.current;
        if (count >= old.length) old.set(samples.subarray(count - old.length, count));
        else { old.copyWithin(0, count); old.set(samples.subarray(0, count), old.length - count); }
        filled.current = Math.min(old.length, filled.current + count);
        const now = Date.now();
        if (filled.current < 4096 || now - lastUpdate.current < 130) return;
        lastUpdate.current = now;
        const detected = pitchFromSamples(old.subarray(old.length - filled.current), buffer.sampleRate || RATE);
        if (!detected) { setReading(null); return; }
        if (modeRef.current === 'guitar' && stringRef.current !== null) {
          const target = STRINGS[stringRef.current].midi;
          const cents = Math.round(1200 * Math.log2(detected.frequency / (440 * Math.pow(2, (target - 69) / 12))));
          setReading({ ...detected, cents });
        } else setReading(detected);
      });
      activeRef.current = true;
      const result = await r.start();
      if (result.status === 'error') throw new Error(result.message || 'Could not start microphone');
      setActive(true);
    } catch (e: any) {
      setError(e?.message || 'Microphone could not start.');
      await stop();
    }
  };

  const targetMidi = mode === 'guitar' && stringIndex !== null ? STRINGS[stringIndex].midi : reading?.midi;
  const targetName = mode === 'guitar' && stringIndex !== null ? STRINGS[stringIndex].name : reading ? `${reading.note}${reading.octave}` : '—';
  const cents = reading?.cents ?? 0;
  const tuned = Boolean(reading && Math.abs(cents) <= 5);
  const needle = reading ? Math.max(-50, Math.min(50, cents)) : 0;
  const noteDisplay = targetMidi === undefined ? '—' : targetName;
  return (
    <View style={s.card}>
      <Text style={s.heading}>◉ INSTRUMENT TUNER</Text>
      <Text style={s.sub}>Listen. Adjust. Find your note.</Text>
      <View style={s.tabs}>
        <Pressable style={[s.tab, mode === 'guitar' && s.selected]} onPress={() => { setMode('guitar'); setReading(null); }}><Text style={s.tabText}>GUITAR</Text></Pressable>
        <Pressable style={[s.tab, mode === 'chromatic' && s.selected]} onPress={() => { setMode('chromatic'); setStringIndex(null); setReading(null); }}><Text style={s.tabText}>CHROMATIC</Text></Pressable>
      </View>
      {mode === 'guitar' && <View style={s.strings}>
        {STRINGS.map((string, i) => <Pressable key={i} style={[s.string, stringIndex === i && s.selected]} onPress={() => setStringIndex(stringIndex === i ? null : i)}><Text style={s.stringText}>{string.name}</Text></Pressable>)}
      </View>}
      <Text style={s.caption}>{mode === 'guitar' ? stringIndex === null ? 'AUTO-DETECT · OR CHOOSE A STRING' : `TUNING STRING ${stringIndex + 1}` : 'AUTO-DETECT ANY NOTE'}</Text>
      <Text style={[s.note, tuned && s.inTune]}>{noteDisplay}</Text>
      <Text style={s.hertz}>{reading ? `${reading.frequency.toFixed(1)} Hz` : 'PLAY A CLEAR SINGLE NOTE'}</Text>
      <View style={s.scale}>
        <Text style={s.edge}>♭ FLAT</Text><Text style={s.center}>●</Text><Text style={s.edge}>SHARP ♯</Text>
        <View style={[s.needle, { left: `${50 + needle * .43}%` }, tuned && s.tunedNeedle]} />
      </View>
      <Text style={[s.status, tuned && s.inTune]}>{!active ? 'MICROPHONE OFF' : !reading ? 'LISTENING…' : tuned ? '✓ IN TUNE' : cents < 0 ? `${Math.abs(cents)} CENTS FLAT · TIGHTEN` : `${cents} CENTS SHARP · LOOSEN`}</Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" onPress={() => active ? void stop() : void start()} style={[s.button, active && s.stop]}><Text style={s.buttonText}>{active ? '■ STOP LISTENING' : '● START TUNING'}</Text></Pressable>
      <Text style={s.foot}>Microphone runs only while tuning. No recordings are saved or uploaded. Best tested on a physical phone.</Text>
    </View>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: '#171510', borderColor: '#5B4B2F', borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 12 },
  heading: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: .6 }, sub: { color: '#C7C3B8', marginTop: 5, fontSize: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 18 }, tab: { flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#272316', borderRadius: 9 }, selected: { borderWidth: 1, borderColor: GOLD, backgroundColor: '#463718' }, tabText: { color: GOLD, fontWeight: '800', fontSize: 12 },
  strings: { flexDirection: 'row', gap: 5, marginTop: 13 }, string: { flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: '#272316', borderRadius: 8 }, stringText: { color: '#F4E4BC', fontWeight: '800', fontSize: 11 },
  caption: { color: '#AFA48B', textAlign: 'center', fontSize: 10, marginTop: 20, letterSpacing: 1 }, note: { color: '#FFFFFF', fontSize: 64, fontWeight: '900', textAlign: 'center', marginTop: 5 }, inTune: { color: GOLD }, hertz: { color: '#C7C3B8', textAlign: 'center', marginBottom: 25 },
  scale: { height: 55, marginHorizontal: 8, borderBottomWidth: 2, borderBottomColor: '#65522A', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, edge: { color: '#9F987F', fontSize: 11 }, center: { color: GOLD, fontSize: 18 }, needle: { position: 'absolute', height: 36, width: 3, top: 21, backgroundColor: '#FFFFFF' }, tunedNeedle: { backgroundColor: GOLD, width: 5 },
  status: { color: '#D1C9B8', fontWeight: '800', textAlign: 'center', marginTop: 23, marginBottom: 15, fontSize: 12 }, error: { color: '#FF8B8B', marginBottom: 12, textAlign: 'center' },
  button: { backgroundColor: GOLD, borderRadius: 12, padding: 15, alignItems: 'center' }, stop: { backgroundColor: '#68542B' }, buttonText: { color: '#090909', fontWeight: '900', fontSize: 13 }, foot: { color: '#9F987F', fontSize: 10, lineHeight: 16, marginTop: 12 },
});
