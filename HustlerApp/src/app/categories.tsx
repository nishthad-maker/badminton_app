import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';

export default function CategoriesScreen() {
  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      {/* Profile Button */}
      <TouchableOpacity
        style={styles.profileBtn}
        onPress={() => router.push('/profile' as any)}
      >
        <MaterialCommunityIcons name="account-circle" size={32} color={Colors.accent} />
      </TouchableOpacity>

      <Text style={styles.title}>Workouts</Text>

      <View style={styles.cards}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/workouts?category=footwork' as any)}
        >
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="badminton" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Footwork Drills</Text>
            <Text style={styles.cardSub}>Speed, Agility, Court Movement</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/workouts?category=strength' as any)}
        >
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="dumbbell" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Strength Training</Text>
            <Text style={styles.cardSub}>Legs, Core, Upper Body</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/workouts?category=endurance' as any)}
        >
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="lightning-bolt" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Endurance</Text>
            <Text style={styles.cardSub}>Stamina, Rally Fitness, Interval</Text>
          </View>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 16,
  },
  profileBtn: {
    position: 'absolute',
    top: 16,
    right: 24,
    zIndex: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 24,
    marginTop: 16,
  },
  cards: {
    gap: 12,
  },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
});