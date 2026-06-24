import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import workouts from '../data/workouts';

export default function WorkoutsScreen() {
  const { category } = useLocalSearchParams();
  const exercises = (workouts as any)[category as string] || [];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>
        {category === 'lower' && 'Lower Body Day'}
        {category === 'upper' && 'Upper Body Day'}
        {category === 'core' && 'Core Day'}
      </Text>
      {exercises.map((exercise: any, index: number) => (
        <TouchableOpacity 
          key={index} 
          style={styles.card}
          onPress={() => router.push({
            pathname: '/exercise',
            params: {
              name: exercise.name,
              description: exercise.description,
            }
          })}
        >
          <Text style={styles.cardTitle}>{exercise.name}</Text>
          <Text style={styles.cardDesc}>{exercise.description}</Text>
          <View style={styles.tagRow}>
            {exercise.muscles.map((muscle: any, i: number) => (
              <Text key={i} style={styles.tag}>{muscle}</Text>
            ))}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B00',
    marginTop: 20,
    marginBottom: 20,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#A89880',
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tag: {
    backgroundColor: '#2D1B0E',
    color: '#FF6B00',
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginRight: 6,
    marginTop: 4,
  },
});