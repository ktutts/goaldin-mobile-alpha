import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';


type Props = {
  show: boolean;
  initialDate?: Date;
  onCancel: () => void;
  onAdd: (date: Date) => void;
  addedTimes?: string[];
  showDate?: boolean;
};

export default function GoalTimePicker({
  show,
  initialDate,
  onCancel,
  onAdd,
  addedTimes = [],
  showDate = true,
}: Props) {
  const [hour, setHour] = useState<number>(12);
  const [minute, setMinute] = useState<number>(0);
  const [amPm, setAmPm] = useState<'AM' | 'PM'>('AM');
  const [selectedDate, setSelectedDate] = useState(initialDate ?? new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [localAddedTimes, setLocalAddedTimes] = useState<string[]>(addedTimes);
  const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const currentYear = new Date().getFullYear();

const years = Array.from(
  { length: 21 },
  (_, index) => currentYear + index
);

const daysInSelectedMonth = new Date(
  selectedDate.getFullYear(),
  selectedDate.getMonth() + 1,
  0
).getDate();
  useEffect(() => {
  if (show) {
    setLocalAddedTimes(addedTimes);
  }
}, [show]);
  useEffect(() => {
  if (!initialDate) return;

  setSelectedDate(initialDate);

  const hrs = initialDate.getHours();
  const h12 = hrs % 12 || 12;

  setHour(h12);
  setMinute(initialDate.getMinutes());
  setAmPm(hrs >= 12 ? 'PM' : 'AM');
}, [initialDate]);

  if (!show) return null;

  return (
  <Modal
    visible={show}
    transparent
    animationType="fade"
    onRequestClose={onCancel}
  >
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.82)',
        justifyContent: 'center',
        paddingHorizontal: 22,
      }}
    >
      <View
        style={{
          maxHeight: '82%',
          padding: 16,
          borderRadius: 18,
          backgroundColor: '#111111',
          borderWidth: 1,
          borderColor: '#3A321F',
        }}
      >
     
{showDate && (
  <View style={{ marginBottom: 24 }}>
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        fontSize: 14,
        marginBottom: 12,
        letterSpacing: 1,
      }}
    >
      SELECT DATE
    </Text>

    <View
      style={{
        flexDirection: 'row',
        gap: 10,
      }}
    >
      <ScrollView
        style={{ maxHeight: 180, flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: selectedDate.getMonth() * 48 }}
      >
        {months.map((month, index) => {
          const selected = selectedDate.getMonth() === index;

          return (
            <Pressable
              key={month}
              onPress={() => {
                const next = new Date(selectedDate);
                const currentDay = next.getDate();

                next.setDate(1);
                next.setMonth(index);

                const maxDay = new Date(
                  next.getFullYear(),
                  index + 1,
                  0
                ).getDate();

                next.setDate(Math.min(currentDay, maxDay));
                setSelectedDate(next);
              }}
              style={{
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: selected ? '#D8B24A' : 'transparent',
              }}
            >
              <Text
                style={{
                  color: selected ? '#111' : '#FFF',
                  fontWeight: '800',
                }}
              >
                {month}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ maxHeight: 180, flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: Math.max(0, (selectedDate.getDate() - 2) * 48) }}
      >
        {Array.from({ length: daysInSelectedMonth }, (_, index) => {
          const day = index + 1;
          const selected = selectedDate.getDate() === day;

          return (
            <Pressable
              key={day}
              onPress={() => {
                const next = new Date(selectedDate);
                next.setDate(day);
                setSelectedDate(next);
              }}
              style={{
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: selected ? '#D8B24A' : 'transparent',
              }}
            >
              <Text
                style={{
                  color: selected ? '#111' : '#FFF',
                  fontWeight: '800',
                }}
              >
                {day}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ maxHeight: 180, flex: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {years.map((year) => {
          const selected = selectedDate.getFullYear() === year;

          return (
            <Pressable
              key={year}
              onPress={() => {
                const next = new Date(selectedDate);
                const currentDay = next.getDate();

                next.setDate(1);
                next.setFullYear(year);

                const maxDay = new Date(
                  year,
                  next.getMonth() + 1,
                  0
                ).getDate();

                next.setDate(Math.min(currentDay, maxDay));
                setSelectedDate(next);
              }}
              style={{
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: selected ? '#D8B24A' : 'transparent',
              }}
            >
              <Text
                style={{
                  color: selected ? '#111' : '#FFF',
                  fontWeight: '800',
                }}
              >
                {year}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>

    <Text
      style={{
        color: '#FFF',
        textAlign: 'center',
        fontWeight: '900',
        fontSize: 18,
        marginTop: 14,
      }}
    >
      {selectedDate.toLocaleDateString([], {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}
    </Text>
  </View>
)}
      <Text
  style={{
    color: '#D8B24A',
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: 1,
  }}
>
  SELECT TIME
</Text>

<View
  style={{
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 18,
  }}
>
  <ScrollView
    style={{ maxHeight: 104, flex: 1 }}
    showsVerticalScrollIndicator={false}
    contentOffset={{
  x: 0,
  y: (24 + (hour - 1)) * 52,
}}
  >
    
   {Array.from({ length: 60 }, (_, i) => (i % 12) + 1).map((h, index) => {
      const selected = h === hour;

      return (
        <Pressable
          key={`${h}-${index}`}
          onPress={() => setHour(h)}
          style={{
            height: 52,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: selected ? '#D8B24A' : 'transparent',
          }}
        >
          <Text
            style={{
              color: selected ? '#0B0B0B' : '#FFFFFF',
              fontSize: selected ? 24 : 18,
              fontWeight: selected ? '900' : '600',
            }}
          >
            {String(h).padStart(2, '0')}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>

  <ScrollView
    style={{ maxHeight: 104, flex: 1 }}
    showsVerticalScrollIndicator={false}
    contentOffset={{
      x: 0,
      // Corrected to divide minute by 5 to align with the 12-minute cycle
      y: (24 + (minute / 5)) * 52,
    }}
  >
   {Array.from({ length: 60 }, (_, i) => (i % 12) * 5).map((m, index) => {
      const selected = m === minute;

      return (
        <Pressable
          key={`${m}-${index}`}
          onPress={() => setMinute(m)}
          style={{
            height: 52,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: selected ? '#D8B24A' : 'transparent',
          }}
        >
          <Text
            style={{
              color: selected ? '#0B0B0B' : '#FFFFFF',
              fontSize: selected ? 24 : 18,
              fontWeight: selected ? '900' : '600',
            }}
          >
            {String(m).padStart(2, '0')}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>

  <ScrollView
    style={{ maxHeight: 104, flex: 1 }}
    showsVerticalScrollIndicator={false}
  >
    {(['AM', 'PM'] as const).map((period) => {
      const selected = period === amPm;

      return (
        <Pressable
          key={period}
          onPress={() => setAmPm(period)}
          style={{
            height: 52,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: selected ? '#D8B24A' : 'transparent',
          }}
        >
          <Text
            style={{
              color: selected ? '#0B0B0B' : '#FFFFFF',
              fontSize: selected ? 22 : 18,
              fontWeight: selected ? '900' : '600',
            }}
          >
            {period}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>
</View>

      <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: 8 }}>
        {`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${amPm}`}
      </Text>
{localAddedTimes.length > 0 && (
  <View style={{ marginTop: 18 }}>
    <Text
      style={{
        color: '#D8B24A',
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 10,
      }}
    >
      ADDED
    </Text>

    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {localAddedTimes.map((time: string) => (
        <View
          key={time}
          style={{
            borderWidth: 1,
            borderColor: '#D8B24A',
            borderRadius: 99,
            paddingVertical: 7,
            paddingHorizontal: 12,
          }}
        >
          <Text
            style={{
              color: '#D8B24A',
              fontWeight: '800',
            }}
          >
            {time}
          </Text>
        </View>
      ))}
    </View>
  </View>
)}
      <View
  style={{
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  }}
>
  <Pressable
    onPress={onCancel}
    style={{
      paddingVertical: 12,
      paddingHorizontal: 18,
    }}
  >
    <Text
      style={{
        color: '#8E8E93',
        fontWeight: '800',
      }}
    >
      DONE
    </Text>
  </Pressable>

  <Pressable
    onPress={() => {
      const hour24 =
        amPm === 'PM'
          ? (hour % 12) + 12
          : hour % 12;

      const date = new Date(selectedDate);
      date.setHours(hour24, minute, 0, 0);
const formatted = date.toLocaleTimeString([], {
  hour: 'numeric',
  minute: '2-digit',
});

setLocalAddedTimes((current) =>
  current.includes(formatted)
    ? current
    : [...current, formatted]
);
      onAdd(date);
    }}
    style={{
      backgroundColor: '#D8B24A',
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
    }}
  >
    <Text
      style={{
        color: '#0B0B0B',
        fontWeight: '900',
      }}
    >
      + ADD TIME
    </Text>
  </Pressable>
</View>
    </View>
    </View>
  </Modal>
  );
}
