import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';

const navigate = (category: string) => {
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = `/workouts?category=${category}`;
  } else {
    const { router } = require('expo-router');
    router.push({ pathname: '/workouts', params: { category } });
  }
};

export default function TrainScreen() {
  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <Text style={styles.title}>Train</Text>
      <View style={styles.cards}>
        <TouchableOpacity style={styles.card} onPress={() => navigate('strength')}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
            <MaterialCommunityIcons name="dumbbell" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Strength Training</Text>
            <Text style={styles.cardSub}>Legs, Core, Upper Body</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigate('footwork')}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(52,152,219,0.15)' }]}>
            <MaterialCommunityIcons name="badminton" size={24} color="#3498DB" />
          </View>
          <View>
            <Text style={styles.cardTitle}>Footwork Drills</Text>
            <Text style={styles.cardSub}>Speed, Agility, Court Movement</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigate('endurance')}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(230,126,34,0.15)' }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={24} color="#E67E22" />
          </View>
          <View>
            <Text style={styles.cardTitle}>Endurance</Text>
            <Text style={styles.cardSub}>Stamina, Rally Fitness, Interval</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigate('recovery')}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(155,89,182,0.15)' }]}>
            <MaterialCommunityIcons name="heart-pulse" size={24} color="#9B59B6" />
          </View>
          <View>
            <Text style={styles.cardTitle}>Recovery</Text>
            <Text style={styles.cardSub}>Stretching, Foam Rolling, Breathing</Text>
          </View>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 24 },
  cards: { gap: 12 },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  cardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
});