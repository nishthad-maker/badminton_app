import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { Theme } from '@/constants/theme';
import { TagCategory } from '@/constants/matchTags';

type Props = {
  categories: TagCategory[];
  selected: string[];
  onChange: (next: string[]) => void;
};

export function TagChipSelector({ categories, selected, onChange }: Props) {
  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag]);
  };

  return (
    <View style={styles.wrap}>
      {categories.map(cat => (
        <View key={cat.key} style={styles.category}>
          <Text style={styles.categoryLabel}>{cat.label.toUpperCase()}</Text>
          <View style={styles.chipRow}>
            {cat.tags.map(tag => {
              const active = selected.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggle(tag)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{tag}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  category: { gap: 8 },
  categoryLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.textSecondary, letterSpacing: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  chipActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  chipText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
});
