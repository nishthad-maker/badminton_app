import { TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { JournalSheet, localDateStr } from './JournalSheet';

const INK = '#44403C';

type Props = {
  // Set from a deep link (e.g. the post-lesson nudge push, via
  // ?openJournal=lesson on the (tabs) group) to pop the sheet open straight
  // into a blank entry of this type, skipping the type-picker step.
  autoOpenType?: 'lesson' | 'personal' | null;
};

// Mounted once in the (tabs) layout (not per-screen). A normal tap resumes
// today's draft where it was left off (JournalSheet auto-loads the most
// recent unsaved draft for today), or starts blank if there isn't one yet.
// A "+" inside the sheet itself starts a genuinely new entry.
export function JournalFAB({ autoOpenType }: Props) {
  const [open, setOpen] = useState(false);
  const [forceNewOnOpen, setForceNewOnOpen] = useState(false);
  // Guards against re-opening on every re-render while the deep-link param
  // is still present in the URL — only react to it actually changing.
  const consumedAutoOpen = useRef<string | null>(null);

  useEffect(() => {
    if (autoOpenType && consumedAutoOpen.current !== autoOpenType) {
      consumedAutoOpen.current = autoOpenType;
      setForceNewOnOpen(true);
      setOpen(true);
    }
  }, [autoOpenType]);

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => { setForceNewOnOpen(false); setOpen(true); }}>
        <Icon name="notebook-outline" size={24} color={INK} />
      </TouchableOpacity>
      <JournalSheet
        visible={open}
        onClose={() => setOpen(false)}
        entryDate={localDateStr()}
        forceNew={forceNewOnOpen}
        initialEntryType={forceNewOnOpen ? autoOpenType : undefined}
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
