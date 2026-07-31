import { View, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { useState } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { formatTime12h } from '@/lib/scheduling';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const MERIDIEMS: ('AM' | 'PM')[] = ['AM', 'PM'];

type Draft = { hour12: number; minute: number; meridiem: 'AM' | 'PM' };

const from24h = (time: string): Draft => {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10) || 0;
  const minute = parseInt(mStr, 10) || 0;
  const meridiem: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, meridiem };
};

const to24h = (draft: Draft): string => {
  let h = draft.hour12 % 12;
  if (draft.meridiem === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`;
};

const formatDisplay = (time: string | null): string => {
  if (!time) return 'Select time';
  return formatTime12h(time);
};

type Props = {
  value: string | null; // "HH:MM" 24h
  onChange: (time: string) => void;
  placeholder?: string;
};

// A no-free-text time picker: tapping the field opens hour / minute / AM-PM
// columns to choose from, so there's never an ambiguous typed string like
// "4:00" (which reads differently on a 12h vs. 24h expectation).
export function TimePicker({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => from24h(value ?? '09:00'));

  const openPicker = () => {
    setDraft(from24h(value ?? '09:00'));
    setOpen(true);
  };

  const confirm = () => {
    onChange(to24h(draft));
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker}>
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]}>{value ? formatDisplay(value) : (placeholder ?? 'Select time')}</Text>
        <Icon name="clock-outline" size={20} color={Theme.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Icon name="close-circle-outline" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.columns}>
              <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <TouchableOpacity key={h} style={[styles.option, draft.hour12 === h && styles.optionActive]} onPress={() => setDraft((d) => ({ ...d, hour12: h }))}>
                    <Text style={[styles.optionText, draft.hour12 === h && styles.optionTextActive]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => (
                  <TouchableOpacity key={m} style={[styles.option, draft.minute === m && styles.optionActive]} onPress={() => setDraft((d) => ({ ...d, minute: m }))}>
                    <Text style={[styles.optionText, draft.minute === m && styles.optionTextActive]}>{String(m).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.column}>
                {MERIDIEMS.map((mer) => (
                  <TouchableOpacity key={mer} style={[styles.option, draft.meridiem === mer && styles.optionActive]} onPress={() => setDraft((d) => ({ ...d, meridiem: mer }))}>
                    <Text style={[styles.optionText, draft.meridiem === mer && styles.optionTextActive]}>{mer}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirm}>
              <Text style={styles.confirmText}>Done — {formatDisplay(to24h(draft))}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: Theme.divider, marginBottom: 10 },
  fieldText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textPrimary },
  fieldPlaceholder: { color: Theme.textSecondary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet: { backgroundColor: Theme.background, borderRadius: 20, padding: 20, width: 300, maxHeight: '70%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Theme.textPrimary },
  columns: { flexDirection: 'row', gap: 8, height: 220 },
  column: { flex: 1 },
  option: { paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginBottom: 4 },
  optionActive: { backgroundColor: Theme.eyebrowGreen },
  optionText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textSecondary },
  optionTextActive: { color: '#FFFFFF' },
  confirmBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  confirmText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 15 },
});
