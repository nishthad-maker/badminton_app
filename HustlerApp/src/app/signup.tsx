import { View, StyleSheet, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { supabase } from '../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';

type LocationSuggestion = { label: string };

// Free, no-signup-required city search — Photon (komoot's OSM-based
// geocoder), not Nominatim directly: Nominatim's usage policy actively
// 403s browser-origin autocomplete requests (confirmed while building
// this), while Photon is purpose-built for exactly this type-ahead case
// and answers cross-origin fetches fine. Debounced client-side below.
const searchLocations = async (query: string): Promise<LocationSuggestion[]> => {
  if (query.trim().length < 3) return [];
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const labels: string[] = (data?.features ?? []).map((f: any) => {
      const p = f.properties ?? {};
      const parts = [p.name, p.state, p.country].filter(Boolean);
      return parts.join(', ');
    }).filter(Boolean);
    // Photon can return the same city more than once (e.g. matched by both
    // its center point and a nearby boundary way) — same label, same row,
    // so dedupe rather than show it twice.
    return [...new Set(labels)].map((label) => ({ label }));
  } catch {
    return [];
  }
};

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

type Role = 'player' | 'coach' | 'club' | 'parent';

const VALID_ROLES: Role[] = ['player', 'coach', 'club', 'parent'];

export default function SignUpScreen() {
  const { role: presetRole } = useLocalSearchParams<{ role?: string }>();
  const roleLocked = VALID_ROLES.includes(presetRole as Role);
  const initialRole = roleLocked ? (presetRole as Role) : null;
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role | null>(initialRole);
  // Role picker is its own "Get Started" step so arriving at /signup with
  // no preset role (e.g. from the login screen) doesn't dump you straight
  // into the full account form — you pick a role, tap Next, then fill it in.
  const [step, setStep] = useState<0 | 1>(roleLocked ? 1 : 0);
  const [username, setUsername] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubLocation, setClubLocation] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationPicked, setLocationPicked] = useState(false);
  const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coachClub, setCoachClub] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Debounced search as the club owner types — skipped once they've tapped
  // a suggestion (locationPicked) so the list doesn't reappear under an
  // already-chosen value if they touch the field again (e.g. tab away/back).
  useEffect(() => {
    if (locationPicked) return;
    if (locationDebounce.current) clearTimeout(locationDebounce.current);
    locationDebounce.current = setTimeout(async () => {
      setLocationSuggestions(await searchLocations(clubLocation));
    }, 400);
    return () => { if (locationDebounce.current) clearTimeout(locationDebounce.current); };
  }, [clubLocation, locationPicked]);

  const pickLocation = (label: string) => {
    setClubLocation(label);
    setLocationPicked(true);
    setLocationSuggestions([]);
  };

  // Typing "None" (any casing) is the one thing that reveals the username
  // field — leaving the club field blank doesn't, so there's no ambiguous
  // "haven't decided yet" state where a username silently gets requested
  // before they've said either way. Anything else typed reads as a real
  // club name; they'll connect to it with a code after logging in (see the
  // gate on the Players tab).
  const typedNone = coachClub.trim().toLowerCase() === 'none';
  const isClubCoach = role === 'coach' && coachClub.trim() !== '' && !typedNone;

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      showAlert('Missing fields', 'Please fill in all fields.');
      return;
    }

    if (fullName.trim().length < 2) {
      showAlert('Invalid name', 'Please enter your full name.');
      return;
    }

    // Coach-specific requirements — a coach who names a real club connects
    // via that club's roster instead of the username system, so they never
    // need (or get) a coach_username at all.
    if (role === 'coach') {
      if (!coachClub.trim()) {
        showAlert('Missing club', 'Type your club\'s name, or "None" if you\'re not with one.');
        return;
      }
      if (!isClubCoach && !/^[a-z0-9_]{3,20}$/.test(username)) {
        showAlert('Invalid username', 'Your coach username should be 3–20 characters: lowercase letters, numbers, or underscores.');
        return;
      }
    }

    // Club-specific requirements
    if (role === 'club' && !clubName.trim()) {
      showAlert('Missing club name', 'Please enter your club name.');
      return;
    }
    if (role === 'club' && !clubLocation.trim()) {
      showAlert('Missing location', 'Please enter your club\'s location.');
      return;
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

    // For independent coaches, make sure the username isn't already taken
    // before we create anything — club coaches skip this entirely, they
    // never get a username.
    if (role === 'coach' && !isClubCoach) {
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
        role,
      };
      if (role === 'coach' && !isClubCoach) {
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

      // Club accounts get their club created right away, using the same
      // owner-bootstrap order as club-setup.tsx (clubs -> club_coaches ->
      // club_settings). If any step here fails, don't block account
      // creation over it — they can always finish via the "Complete Setup"
      // prompt shown on first login into the club-admin section.
      if (role === 'club') {
        const { data: club, error: clubError } = await supabase
          .from('clubs')
          .insert({ owner_id: data.user.id, name: clubName.trim(), location: clubLocation.trim() || null })
          .select()
          .single();

        if (!clubError && club) {
          const { error: coachError } = await supabase
            .from('club_coaches')
            .insert({ club_id: club.id, coach_id: data.user.id, role: 'owner' });
          if (!coachError) {
            await supabase.from('club_settings').insert({ club_id: club.id });
          }
        }
      }
    }

    // Sign back out so the user lands on the login screen in a clean,
    // logged-out state rather than already being authenticated there.
    await supabase.auth.signOut();
    setLoading(false);
    showAlert(
      'Account created',
      isClubCoach ? 'Please log in — then enter your club\'s coach code to connect.' : 'Please log in to continue.'
    );
    router.replace('/login' as any);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('../../assets/images/logo-green.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.card}>
          {step === 0 ? (
            <>
              <Text style={styles.eyebrow}>GET STARTED</Text>
              <Text style={styles.title}>How will you use smasho?</Text>
              <Text style={styles.subtitle}>We'll take you to the right sign-up next.</Text>

              <Text style={styles.label}>I am a...</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[styles.roleBtn, role === 'player' && styles.roleBtnActive]}
                  onPress={() => setRole('player')}
                >
                  <Icon
                    name="badminton"
                    size={26}
                    color={role === 'player' ? '#FFFFFF' : Theme.textSecondary}
                  />
                  <Text style={[styles.roleBtnText, role === 'player' && styles.roleBtnTextActive]}>Player</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, role === 'coach' && styles.roleBtnActive]}
                  onPress={() => setRole('coach')}
                >
                  <Icon
                    name="whistle"
                    size={26}
                    color={role === 'coach' ? '#FFFFFF' : Theme.textSecondary}
                  />
                  <Text style={[styles.roleBtnText, role === 'coach' && styles.roleBtnTextActive]}>Coach</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[styles.roleBtn, role === 'club' && styles.roleBtnActive]}
                  onPress={() => setRole('club')}
                >
                  <Icon
                    name="office-building-outline"
                    size={26}
                    color={role === 'club' ? '#FFFFFF' : Theme.textSecondary}
                  />
                  <Text style={[styles.roleBtnText, role === 'club' && styles.roleBtnTextActive]}>Club</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, role === 'parent' && styles.roleBtnActive]}
                  onPress={() => setRole('parent')}
                >
                  <Icon
                    name="account-child-outline"
                    size={26}
                    color={role === 'parent' ? '#FFFFFF' : Theme.textSecondary}
                  />
                  <Text style={[styles.roleBtnText, role === 'parent' && styles.roleBtnTextActive]}>Parent</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.button, !role && styles.buttonDisabled]}
                onPress={() => role && setStep(1)}
                disabled={!role}
              >
                <Text style={styles.buttonText}>Next</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/login' as any)}>
                <Text style={styles.linkText}>
                  Already have an account? <Text style={styles.link}>Log In</Text>
                </Text>
              </TouchableOpacity>
            </>
          ) : (
          <>
          {!roleLocked && (
            <TouchableOpacity style={styles.backLink} onPress={() => setStep(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="chevron-left" size={18} color={Theme.textSecondary} />
              <Text style={styles.backLinkText}>Change role</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.eyebrow}>GET STARTED</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            {role ? `Setting up your ${role.charAt(0).toUpperCase()}${role.slice(1)} account.` : 'Set up your account to get started.'}
          </Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor={Theme.textSecondary}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          {/* Club name + location */}
          {role === 'club' && (
            <>
              <Text style={styles.label}>Club Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ace Badminton Club"
                placeholderTextColor={Theme.textSecondary}
                value={clubName}
                onChangeText={setClubName}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Location</Text>
              <TextInput
                style={[styles.input, locationSuggestions.length > 0 && styles.inputConnected]}
                placeholder="Start typing a city..."
                placeholderTextColor={Theme.textSecondary}
                value={clubLocation}
                onChangeText={(t) => { setClubLocation(t); setLocationPicked(false); }}
                autoCapitalize="words"
              />
              {locationSuggestions.length > 0 && (
                <View style={styles.suggestionList}>
                  {locationSuggestions.map((s, i) => (
                    <TouchableOpacity
                      key={`${s.label}_${i}`}
                      style={[styles.suggestionRow, i > 0 && styles.suggestionRowDivider]}
                      onPress={() => pickLocation(s.label)}
                    >
                      <Icon name="map-marker-outline" size={15} color={Theme.textSecondary} />
                      <Text style={styles.suggestionText}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={styles.usernameHint}>
                Coaches and parents will see this to know which physical club this is.
              </Text>
            </>
          )}

          {/* Coach club affiliation */}
          {role === 'coach' && (
            <>
              <Text style={styles.label}>Which club are you with?</Text>
              <TextInput
                style={styles.input}
                placeholder="Club name, or type None"
                placeholderTextColor={Theme.textSecondary}
                value={coachClub}
                onChangeText={setCoachClub}
                autoCapitalize="words"
              />
              <Text style={styles.usernameHint}>
                {isClubCoach
                  ? "You'll enter your club's coach code to connect after logging in — no username needed."
                  : "Type \"None\" if you coach independently, outside of a club."}
              </Text>
            </>
          )}

          {/* Coach username — only once "None" is actually typed, not while
              the club field is still blank */}
          {role === 'coach' && typedNone && (
            <>
              <Text style={styles.label}>Coach Username</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. coach_priya"
                placeholderTextColor={Theme.textSecondary}
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
            placeholderTextColor={Theme.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Min 6 characters"
            placeholderTextColor={Theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor={Theme.textSecondary}
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
              Already have an account? <Text style={styles.link}>Log In</Text>
            </Text>
          </TouchableOpacity>
          </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { flexGrow: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
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
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: 14 },
  backLinkText: { fontSize: 14, color: Theme.textSecondary, fontWeight: '600' },
  eyebrow: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.eyebrowGreen, letterSpacing: 1.5, marginBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 32, color: Theme.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 26 },
  label: { fontSize: 15, fontWeight: '600', color: Theme.textSecondary, marginBottom: 8 },
  // Sits flush against the input above it — same side borders, square top
  // corners so the two read as one connected control, rounded only at the
  // bottom. Rows are divided by a hairline rather than each being its own
  // bordered pill, so the whole thing scans as a single dropdown.
  suggestionList: {
    marginBottom: 18,
    backgroundColor: Theme.background,
    borderWidth: 1,
    borderColor: Theme.divider,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 13 },
  suggestionRowDivider: { borderTopWidth: 1, borderTopColor: Theme.divider },
  suggestionText: { flex: 1, fontSize: 14, color: Theme.textPrimary },
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
  inputConnected: { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Theme.background,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  roleBtnActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  roleBtnText: { fontSize: 15, color: Theme.textSecondary, fontWeight: '600' },
  roleBtnTextActive: { color: '#FFFFFF' },
  usernameHint: { fontSize: 14, color: Theme.textSecondary, lineHeight: 19, marginTop: -8, marginBottom: 18 },
  button: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 17 },
  linkText: { color: Theme.textSecondary, fontSize: 16, textAlign: 'center' },
  link: { color: Theme.eyebrowGreen, fontWeight: 'bold' },
});
