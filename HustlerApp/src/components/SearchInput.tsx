import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { TextInput } from './TextInput';
import { Icon } from './icons/Icon';
import { Theme, Fonts } from '@/constants/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
};

// Shared search field so every search box in the app looks and behaves the
// same: a magnifying-glass icon up front (nothing distinguished these from
// regular text fields before), plus the visible-caret fix `TextInput` already
// gives every input in the app.
export function SearchInput({ value, onChangeText, placeholder, style, autoFocus }: Props) {
  return (
    <View style={[styles.wrapper, style]}>
      <Icon name="magnify" size={18} color={Theme.textSecondary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? 'Search'}
        placeholderTextColor={Theme.textSecondary}
        autoFocus={autoFocus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Theme.divider,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular,
    fontSize: 16,
  },
});
