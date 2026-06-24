import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';  
import { router } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
      <View style={styles.logoCircle}>
      <Octicons name="flame" size={28} color="#FF6B00" />
    </View>
    <View>
    <Text style={styles.title}>HUSTLER</Text>
    <Text style={styles.tagline}>Train Hard. Stay Consistent.</Text>
    </View>
  </View>
      <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts?category=lower')}>
        <Text style={styles.cardTitle}>Lower Body Day</Text>
        <Text style={styles.cardSub}>Quads, Hamstrings, Glutes</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts?category=upper')}>
        <Text style={styles.cardTitle}>Upper Body Day</Text>
        <Text style={styles.cardSub}>Chest, Back, Shoulders</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts?category=core')}>
        <Text style={styles.cardTitle}>Core Day</Text>
        <Text style={styles.cardSub}>Abs, Obliques, Lower Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 60,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2D1B0E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF6B00',
  },
  tagline: {
    fontSize: 14,
    color: '#A89880',
    marginTop: 8,
    marginBottom: 30,
  },
  card: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B00',
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cardSub: {
    fontSize: 13,
    color: '#A89880',
    marginTop: 4,
  },
});