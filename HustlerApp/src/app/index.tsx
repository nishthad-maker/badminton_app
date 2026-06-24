import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';  
import { router } from 'expo-router';
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HUSTLER</Text>
      <Text style={styles.tagline}>Train Hard. Stay Consistent.</Text>
    <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts')}>
      <Text style={styles.cardTitle}>Lower Body Day</Text>
      <Text style={styles.cardSub}>Quads, Hamstrings, Glutes</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts')}>
      <Text style={styles.cardTitle}>Upper Body Day</Text>
      <Text style={styles.cardSub}>Chest, Back, Shoulders</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts')}>
      <Text style={styles.cardTitle}>Core Day</Text>
      <Text style={styles.cardSub}>Abs, Obliques, Lower Back</Text>
    </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color:'#FF6B00',
    marginTop: 60,
  },
  tagline: {
    fontSize: 14,
    color: '#A89880',
    marginTop: 8 ,
  }, 
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B00',
    padding: 16,
    marginTop: 20,
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