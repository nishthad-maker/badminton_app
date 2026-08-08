import { View, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';
import { showConfirm } from '../lib/ui';
import { roleFromProfile, ROLE_HOME_ROUTE } from '../lib/roleRouting';
import { getPreferredViewMode } from '../lib/viewMode';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [noAccountFound, setNoAccountFound] = useState(false);

  const handleLogin = async () => {
    setNoAccountFound(false);
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase Auth returns the same generic error whether the email has
      // no account at all or the password is just wrong (deliberately, to
      // avoid account enumeration) — check separately so a no-account user
      // gets pointed at Sign Up instead of a confusing "wrong password".
      const { data: hasAccount } = await supabase.rpc('email_has_account', { input_email: email.trim() });
      setLoading(false);
      if (!hasAccount) {
        setNoAccountFound(true);
        showConfirm(
          'No account found',
          "We couldn't find an account for that email. Please create an account.",
          () => router.push('/signup' as any),
          'Create Account'
        );
      } else {
        Alert.alert('Login failed', error.message);
      }
      return;
    }

    // Route based on role + onboarding status
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('age, is_coach, role')
        .eq('id', data.user.id)
        .single();

      setLoading(false);

      const preferredView = await getPreferredViewMode();
      const role = roleFromProfile(profile, preferredView);
      if (role === 'player' && !profile?.age) {
        // Only a player goes through onboarding — coaches skip it entirely.
        router.replace('/onboarding' as any);
      } else {
        router.replace(ROLE_HOME_ROUTE[role] as any);
      }
    } else {
      setLoading(false);
      router.replace('/(tabs)' as any);
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
        <Text style={styles.eyebrow}>WELCOME BACK</Text>
        <Text style={styles.title}>Log In</Text>
        <Text style={styles.subtitle}>Enter your details to continue.</Text>

        {noAccountFound && (
          <TouchableOpacity style={styles.noAccountBanner} onPress={() => router.push('/signup' as any)}>
            <Text style={styles.noAccountBannerText}>
              No account found for that email. <Text style={styles.noAccountBannerLink}>Please create an account</Text>
            </Text>
          </TouchableOpacity>
        )}

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

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor={Theme.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity onPress={() => router.push('/forgot-password' as any)}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Log In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/signup' as any)}>
          <Text style={styles.linkText}>Don't have an account? <Text style={styles.link}>Sign Up</Text></Text>
        </TouchableOpacity>
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
  logo: { width: 190, height: 72, marginBottom: 36 },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 22,
    padding: 28,
    width: '100%',
    maxWidth: 440,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  eyebrow: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.eyebrowGreen, letterSpacing: 1.5, marginBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 32, color: Theme.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 26 },
  noAccountBanner: { backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 14, marginBottom: 18 },
  noAccountBannerText: { color: Theme.textPrimary, fontSize: 15, lineHeight: 21 },
  noAccountBannerLink: { color: Theme.eyebrowGreen, fontWeight: 'bold' },
  label: { fontSize: 15, fontWeight: '600', color: Theme.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 12,
    padding: 16,
    color: Theme.textPrimary,
    fontSize: 17,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  forgotText: {
    color: Theme.textSecondary,
    fontSize: 14,
    textAlign: 'left',
    textDecorationLine: 'underline',
    marginBottom: 20,
  },
  button: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 17 },
  linkText: { color: Theme.textSecondary, fontSize: 16, textAlign: 'center' },
  link: { color: Theme.eyebrowGreen, fontWeight: 'bold' },
});
