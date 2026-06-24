import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import workouts from '../data/workouts';

export default function ExerciseScreen() {
  const { name, description } = useLocalSearchParams();
  
  const allExercises = [
    ...(workouts as any).lower,
    ...(workouts as any).upper,
    ...(workouts as any).core,
  ];

  const exercise = allExercises.find((ex: any) => ex.name === name);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{name}</Text>
      <View style={styles.tabRow}>
        <View style={styles.activeTab}>
          <Text style={styles.activeTabText}>How To</Text>
        </View>
        <View style={styles.inactiveTab}>
          <Text style={styles.inactiveTabText}>Notes</Text>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>Steps</Text>
        {exercise?.steps.map((step: string, index: number) => (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNum}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B00',
    marginTop: 20,
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 20,
  },
  activeTab: {
    backgroundColor: '#FF6B00',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  activeTabText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  inactiveTab: {
    backgroundColor: '#2D2D2D',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  inactiveTabText: {
    color: 'gray',
    fontSize: 14,
  },
  description: {
    fontSize: 14,
    color: '#A89880',
    lineHeight: 22,
    marginBottom: 16,
  },
  stepsCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B00',
    padding: 16,
    marginTop: 8,
  },
  stepsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B00',
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B00',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 13,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 22,
  },
});