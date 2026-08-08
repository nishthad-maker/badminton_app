import { Modal, View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { TimePicker } from './TimePicker';
import { MiniDatePicker } from './MiniDatePicker';
import { TextInput } from './TextInput';
import { formatTime12h, localDateStr } from '../lib/scheduling';
import { getClubCourts, Court } from '../lib/courts';
import { MaintenanceBlock, getClubMaintenanceBlocks, addMaintenanceBlock, removeMaintenanceBlock } from '../lib/maintenanceBlocks';
import { showConfirm } from '../lib/ui';

type Props = {
  clubId: string;
  visible: boolean;
  onClose: () => void;
};

const formatDateStr = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Ad-hoc court closures (resurfacing, a broken net, a private event) — one
// standalone date/time block per court, distinct from the per-lesson-slot
// court overrides in tiers.tsx. Once added, a block folds into the
// unified calendar's open-gap timeline as "not open," same as any lesson.
export function MaintenanceBlockModal({ clubId, visible, onClose }: Props) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [blocks, setBlocks] = useState<MaintenanceBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [courtId, setCourtId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [courtRows, blockRows] = await Promise.all([
      getClubCourts(clubId),
      getClubMaintenanceBlocks(clubId),
    ]);
    setCourts(courtRows);
    setBlocks(blockRows);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const resetDraft = () => {
    setCourtId(null); setDate(null); setStartTime(null); setEndTime(null); setReason('');
  };

  const handleClose = () => {
    resetDraft();
    onClose();
  };

  const submittable = !!courtId && !!date && !!startTime && !!endTime && endTime > startTime;

  const submit = async () => {
    if (!submittable || !courtId || !date || !startTime || !endTime) return;
    setSaving(true);
    const res = await addMaintenanceBlock({ clubId, courtId, date, startTime, endTime, reason: reason.trim() || null });
    setSaving(false);
    if (res.ok) {
      setDate(null); setStartTime(null); setEndTime(null); setReason('');
      load();
    }
  };

  const remove = (block: MaintenanceBlock) => {
    showConfirm('Remove this block?', 'The court will show as open again during this time.', async () => {
      await removeMaintenanceBlock(block.id);
      load();
    }, 'Remove');
  };

  // Past blocks just clutter the list — only upcoming ones matter for
  // planning around.
  const today = localDateStr();
  const upcoming = blocks.filter((b) => b.date >= today);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Maintenance Blocks</Text>
            <TouchableOpacity onPress={handleClose}>
              <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.hint}>Close a court for a stretch of time — resurfacing, a repair, anything that takes it out of use.</Text>

            <Text style={styles.label}>Court</Text>
            <View style={styles.pillWrapRow}>
              {courts.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.pill, courtId === c.id && styles.pillActive]} onPress={() => setCourtId(c.id)}>
                  <Text style={[styles.pillText, courtId === c.id && styles.pillTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Date</Text>
            <MiniDatePicker value={date} onChange={setDate} minDate={today} />

            <View style={[styles.timeRow, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <TimePicker value={startTime} onChange={setStartTime} placeholder="Start" />
              </View>
              <View style={{ flex: 1 }}>
                <TimePicker value={endTime} onChange={setEndTime} placeholder="End" />
              </View>
            </View>

            <Text style={styles.label}>Reason (optional)</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Resurfacing"
              placeholderTextColor={Theme.textSecondary}
            />

            <TouchableOpacity
              style={[styles.addBtn, (!submittable || saving) && styles.addBtnDisabled]}
              disabled={!submittable || saving}
              onPress={submit}
            >
              <Icon name="plus-circle-outline" size={18} color={Theme.limeAccentDark} />
              <Text style={styles.addBtnText}>{saving ? 'Adding...' : 'Add Block'}</Text>
            </TouchableOpacity>

            {!loading && upcoming.length === 0 && (
              <Text style={styles.emptyText}>No upcoming maintenance blocks.</Text>
            )}
            {upcoming.map((b) => (
              <View key={b.id} style={styles.entryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryText}>{b.courtName} · {formatDateStr(b.date)}</Text>
                  <Text style={styles.entrySub}>{formatTime12h(b.startTime)}–{formatTime12h(b.endTime)}{b.reason ? ` · ${b.reason}` : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(b)}>
                  <Icon name="trash-can-outline" size={20} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  hint: { fontSize: 14, color: Theme.textSecondary, marginBottom: 16, lineHeight: 19 },
  label: { fontSize: 14, color: Theme.textSecondary, marginBottom: 8, fontWeight: '600' },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontSize: 15, color: Theme.textPrimary, fontWeight: '600' },
  pillTextActive: { color: '#FFFFFF' },
  timeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  input: {
    backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 14, color: Theme.textPrimary,
    fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: Theme.divider,
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.limeAccent, borderRadius: 20, paddingVertical: 13, marginBottom: 16 },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontFamily: Fonts.sansBold, fontSize: 16, color: Theme.limeAccentDark },
  entryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: Theme.divider },
  entryText: { fontSize: 15, color: Theme.textPrimary, fontWeight: '600' },
  entrySub: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  emptyText: { fontSize: 15, color: Theme.textSecondary, marginBottom: 12, lineHeight: 20 },
  doneBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  doneBtnText: { fontFamily: Fonts.sansBold, fontSize: 16, color: Theme.limeAccentDark },
});
