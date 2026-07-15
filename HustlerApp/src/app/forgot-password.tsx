import { View, StyleSheet, TouchableOpacity, TextInput, Alert, Image } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/logo-green.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.card}>
        {!sent ? (
          <>
            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we'll send you a link to reset your password.
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={Theme.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="email-check-outline" size={44} color={Theme.eyebrowGreen} style={styles.successIcon} />
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a password reset link to {email}. Check your inbox and follow the instructions.
            </Text>

            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace('/login' as any)}
            >
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 160,
    height: 60,
    marginBottom: 32,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 24,
    width: '100%',
  },
  title: {
    fontFamily: Fonts.serifMedium,
    fontSize: 22,
    color: Theme.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Theme.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  button: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Theme.limeAccentDark,
    fontWeight: 'bold',
    fontSize: 15,
  },
  backText: {
    color: Theme.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  successIcon: {
    textAlign: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
});
