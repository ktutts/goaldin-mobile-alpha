import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';

type Props = {
  show: boolean;
  initialDate?: Date;
  onCancel: () => void;
  onAdd: (date: Date) => void;
};

export default function GoalTimePicker({ show, initialDate, onCancel, onAdd }: Props) {
  const [hour, setHour] = useState<number>(12);
  const [minute, setMinute] = useState<number>(0);
  const [amPm, setAmPm] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (!initialDate) return;
    const hrs = initialDate.getHours();
    const h12 = hrs % 12 || 12;
    setHour(h12);
    setMinute(initialDate.getMinutes());
    setAmPm(hrs >= 12 ? 'PM' : 'AM');
  }, [initialDate]);

  if (!show) return null;

  return (
    <View style={{
      marginTop: 12,
      padding: 16,
      borderRadius: 12,
      backgroundColor: '#111111',
      borderWidth: 1,
      borderColor: '#3A321F',
    }}>
      <Text style={{ color: '#D8B24A', fontWeight: '900', marginBottom: 12, letterSpacing: 1 }}>SELECT TIME</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={() => setHour((h) => (h % 12) + 1)} style={{ padding: 8 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 18 }}>＋</Text>
          </Pressable>
          <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900' }}>{String(hour).padStart(2, '0')}</Text>
          <Pressable onPress={() => setHour((h) => (h - 1 <= 0 ? 12 : h - 1))} style={{ padding: 8 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 18 }}>－</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={() => setMinute((m) => (m + 1) % 60)} style={{ padding: 8 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 18 }}>＋</Text>
          </Pressable>
          <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900' }}>{String(minute).padStart(2, '0')}</Text>
          <Pressable onPress={() => setMinute((m) => (m - 1 < 0 ? 59 : m - 1))} style={{ padding: 8 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900', fontSize: 18 }}>－</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={() => setAmPm((p) => (p === 'AM' ? 'PM' : 'AM'))} style={{ padding: 8, borderWidth: 1, borderColor: '#3A321F', borderRadius: 8 }}>
            <Text style={{ color: '#D8B24A', fontWeight: '900' }}>{amPm}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '900', textAlign: 'center', marginTop: 14 }}>
        {`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${amPm}`}
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
        <Pressable onPress={onCancel} style={{ paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 }}>
          <Text style={{ color: '#8E8E93', fontWeight: '800' }}>CANCEL</Text>
        </Pressable>

        <Pressable onPress={() => {
          const hour24 = amPm === 'PM' ? (hour % 12) + 12 : hour % 12;
          const date = new Date();
          date.setHours(hour24, minute, 0, 0);
          onAdd(date);
        }} style={{ backgroundColor: '#D8B24A', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 }}>
          <Text style={{ color: '#0B0B0B', fontWeight: '900' }}>ADD TIME</Text>
        </Pressable>
      </View>
    </View>
  );
}
