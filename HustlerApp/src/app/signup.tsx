import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';
import { Colors } from '@/constants/theme';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

type Role = 'player' | 'coach';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [club, setClub] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      showAlert('Missing fields', 'Please fill in all fields.');
      return;
    }

    if (fullName.trim().length < 2) {
      showAlert('Invalid name', 'Please enter your full name.');
      return;
    }

    // Coach-specific requirements
    if (role === 'coach') {
      if (!club.trim()) {
        showAlert('Missing club', 'Please enter the club you coach at.');
        return;
      }
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        showAlert('Invalid username', 'Your coach username should be 3–20 characters: lowercase letters, numbers, or underscores.');
        return;
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      showAlert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      showAlert('Password mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);

    // For coaches, make sure the username isn't already taken before we create anything.
    if (role === 'coach') {
      const { data: taken } = await supabase
        .from('profiles')
        .select('id')
        .eq('coach_username', username)
        .maybeSingle();
      if (taken) {
        setLoading(false);
        showAlert('Username taken', `"${username}" is already in use. Please pick another.`);
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    if (error) {
      setLoading(false);
      showAlert('Sign up failed', error.message);
      return;
    }

    if (data.user) {
      const profilePayload: any = {
        id: data.user.id,
        full_name: fullName,
        is_coach: role === 'coach',
        club: club.trim() || null,
      };
      if (role === 'coach') {
        profilePayload.coach_username = username;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profilePayload);

      if (profileError) {
        setLoading(false);
        // Most likely a race on the unique username; tell them plainly.
        if (String(profileError.message).toLowerCase().includes('coach_username')) {
          showAlert('Username taken', `"${username}" was just taken. Please pick another.`);
        } else {
          showAlert('Error', 'Could not finish creating your profile. Please try again.');
        }
        return;
      }
    }

    setLoading(false);

    // Coaches go to their roster home; players go to the normal tabs.
    if (role === 'coach') {
      router.replace('/coach' as any);
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor={Colors.textSecondary}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          {/* Role picker */}
          <Text style={styles.label}>I am a...</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'player' && styles.roleBtnActive]}
              onPress={() => setRole('player')}
            >
              <MaterialCommunityIcons
                name="badminton"
                size={22}
                color={role === 'player' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.roleBtnText, role === 'player' && styles.roleBtnTextActive]}>Player</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'coach' && styles.roleBtnActive]}
              onPress={() => setRole('coach')}
            >
              <MaterialCommunityIcons
                name="whistle"
                size={22}
                color={role === 'coach' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.roleBtnText, role === 'coach' && styles.roleBtnTextActive]}>Coach</Text>
            </TouchableOpacity>
          </View>

          {/* Club — required for coaches, optional for players */}
          <Text style={styles.label}>
            Club {role === 'player' ? <Text style={styles.optional}>(optional)</Text> : null}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={role === 'coach' ? 'Which club do you coach at?' : 'Your club (if you have one)'}
            placeholderTextColor={Colors.textSecondary}
            value={club}
            onChangeText={setClub}
            autoCapitalize="words"
          />

          {/* Coach username */}
          {role === 'coach' && (
            <>
              <Text style={styles.label}>Coach Username</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. coach_priya"
                placeholderTextColor={Colors.textSecondary}
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.usernameHint}>
                Players add you with this. Share it with them in person. Lowercase letters, numbers, and underscores only.
              </Text>
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor={Colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Min 6 characters"
            placeholderTextColor={Colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor={Colors.textSecondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/login' as any)}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.link}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 160, height: 60, marginBottom: 32 },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 24, width: '100%' },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 24 },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  optional: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },
  input: {
    backgroundColor: Colors.backgroundTop,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.backgroundTop,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  roleBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  roleBtnTextActive: { color: '#FFFFFF' },
  usernameHint: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginTop: -8, marginBottom: 16 },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  linkText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' },
  link: { color: Colors.accent, fontWeight: 'bold' },
});
