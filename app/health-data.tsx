import { router } from 'expo-router';
import { View, Text, Pressable } from 'react-native';

export default function HealthData() {
  return (
    <View style={{
      flex: 1,
      backgroundColor: '#080808',
      padding: 28,
      paddingTop: 80,
    }}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: '#E6BA50', fontWeight: 'bold' }}>
          ← BACK
        </Text>
      </Pressable>

      <Text style={{
        color: '#E6BA50',
        marginTop: 55,
        fontWeight: 'bold',
      }}>
        GOAL'D IN · HEALTH DATA
      </Text>

      <Text style={{
        color: '#FFFFFF',
        fontSize: 34,
        fontWeight: 'bold',
        marginTop: 20,
      }}>
        Better context. Your call.
      </Text>

      <Text style={{
        color: '#BBBBBB',
        fontSize: 16,
        lineHeight: 25,
        marginTop: 20,
      }}>
        Apple Health integration is not yet available
        in this iPhone test build.

        Your goals, progress, and other GOAL'D IN
        tools remain available.
      </Text>
    </View>
  );
}