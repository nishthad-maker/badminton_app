import { TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { JournalSheet, localDateStr } from './JournalSheet';

const INK = '#44403C';

// Mounted once in the (tabs) layout (not per-screen). Opening it resumes
// today's draft where it was left off (JournalSheet auto-loads the most
// recent unsaved draft for today), or starts blank if there isn't one yet.
// A "+" inside the sheet itself starts a genuinely new entry.
export function JournalFAB() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)}>
        <Icon name="notebook-outline" size={24} color={INK} />
      </TouchableOpacity>
      <JournalSheet
        visible={open}
        onClose={() => setOpen(false)}
        entryDate={localDateStr()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 96,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 20,
  },
});
