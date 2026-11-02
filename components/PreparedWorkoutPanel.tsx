import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {prepareWorkout, toSmartToolTimerStages} from '@/lib/workoutPreparation';

type Props = {
  actionId?: string | null;
  steps: string[];
  isTimerActive: boolean;
  onStartGuidedTimer: (stages: Array<{label: string; seconds: number}>) => void;
  onCustomizeTimer: () => void;
  onFindHeartRate?: () => void;
  onChooseHeartRate?: (id: string) => void;
  heartRateDevices?: Array<{id:string;name?:string|null}>;
  scanningHeartRate?: boolean;
  heartRateError?: string | null;
  heartRateStatus: 'connected' | 'connecting' | 'not-connected' | 'unavailable';
  heartRateBpm?: number | null;
};

/**
 * Prepare from CURRENT action instructions, not potentially stale cached data.
 * Does not connect or begin tracking until the user explicitly requests it.
 */
export default function PreparedWorkoutPanel({
  actionId, steps, isTimerActive, onStartGuidedTimer, onCustomizeTimer,
  onFindHeartRate, onChooseHeartRate, heartRateDevices = [], scanningHeartRate = false,
  heartRateError, heartRateStatus, heartRateBpm,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const workout = useMemo(() => prepareWorkout(steps), [steps.join('\u0000')]);
  if (!actionId || !workout) return null;
  const roundedMinutes = Math.round(workout.totalSeconds / 60);
  const visibleStages = expanded ? workout.stages : workout.stages.slice(0, 3);
  return <View style={s.card}>
    <Text style={s.kicker}>YOUR WORKOUT IS READY</Text>
    <Text style={s.heading}>{roundedMinutes}-minute guided workout</Text>
    <Text style={s.note}>Warm-up, intervals and cooldown are queued. Recording begins when you press START.</Text>
    <View style={s.stages}>
      {visibleStages.map((stage, i) => <Text key={`${i}-${stage.title}`} style={s.stageText}>
        {i + 1}. {stage.title} · {Math.round(stage.durationSeconds / 6) / 10} min
      </Text>)}
      {workout.stages.length > 3 && <Pressable onPress={() => setExpanded((v) => !v)}>
        <Text style={s.link}>{expanded ? 'SHOW LESS' : `VIEW ALL ${workout.stages.length} STAGES`}</Text>
      </Pressable>}
    </View>
    <Text style={s.hr}>
      {heartRateStatus === 'connected'
        ? `♥ HEART RATE CONNECTED${heartRateBpm ? ` · ${heartRateBpm} BPM` : ' · waiting for first reading'}`
        : heartRateStatus === 'connecting' ? '♥ Connecting heart-rate monitor…'
        : '♥ Heart-rate monitor optional · not connected'}
    </Text>
    {heartRateStatus !== 'connected' && onFindHeartRate && <Pressable style={s.secondary}
      onPress={onFindHeartRate} disabled={heartRateStatus === 'connecting' || scanningHeartRate}>
      <Text style={s.secondaryText}>{heartRateStatus === 'connecting' ? 'CONNECTING…' : scanningHeartRate ? 'SEARCHING…' : 'FIND / CONNECT HR MONITOR'}</Text>
    </Pressable>}
    {heartRateError ? <Text style={s.hrError}>{heartRateError}</Text> : null}
    {heartRateDevices.length > 0 && heartRateStatus !== 'connected' && onChooseHeartRate && (
      <View style={s.deviceList}>
        <Text style={s.note}>Choose a compatible Bluetooth heart-rate monitor:</Text>
        {heartRateDevices.map((device) => (
          <Pressable key={device.id} style={s.secondary} disabled={heartRateStatus === 'connecting'}
            onPress={() => onChooseHeartRate(device.id)}>
            <Text style={s.secondaryText}>♥ {device.name || 'Bluetooth device'} · CONNECT</Text>
          </Pressable>
        ))}
      </View>
    )}
    <Pressable accessibilityRole="button" style={[s.start, isTimerActive && s.disabled]}
      disabled={isTimerActive} onPress={() => onStartGuidedTimer(toSmartToolTimerStages(workout))}>
      <Text style={s.startText}>{isTimerActive ? 'WORKOUT IN PROGRESS' : '▶ START WORKOUT'}</Text>
    </Pressable>
    <Pressable onPress={onCustomizeTimer} style={s.custom}>
      <Text style={s.link}>CUSTOM TIMER INSTEAD</Text>
    </Pressable>
  </View>;
}
const s = StyleSheet.create({
  card:{borderColor:'#7B622D',borderWidth:1,backgroundColor:'#171510',borderRadius:18,padding:16,gap:11,marginTop:12,marginBottom:12},
  kicker:{color:'#D8B24A',fontSize:11,fontWeight:'900',letterSpacing:1},
  heading:{color:'#FFFFFF',fontSize:20,fontWeight:'800'},
  note:{color:'#C1BDB4',fontSize:13,lineHeight:19},
  stages:{backgroundColor:'#252118',borderRadius:10,padding:12,gap:6},
  stageText:{color:'#E6E1D7',fontSize:12},
  link:{color:'#E8C36A',fontSize:11,fontWeight:'800',marginTop:6},
  hr:{color:'#E8D3A8',fontWeight:'700',fontSize:12},
  hrError:{color:'#F1AB9E',fontSize:12},
  deviceList:{gap:9,paddingVertical:5},
  secondary:{borderColor:'#846A35',borderWidth:1,borderRadius:10,padding:12,alignItems:'center'},
  secondaryText:{color:'#E8C36A',fontWeight:'900',fontSize:12},
  start:{backgroundColor:'#D8B24A',borderRadius:12,padding:16,alignItems:'center',minHeight:52},
  disabled:{opacity:0.48},
  startText:{color:'#111',fontSize:15,fontWeight:'900'},
  custom:{alignItems:'center',paddingVertical:7},
});
