import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/today');
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/today');
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    if (!email.trim() || !password) {
      Alert.alert('Sign in', 'Enter your email and password.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Sign in failed', error.message);
    }
  }

  async function signUp() {
    if (!email.trim() || password.length < 6) {
      Alert.alert(
        'Create account',
        'Enter an email and a password of at least 6 characters.'
      );
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Could not create account', error.message);
    } else if (!data.session) {
      Alert.alert(
        'Check your email',
        'Confirm your email address, then come back and sign in.'
      );
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#F0D06A" />
      </View>
    );
  }

  return (
    <View style={s.page}>
      <Text style={s.brand}>GOAL'D IN</Text>

      <Text style={s.hero}>
        What would make{'\n'}today a win?
      </Text>

      <Text style={s.copy}>
        Your goals, actions and wins stay synced to your account.
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#666"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
      />

      <View style={s.passwordBox}>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#666"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.passwordInput}
        />

        <Pressable
          onPress={() => setShowPassword(!showPassword)}
          style={s.eyeButton}
          hitSlop={12}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={24}
            color="#F0D06A"
          />
        </Pressable>
      </View>

      <Pressable style={s.button} onPress={signIn}>
        <Text style={s.buttonText}>SIGN IN →</Text>
      </Pressable>

      <Pressable style={s.secondary} onPress={signUp}>
        <Text style={s.secondaryText}>CREATE ACCOUNT</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0B0B0D',
    padding: 24,
    justifyContent: 'center',
  },

  center: {
    flex: 1,
    backgroundColor: '#0B0B0D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  brand: {
    color: '#F0D06A',
    letterSpacing: 3,
    fontWeight: '900',
    fontSize: 15,
  },

  hero: {
    color: '#E5E5E5',
    fontWeight: '600',
    fontSize: 42,
    lineHeight: 44,
    marginTop: 14,
  },

  copy: {
    color: '#A9A9A9',
    fontSize: 16,
    lineHeight: 23,
    marginVertical: 24,
  },

  input: {
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#E5E5E5',
    padding: 16,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 10,
  },

  passwordBox: {
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  passwordInput: {
    flex: 1,
    color: '#E5E5E5',
    padding: 16,
    fontSize: 16,
  },

  eyeButton: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },

  eye: {
    color: '#F0D06A',
    fontSize: 24,
    fontWeight: '700',
  },

  button: {
    backgroundColor: '#F0D06A',
    padding: 17,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#D6AA3F',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },

  buttonText: {
    color: '#090909',
    fontWeight: '900',
    fontSize: 16,
  },

  secondary: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 10,
  },

  secondaryText: {
    color: '#E5E5E5',
    fontWeight: '900',
  },
});