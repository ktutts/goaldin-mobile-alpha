import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase, supabaseConfigError } from '@/lib/supabase';

export default function Index() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (supabaseConfigError) {
      setCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.warn('Could not restore Supabase session:', error.message);
      }
      if (data.session) router.replace('/today');
      setCheckingSession(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/today');
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  function validateCredentials() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert('Email and password required', 'Enter both your email address and password.');
      return null;
    }

    if (!cleanEmail.includes('@')) {
      Alert.alert('Check your email', 'Enter a valid email address.');
      return null;
    }

    return cleanEmail;
  }

  function showConfigError() {
    Alert.alert(
      'App setup needed',
      supabaseConfigError ?? 'Supabase is not configured for this build.'
    );
  }

  async function signIn() {
    if (supabaseConfigError) {
      showConfigError();
      return;
    }

    const cleanEmail = validateCredentials();
    if (!cleanEmail) return;

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        const message = error.message.toLowerCase().includes('email not confirmed')
          ? 'Your email has not been confirmed yet. Open the confirmation email from GOAL\'D IN, confirm your address, then try again.'
          : error.message.toLowerCase().includes('invalid login credentials')
            ? 'That email/password combination was not accepted. Check the email address and password, then try again.'
            : error.message;

        Alert.alert('Sign in failed', message);
      }
    } catch (error) {
      Alert.alert(
        'Sign in failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function signUp() {
    if (supabaseConfigError) {
      showConfigError();
      return;
    }

    const cleanEmail = validateCredentials();
    if (!cleanEmail) return;

    if (password.length < 6) {
      Alert.alert('Create account', 'Use a password of at least 6 characters.');
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (error) {
        Alert.alert('Could not create account', error.message);
        return;
      }

      if (data.session) {
        router.replace('/today');
      } else {
        Alert.alert(
          'Check your email',
          `We sent a confirmation link to ${cleanEmail}. Open it to confirm your account, then come back and sign in.`
        );
      }
    } catch (error) {
      Alert.alert(
        'Could not create account',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#D8B24A" />
      </View>
    );
  }

  return (
    <View style={s.page}>
      <Text style={s.brand}>GOAL'D IN</Text>
      <Text style={s.hero}>What would make today a win?</Text>
      <Text style={s.copy}>
        Your goals, actions and wins stay synced to your account.
      </Text>

      {supabaseConfigError ? (
        <View style={s.warning}>
          <Ionicons name="warning-outline" size={20} color="#D8B24A" />
          <Text style={s.warningText}>
            This build is missing its Supabase environment settings.
          </Text>
        </View>
      ) : null}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#666"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        style={s.input}
        editable={!submitting}
        returnKeyType="next"
      />

      <View style={s.passwordWrap}>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#666"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          style={s.passwordInput}
          editable={!submitting}
          onSubmitEditing={signIn}
          returnKeyType="go"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          hitSlop={10}
          onPress={() => setShowPassword((visible) => !visible)}
          style={s.eyeButton}
          disabled={submitting}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={23}
            color="#aaa"
          />
        </Pressable>
      </View>

      <Pressable
        style={[s.button, submitting && s.disabled]}
        onPress={signIn}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <Text style={s.buttonText}>SIGN IN →</Text>
        )}
      </Pressable>

      <Pressable
        style={[s.secondary, submitting && s.disabled]}
        onPress={signUp}
        disabled={submitting}
      >
        <Text style={s.secondaryText}>CREATE ACCOUNT</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#090909',
    padding: 24,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    backgroundColor: '#090909',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: '#D8B24A',
    letterSpacing: 3,
    fontWeight: '900',
    fontSize: 15,
  },
  hero: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 42,
    lineHeight: 44,
    marginTop: 14,
  },
  copy: {
    color: '#aaa',
    fontSize: 16,
    lineHeight: 23,
    marginVertical: 24,
  },
  input: {
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    color: '#fff',
    padding: 16,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 10,
  },
  passwordWrap: {
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    color: '#fff',
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 8,
    fontSize: 16,
  },
  eyeButton: {
    width: 52,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#D8B24A',
    minHeight: 54,
    paddingHorizontal: 17,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#0a0a0a',
    fontWeight: '900',
    fontSize: 16,
  },
  secondary: {
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginTop: 10,
  },
  secondaryText: {
    color: '#fff',
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.65,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#59491f',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    color: '#d7d7d7',
    fontSize: 14,
    lineHeight: 19,
  },
});
