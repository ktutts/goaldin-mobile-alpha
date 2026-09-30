import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
type Props = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function GoalItButton({
  onPress,
  disabled = false,
  loading = false,
}: Props) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        minHeight: 72,
        borderRadius: 36,
        borderWidth: 3,
        borderColor: '#D8B24A',
        backgroundColor: '#0B0B0D',
        justifyContent: 'center',
        padding: 5,
        opacity: disabled || loading ? 0.55 : pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          flex: 1,
          minHeight: 56,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: '#D8B24A',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
       <Image
  source={require('../assets/images/goaldin-crown.png')}
  style={{
    width: 34,
    height: 34,
  }}
  resizeMode="contain"
/>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 22,
            fontWeight: '900',
            letterSpacing: 2,
          }}
        >
          {loading ? 'BUILDING...' : 'GOAL IT'}
        </Text>
      </View>
    </Pressable>
  );
}