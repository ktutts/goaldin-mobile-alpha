import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';

const GOLD = '#D8B24A';
const clamp = (value: number) => Math.max(30, Math.min(240, Math.round(value)));

/** Optional, reusable rhythm companion. Audio/visual timing is foreground-only. */
export default function RhythmTool() {
  const player = useAudioPlayer(require('../assets/sounds/rhythm-click.wav'));
  const accentPlayer = useAudioPlayer(require('../assets/sounds/rhythm-accent.wav'));
  const [bpm, setBpm] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(true);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [beat, setBeat] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const [accent, setAccent] = useState(true);
  const [mini, setMini] = useState(false);
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragOffset = useRef({ x: 0, y: 0 });
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => { drag.setOffset(dragOffset.current); drag.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      const screen = Dimensions.get('window');
      dragOffset.current = {
        x: Math.max(-screen.width + 110, Math.min(12, dragOffset.current.x + gesture.dx)),
        y: Math.max(-screen.height + 160, Math.min(12, dragOffset.current.y + gesture.dy)),
      };
      drag.flattenOffset(); drag.setValue(dragOffset.current);
    },
  })).current;
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem('goaldin-rhythm-v5').then((raw) => {
      if (!mounted || !raw) return;
      const v = JSON.parse(raw);
      if (typeof v.bpm === 'number') setBpm(clamp(v.bpm));
      if (typeof v.sound === 'boolean') setSound(v.sound);
      if (typeof v.accent === 'boolean') setAccent(v.accent);
      if ([2, 3, 4].includes(v.beatsPerBar)) setBeatsPerBar(v.beatsPerBar);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    void AsyncStorage.setItem('goaldin-rhythm-v5', JSON.stringify({ bpm, sound, accent, beatsPerBar })).catch(() => {});
  }, [bpm, sound, accent, beatsPerBar]);
  const taps = useRef<number[]>([]);
  const playerRef = useRef(player);
  playerRef.current = player;
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const accentPlayerRef = useRef(accentPlayer);
  accentPlayerRef.current = accentPlayer;
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    if (!playing) { setBeat(-1); return; }
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const interval = 60000 / bpm;
    const origin = Date.now();
    let index = 0;
    const tick = () => {
      if (cancelled) return;
      setBeat(index % beatsPerBar);
      if (soundRef.current) {
        try {
          // Rewind the short click sample for each beat.
          const target = accentRef.current && index % beatsPerBar === 0 ? accentPlayerRef.current : playerRef.current;
          void target.seekTo(0).then(() => {
            if (!cancelled && soundRef.current) target.play();
          }).catch((error) => console.warn('Rhythm click unavailable:', error));
        } catch (error) { console.warn('Rhythm click unavailable:', error); }
      }
      index += 1;
      timeout = setTimeout(tick, Math.max(0, origin + index * interval - Date.now()));
    };
    tick();
    return () => { cancelled = true; if (timeout) clearTimeout(timeout); playerRef.current.pause(); accentPlayerRef.current.pause(); };
  }, [playing, bpm, beatsPerBar]);

  const tapTempo = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now].slice(-6);
    if (taps.current.length < 2) return;
    const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
    const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (average > 0) setBpm(clamp(60000 / average));
  };

  return (
    <View style={mini ? styles.miniPlaceholder : styles.container}>
      {mini ? <Pressable onPress={() => setMini(false)}><Text style={styles.miniRestore}>◉ RHYTHM ACTIVE · OPEN CONTROLS ↗</Text></Pressable> : null}
      {!mini && <>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? `Pause rhythm at ${bpm} beats per minute` : `Play rhythm at ${bpm} beats per minute`}
          onPress={() => setPlaying((v) => !v)} style={[styles.circle, beat >= 0 && styles.activeCircle, beat === 0 && styles.firstBeat]}>
          <Text style={styles.icon}>{playing ? 'Ⅱ' : '▶'}</Text>
          <Text style={styles.bpm}>{bpm}</Text>
        </Pressable>
        <View style={styles.info}>
          <Text style={styles.title}>◉ RHYTHM / METRONOME</Text>
          <Text style={styles.sub}>Tap the circle to {playing ? 'pause' : 'start'} · {bpm} BPM</Text>
          <View style={styles.beats}>{Array.from({ length: beatsPerBar }, (_, i) => <View key={i} style={[styles.dot, beat === i && styles.litDot, beat === i && i === 0 && styles.firstDot]} />)}</View>
        </View>
        <Pressable onPress={() => setMini(true)} accessibilityRole="button" accessibilityLabel="Minimize rhythm tool" style={styles.settings}><Text style={styles.settingsText}>↗</Text></Pressable>
        <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" style={styles.settings}>
          <Text style={styles.settingsText}>{expanded ? '−' : '⚙'}</Text>
        </Pressable>
      </View>
      {expanded && <View style={styles.controls}>
        <View style={styles.controlRow}>
          <Pressable style={styles.control} onPress={() => setBpm((n) => clamp(n - 5))}><Text style={styles.controlText}>− 5</Text></Pressable>
          <Pressable style={styles.control} onPress={() => setBpm((n) => clamp(n - 1))}><Text style={styles.controlText}>− 1</Text></Pressable>
          <Text style={styles.value}>{bpm} BPM</Text>
          <Pressable style={styles.control} onPress={() => setBpm((n) => clamp(n + 1))}><Text style={styles.controlText}>+ 1</Text></Pressable>
          <Pressable style={styles.control} onPress={() => setBpm((n) => clamp(n + 5))}><Text style={styles.controlText}>+ 5</Text></Pressable>
        </View>
        <View style={styles.controlRow}>
          <Pressable style={styles.wideControl} onPress={tapTempo}><Text style={styles.controlText}>TAP TEMPO</Text></Pressable>
          <Pressable style={styles.wideControl} onPress={() => setSound((v) => !v)}><Text style={styles.controlText}>{sound ? 'SOUND ON' : 'SOUND OFF'}</Text></Pressable>
          <Pressable style={styles.wideControl} onPress={() => setBeatsPerBar((n) => n === 4 ? 3 : n === 3 ? 2 : 4)}><Text style={styles.controlText}>{beatsPerBar}/4</Text></Pressable>
        </View>
        <View style={styles.controlRow}>
          <Pressable style={styles.wideControl} onPress={() => setAccent((v) => !v)}><Text style={styles.controlText}>ACCENT {accent ? 'ON' : 'OFF'}</Text></Pressable>
        </View>
        <Text style={styles.note}>Visual beat works with sound off. Mini Mode floats within this workspace; background audio and over-apps controls require separate native support.</Text>
      </View>}
      </>}
      <Modal visible={mini} transparent animationType="fade" onRequestClose={() => setMini(false)}>
        <View style={styles.miniOverlay} pointerEvents="box-none">
          <Animated.View style={[styles.miniFloat, { transform: drag.getTranslateTransform() }]}>
            <View {...pan.panHandlers} style={styles.dragHandle} accessibilityLabel="Drag rhythm circle"><Text style={styles.dragText}>⋮</Text></View>
            <Pressable onPress={() => setPlaying((v) => !v)} accessibilityRole="button" accessibilityLabel={playing ? 'Pause rhythm' : 'Play rhythm'} style={[styles.miniCircle, playing && styles.activeCircle, beat === 0 && accent && styles.firstBeat]}>
              <Text style={styles.miniIcon}>{playing ? 'Ⅱ' : '▶'}</Text><Text style={styles.miniBpm}>{bpm}</Text>
            </Pressable>
            <Pressable onPress={() => setMini(false)} style={styles.miniExpand} accessibilityRole="button" accessibilityLabel="Expand rhythm controls"><Text style={styles.expandText}>↗</Text></Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  miniPlaceholder: { marginBottom: 12, padding: 12, borderWidth: 1, borderColor: '#5B4B2F', borderRadius: 12 },
  miniRestore: { color: GOLD, fontWeight: '800', fontSize: 12 },
  miniOverlay: { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 90, paddingRight: 12 },
  miniFloat: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center', borderRadius: 37, backgroundColor: 'transparent' },
  dragHandle: { position: 'absolute', top: -13, width: 44, height: 20, alignItems: 'center', justifyContent: 'center', zIndex: 2, backgroundColor: '#171510', borderRadius: 10, borderWidth: 1, borderColor: '#665326' },
  dragText: { color: GOLD, fontSize: 15, fontWeight: '900' },
  miniCircle: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: GOLD, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  miniIcon: { color: GOLD, fontSize: 11 },
  miniBpm: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  miniExpand: { position: 'absolute', right: -6, bottom: -6, width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: '#665326', backgroundColor: '#171510', alignItems: 'center', justifyContent: 'center' },
  expandText: { color: GOLD, fontSize: 14, fontWeight: '900' },
  container: { backgroundColor: '#171510', borderColor: '#5B4B2F', borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  circle: { width: 65, height: 65, borderRadius: 33, borderWidth: 3, borderColor: '#665326', backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  activeCircle: { borderColor: GOLD, backgroundColor: '#2D2513' },
  firstBeat: { borderWidth: 5, backgroundColor: '#4C3914' },
  icon: { color: GOLD, fontSize: 12, fontWeight: '900' },
  bpm: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  info: { flex: 1 },
  title: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: .5 },
  sub: { color: '#C7C3B8', fontSize: 11, marginTop: 5 },
  beats: { flexDirection: 'row', gap: 8, marginTop: 9 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#49412C' },
  litDot: { backgroundColor: GOLD, width: 11, height: 11, borderRadius: 6 },
  firstDot: { backgroundColor: '#FFFFFF' },
  settings: { padding: 10 }, settingsText: { color: GOLD, fontSize: 22 },
  controls: { marginTop: 15, gap: 12 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  control: { paddingVertical: 10, paddingHorizontal: 9, backgroundColor: '#272316', borderRadius: 8 },
  wideControl: { flex: 1, alignItems: 'center', paddingVertical: 11, backgroundColor: '#272316', borderRadius: 8 },
  controlText: { color: GOLD, fontWeight: '900', fontSize: 11 },
  value: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  note: { color: '#A6A094', fontSize: 11, lineHeight: 16 },
});
