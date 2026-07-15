import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';
import { JournalSheet, localDateStr } from './JournalSheet';

const INK = '#44403C';

// Mounted once in the (tabs) layout (not per-screen), so it doesn't get
// per-tab focus events — check on mount, then rely on onSaved to stay fresh.
export function JournalFAB() {
  const [open, setOpen] = useState(false);
  const [hasToday, setHasToday] = useState(false);

  const checkToday = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from('journal_entries').select('id').eq('user_id', session.user.id).eq('entry_date', localDateStr()).single();
    setHasToday(!!data);
  }, []);

  useEffect(() => { checkToday(); }, [checkToday]);

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)}>
        <MaterialCommunityIcons name="book-open-page-variant" size={24} color={INK} />
        {hasToday && (
          <View style={styles.badge}>
            <MaterialCommunityIcons name="check" size={10} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
      <JournalSheet
        visible={open}
        onClose={() => setOpen(false)}
        entryDate={localDateStr()}
        onSaved={checkToday}
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
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
