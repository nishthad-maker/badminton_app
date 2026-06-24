import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';  
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HUSTLER</Text>
      <Text style={styles.tagline}>Train Hard. Stay Consistent.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
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
});