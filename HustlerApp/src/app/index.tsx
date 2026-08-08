import { View, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Theme, Fonts, CategoryTheme } from '@/constants/theme';
import { Icon } from '@/components/icons/Icon';
import { supabase } from '../lib/supabase';
import { resolveMyRole, ROLE_HOME_ROUTE } from '../lib/roleRouting';

type Role = 'player' | 'coach' | 'club' | 'parent';

const FEATURES: { tag: string; bg: string; fg: string; title: string; desc: string }[] = [
  {
    tag: 'TRAIN',
    bg: CategoryTheme.footwork.bg,
    fg: CategoryTheme.footwork.fg,
    title: 'Workouts built for badminton',
    desc: '45+ drills across strength, footwork, endurance and recovery, plus weekly plans from your coach.',
  },
  {
    tag: 'TRACK',
    bg: CategoryTheme.strength.bg,
    fg: CategoryTheme.strength.fg,
    title: 'Every session and match logged',
    desc: 'Log training and matches, and watch your strengths and weaknesses turn into a real progress picture.',
  },
  {
    tag: 'COMPETE',
    bg: CategoryTheme.endurance.bg,
    fg: CategoryTheme.endurance.fg,
    title: 'Tournaments, tracked automatically',
    desc: 'Log matches against real opponents and follow named tournaments with a running head-to-head history.',
  },
  {
    tag: 'TOGETHER',
    bg: CategoryTheme.recovery.bg,
    fg: CategoryTheme.recovery.fg,
    title: 'Clubs, coaches and parents in sync',
    desc: 'Join a club with a code, connect to your coach by username, and let parents follow along and request lessons.',
  },
];

const ROLES: { key: Role; label: string; desc: string; icon: string }[] = [
  { key: 'player', label: 'Player', desc: 'Train, log sessions and track your progress', icon: 'account' },
  { key: 'parent', label: 'Parent', desc: 'Follow your child, schedule and stay in the loop', icon: 'heart-outline' },
  { key: 'coach', label: 'Coach', desc: 'Share workouts and assign weekly plans', icon: 'clipboard-text-outline' },
  { key: 'club', label: 'Club', desc: 'Run court scheduling, events and members', icon: 'office-building-outline' },
];

export default function HomeScreen() {
  const [step, setStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const role = await resolveMyRole();
        if (role) router.replace(ROLE_HOME_ROUTE[role] as any);
      }
    };
    checkSession();
  }, []);

  const goToRolePicker = () => setStep(2);
  const enterSignup = () => {
    if (!selectedRole) return;
    router.push(`/signup?role=${selectedRole}` as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Image source={require('../../assets/images/logo-green.png')} style={styles.brandLogo} resizeMode="contain" />
        {step < 2 ? (
          <TouchableOpacity onPress={goToRolePicker} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipSpacer} />
        )}
      </View>

      <View style={styles.body}>
        {step === 0 && (
          <View style={styles.screen}>
            <Text style={styles.eyebrow}>FOR PLAYERS, PARENTS, COACHES & CLUBS</Text>
            <Text style={styles.headline}>Every Shuttle Counts.</Text>
            <Text style={styles.subtext}>Training, matches, tournaments and your whole club — all in one place.</Text>

            <LinearGradient
              colors={[Theme.limeAccent, Theme.background]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.heroCard}
            >
              <Image source={require('../../assets/images/birdie-mark.png')} style={styles.heroBirdie} resizeMode="contain" />
            </LinearGradient>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>45+</Text>
                <Text style={styles.statLabel}>Exercises</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>4</Text>
                <Text style={styles.statLabel}>Roles, one app</Text>
              </View>
            </View>
          </View>
        )}

        {step === 1 && (
          <ScrollView style={styles.screen} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={styles.eyebrow}>WHAT'S INSIDE</Text>
            <Text style={styles.headline}>Everything your game needs.</Text>

            <View style={{ gap: 14, marginTop: 20 }}>
              {FEATURES.map((f) => (
                <View key={f.tag} style={styles.featureCard}>
                  <View style={[styles.featureTag, { backgroundColor: f.bg }]}>
                    <Text style={[styles.featureTagText, { color: f.fg }]}>{f.tag}</Text>
                  </View>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView style={styles.screen} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={styles.eyebrow}>LAST STEP</Text>
            <Text style={styles.headline}>How will you use smasho?</Text>
            <Text style={styles.subtext}>We'll take you straight to the right sign-up.</Text>

            <View style={{ gap: 12, marginTop: 20 }}>
              {ROLES.map((r) => {
                const active = selectedRole === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.roleCard, active && styles.roleCardActive]}
                    onPress={() => setSelectedRole(r.key)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.roleIconWrap, active && styles.roleIconWrapActive]}>
                      <Icon name={r.icon} size={22} color={active ? Theme.limeAccentDark : Theme.eyebrowGreen} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>{r.label}</Text>
                      <Text style={[styles.roleDesc, active && styles.roleDescActive]}>{r.desc}</Text>
                    </View>
                    {active && <Icon name="check" size={20} color={Theme.limeAccent} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        {step === 0 && (
          <>
            <TouchableOpacity style={styles.ctaButton} onPress={() => setStep(1)}>
              <Text style={styles.ctaText}>Get started</Text>
              <Icon name="chevron-right" size={20} color={Theme.limeAccentDark} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/login' as any)} style={styles.loginLink}>
              <Text style={styles.loginText}>
                Already playing with us? <Text style={styles.loginTextBold}>Log in</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 1 && (
          <TouchableOpacity style={styles.ctaButton} onPress={() => setStep(2)}>
            <Text style={styles.ctaText}>Continue</Text>
            <Icon name="chevron-right" size={20} color={Theme.limeAccentDark} />
          </TouchableOpacity>
        )}

        {step === 2 && (
          <TouchableOpacity
            style={[styles.ctaButton, !selectedRole && styles.ctaButtonDisabled]}
            onPress={enterSignup}
            disabled={!selectedRole}
          >
            <Text style={styles.ctaText}>Enter smasho</Text>
            <Icon name="chevron-right" size={20} color={Theme.limeAccentDark} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 8,
  },
  brandLogo: { width: 76, height: 44 },
  skipText: { fontSize: 15, color: Theme.textSecondary, fontWeight: '600' },
  skipSpacer: { width: 32 },

  body: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },

  eyebrow: { fontSize: 11, fontWeight: '700', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 10 },
  headline: { fontFamily: Fonts.serifSemiBold, fontSize: 32, lineHeight: 38, color: Theme.textPrimary },
  subtext: { fontSize: 15, color: Theme.textSecondary, marginTop: 10, lineHeight: 21 },

  heroCard: {
    borderRadius: 28,
    marginTop: 24,
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroBirdie: { width: '46%', height: '55%' },

  statsRow: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18 },
  statNumber: { fontSize: 26, fontWeight: 'bold', color: Theme.textPrimary },
  statLabel: { fontSize: 13, color: Theme.textSecondary, marginTop: 4 },

  featureCard: { backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 18 },
  featureTag: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 10 },
  featureTagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  featureTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Theme.textPrimary, marginBottom: 6 },
  featureDesc: { fontSize: 14, color: Theme.textSecondary, lineHeight: 20 },

  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  roleCardActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  roleIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Theme.background,
    alignItems: 'center', justifyContent: 'center',
  },
  roleIconWrapActive: { backgroundColor: Theme.limeAccent },
  roleLabel: { fontSize: 16, fontWeight: '700', color: Theme.textPrimary },
  roleLabelActive: { color: Theme.onDarkPrimary },
  roleDesc: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  roleDescActive: { color: Theme.onDarkSecondary },

  footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 8 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Theme.divider },
  dotActive: { width: 20, backgroundColor: Theme.eyebrowGreen },

  ctaButton: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 30,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  ctaButtonDisabled: { opacity: 0.45 },
  ctaText: { fontSize: 16, fontWeight: 'bold', color: Theme.limeAccentDark },
  loginLink: { alignItems: 'center', marginTop: 14 },
  loginText: { fontSize: 14, color: Theme.textSecondary },
  loginTextBold: { color: Theme.eyebrowGreen, fontWeight: '700' },
});
