import { Stack, router, usePathname, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';

/**
 * GOAL'D IN opening: navigation shell ready -> 100% -> full gold crown ->
 * single light-ring burst with one haptic -> fade directly into YOU.
 *
 * The ring reports navigation readiness ONLY; it does NOT claim goal,
 * profile, Health Connect, or remote data has finished synchronizing.
 * No native splash hold. No auto-navigation over a goal deep link.
 */
const BLACK = '#050404';
const GOLD = '#F2BF4A';
const RADIUS = 94;
const CENTER = 120;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const REENTRY_AFTER_MS = 15 * 60 * 1000;
const READY_HOLD_MS = 330;

const RAYS = Array.from({ length: 12 }, (_, index) => {
  const theta = (Math.PI * index) / 6;
  const r1 = index % 3 === 0 ? 92 : 102;
  const r2 = index % 3 === 0 ? 135 : 122;
  return {
    x1: 150 + Math.cos(theta) * r1,
    y1: 150 + Math.sin(theta) * r1,
    x2: 150 + Math.cos(theta) * r2,
    y2: 150 + Math.sin(theta) * r2,
  };
});

type OpeningProps = { navigationReady: boolean; onDone: () => void };

function OpeningCinematic({ navigationReady, onDone }: OpeningProps) {
  const [laidOut, setLaidOut] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [rampDone, setRampDone] = useState(false);
  const [ringComplete, setRingComplete] = useState(false);
  const [percent, setPercent] = useState(0);
  const [crownShown, setCrownShown] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const progressOpacity = useRef(new Animated.Value(1)).current;
  const crownOpacity = useRef(new Animated.Value(0)).current;
  const crownScale = useRef(new Animated.Value(0.86)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.78)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0.72)).current;
  const raysOpacity = useRef(new Animated.Value(0)).current;
  const raysScale = useRef(new Animated.Value(0.85)).current;
  const lightFlashOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const rampStarted = useRef(false);
  const endStarted = useRef(false);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDoneRef.current();
  };

  useEffect(() => {
    const sub = progress.addListener(({ value }) => {
      setPercent(Math.max(0, Math.min(100, Math.round(value * 100))));
    });
    return () => progress.removeListener(sub);
  }, [progress]);

  useEffect(() => {
    // Fail open, never trap the person behind a splash if navigation stalls.
    // The fallback does NOT falsely advance the 100% readiness number.
    const imageTimer = setTimeout(() => setImageReady(true), 1000);
    const safetyTimer = setTimeout(finish, 5800);
    return () => {
      clearTimeout(imageTimer);
      clearTimeout(safetyTimer);
      progress.stopAnimation();
      progressOpacity.stopAnimation();
      crownOpacity.stopAnimation();
      crownScale.stopAnimation();
      haloOpacity.stopAnimation();
      glowScale.stopAnimation();
      burstOpacity.stopAnimation();
      burstScale.stopAnimation();
      raysOpacity.stopAnimation();
      raysScale.stopAnimation();
      lightFlashOpacity.stopAnimation();
      overlayOpacity.stopAnimation();
    };
    // Animated values are stable within this one cinematic mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!laidOut || !imageReady || rampStarted.current) return;
    rampStarted.current = true;
    const frame = requestAnimationFrame(() => {
      Animated.timing(progress, {
        toValue: 0.92,
        duration: 570,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // SVG dash offset is derived from numeric percent.
      }).start(({ finished: ok }) => {
        if (ok && !finished.current) setRampDone(true);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [laidOut, imageReady, progress]);

  useEffect(() => {
    if (!rampDone || !navigationReady || endStarted.current) return;
    endStarted.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: 210,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished: ok }) => {
      if (!ok || finished.current) return;
      setPercent(100);
      setRingComplete(true);
    });
  }, [rampDone, navigationReady, progress]);

  useEffect(() => {
    if (!ringComplete) return;
    const timer = setTimeout(() => {
      if (finished.current) return;
      // The 100% state is held visibly BEFORE the crown appears.
      setCrownShown(true);
      Animated.parallel([
        Animated.timing(crownOpacity, { toValue: 1, duration: 290, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(crownScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
        Animated.timing(haloOpacity, { toValue: 0.8, duration: 290, useNativeDriver: true }),
        Animated.timing(glowScale, { toValue: 1.05, duration: 290, useNativeDriver: true }),
      ]).start(({ finished: shown }) => {
        if (!shown || finished.current) return;
        // The only haptic is synchronized to the crown's outgoing light pulse.
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        Animated.timing(progressOpacity, { toValue: 0.15, duration: 160, useNativeDriver: true }).start();

        Animated.parallel([
          Animated.sequence([
            Animated.timing(burstOpacity, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.timing(burstOpacity, { toValue: 0, duration: 610, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
          Animated.timing(burstScale, { toValue: 2.35, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(raysOpacity, { toValue: 0.85, duration: 100, useNativeDriver: true }),
            Animated.timing(raysOpacity, { toValue: 0, duration: 530, useNativeDriver: true }),
          ]),
          Animated.timing(raysScale, { toValue: 1.33, duration: 670, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(lightFlashOpacity, { toValue: 0.2, duration: 110, useNativeDriver: true }),
            Animated.timing(lightFlashOpacity, { toValue: 0, duration: 480, useNativeDriver: true }),
          ]),
          Animated.timing(glowScale, { toValue: 1.7, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]).start(({ finished: burstDone }) => {
          if (!burstDone || finished.current) return;
          // YOU is already rendered behind this overlay: no black intermediate page.
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 380,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }).start(({ finished: faded }) => { if (faded) finish(); });
        });
      });
    }, READY_HOLD_MS);
    return () => clearTimeout(timer);
    // Animated values are stable for the lifetime of this cinematic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringComplete]);

  return (
    <Animated.View
      onLayout={() => setLaidOut(true)}
      pointerEvents="auto"
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      <View style={styles.center}>
        <Animated.View
          pointerEvents="none"
          style={[styles.radialHalo, { opacity: haloOpacity, transform: [{ scale: glowScale }] }]}
        >
          <Svg width={340} height={340} viewBox="0 0 340 340">
            <Defs>
              <RadialGradient id="launchHalo" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor="#FFE8AA" stopOpacity={0.3} />
                <Stop offset="30%" stopColor="#D99B24" stopOpacity={0.21} />
                <Stop offset="65%" stopColor="#B37B1C" stopOpacity={0.08} />
                <Stop offset="100%" stopColor="#9A6312" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={170} cy={170} r={168} fill="url(#launchHalo)" />
          </Svg>
        </Animated.View>

        {/* Two transparent concentric strokes and fine light rays, NO shadow/elevation. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
        >
          <Svg width={164} height={164} viewBox="0 0 164 164">
            <Circle cx={82} cy={82} r={72} stroke="#FFE9A4" strokeWidth={3.1} fill="none" />
            <Circle cx={82} cy={82} r={77} stroke="#E9AD31" strokeOpacity={0.65} strokeWidth={1.7} fill="none" />
            <Circle cx={82} cy={82} r={65} stroke="#FFECC2" strokeOpacity={0.32} strokeWidth={1.4} fill="none" />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.rays, { opacity: raysOpacity, transform: [{ scale: raysScale }] }]}>
          <Svg width={300} height={300} viewBox="0 0 300 300">
            {RAYS.map((ray, i) => (
              <Line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2}
                stroke={i % 3 === 0 ? '#FFE6A1' : '#DCA93C'}
                strokeWidth={i % 3 === 0 ? 2 : 1} strokeOpacity={i % 3 === 0 ? 0.95 : 0.6} />
            ))}
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.ring, { opacity: progressOpacity }]}>
          <Svg width={240} height={240}>
            <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke="#473419" strokeWidth={5} fill="none" />
            <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke="#6E4A1D" strokeOpacity={0.22} strokeWidth={11} fill="none" />
            <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={GOLD} strokeWidth={6}
              fill="none" strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
              rotation={-90} origin="120,120" />
          </Svg>
        </Animated.View>

        {!crownShown ? (
          <View style={styles.percentage}>
            <Text style={styles.percentText}>{percent}%</Text>
            <Text style={styles.readyText}>{percent === 100 ? 'READY' : 'OPENING'}</Text>
          </View>
        ) : null}

        <Animated.Image
          // Transparent cutout of YOUR ORIGINAL crown; no opaque square is drawn.
          source={require('../assets/images/goaldin-crown-transparent.png')}
          onLoadEnd={() => setImageReady(true)}
          onError={() => setImageReady(true)}
          resizeMode="contain"
          style={[styles.crown, { opacity: crownOpacity, transform: [{ scale: crownScale }] }]}
        />
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: lightFlashOpacity }]} />
      </View>
      <Text style={styles.brand}>GOAL'D IN</Text>
      <Text style={styles.tagline}>STAY READY</Text>
    </Animated.View>
  );
}

export default function Layout() {
  const navigationState = useRootNavigationState();
  const navigationReady = !!navigationState?.key;
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const backgroundedAt = useRef<number | null>(null);
  const [showOpening, setShowOpening] = useState(true);
  const [openingKey, setOpeningKey] = useState(0);

  // A notification must open its specific goal, not send someone to YOU.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const goalId = response.notification.request.content.data?.goalId;
      if (goalId) {
        setShowOpening(false);
        router.push(`/goal/${goalId}`);
      }
    });
    return () => sub.remove();
  }, []);

  // Preload YOU under the overlay so the final fade reveals meaningful content.
  // Do not change a direct goal link, a milestone session or an auth screen.
  useEffect(() => {
    if (showOpening && navigationReady && pathname === '/today') {
      router.replace('/you');
    }
  }, [showOpening, navigationReady, pathname]);

  // Quick switching does not replay the cinematic. Allow meaningful returns,
  // but don't interrupt someone's active milestone/workout workspace.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgroundedAt.current = Date.now();
      if (next === 'active') {
        const at = backgroundedAt.current;
        backgroundedAt.current = null;
        if (at !== null && Date.now() - at >= REENTRY_AFTER_MS &&
            !pathRef.current.startsWith('/goal/milestone/')) {
          setOpeningKey((key) => key + 1);
          setShowOpening(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B0B0D' } }} />
      {showOpening ? (
        <OpeningCinematic
          key={openingKey}
          navigationReady={navigationReady}
          onDone={() => setShowOpening(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0D' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 30,
    backgroundColor: BLACK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 240, height: 240 },
  percentage: { alignItems: 'center', justifyContent: 'center' },
  percentText: { color: '#FFDE90', fontWeight: '900', fontSize: 39, letterSpacing: -1 },
  readyText: { color: '#BE9141', fontWeight: '900', fontSize: 10, letterSpacing: 2.7, marginTop: 5 },
  crown: { position: 'absolute', width: 194, height: 194 },
  radialHalo: { position: 'absolute', width: 340, height: 340, alignItems: 'center', justifyContent: 'center' },
  burst: { position: 'absolute', width: 164, height: 164 },
  rays: { position: 'absolute', width: 300, height: 300 },
  flash: {
    position: 'absolute', width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FFF3CA',
  },
  brand: { color: GOLD, fontWeight: '900', fontSize: 14, letterSpacing: 3.6, marginTop: 5 },
  tagline: { color: '#90784A', fontWeight: '800', fontSize: 10, letterSpacing: 3.5, marginTop: 12 },
});
