import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { Theme, Fonts } from '@/constants/theme';
import { timeToMinutes } from '../lib/scheduling';
import { colorForId } from '../lib/colors';
import { Court } from '../lib/courts';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const NEUTRAL_COLOR = { bg: Theme.divider, fg: Theme.textSecondary };

// Purely a visualization assumption — the app doesn't model a club's actual
// operating hours, so "how full" a court is treats an 14-hour day (8a–10p)
// as 100%. Not used for any hard limit, just the bar-fill heuristic.
const OPEN_MINUTES_PER_DAY = 14 * 60;
const MAX_BAR_HEIGHT = 56;
const MIN_BAR_HEIGHT = 3;

// A group-lesson time slot can span several courts at once — flattened out
// of GroupLesson.slots (one entry per slot, court_ids already a list).
export type SlotLite = { id: string; court_ids: string[]; day_of_week: number; start_time: string; end_time: string; main_coach_id: string | null };
export type LessonLite = { id: string; court_id: string | null; day_of_week: number; start_time: string; end_time: string; coach_id: string };

type Segment = { minutes: number; color: { bg: string; fg: string } };

const segmentsFor = (court: Court, dow: number, slots: SlotLite[], lessons: LessonLite[]): Segment[] => {
  const segments: Segment[] = [];
  slots.filter((s) => s.court_ids.includes(court.id) && s.day_of_week === dow).forEach((s) => {
    segments.push({ minutes: Math.max(20, timeToMinutes(s.end_time) - timeToMinutes(s.start_time)), color: s.main_coach_id ? colorForId(s.main_coach_id) : NEUTRAL_COLOR });
  });
  lessons.filter((l) => l.court_id === court.id && l.day_of_week === dow).forEach((l) => {
    segments.push({ minutes: Math.max(20, timeToMinutes(l.end_time) - timeToMinutes(l.start_time)), color: colorForId(l.coach_id) });
  });
  return segments;
};

type Props = {
  courts: Court[];
  slots: SlotLite[];
  lessons: LessonLite[];
  onSelectSlot: (court: Court, dayOfWeek: number) => void;
};

export function CourtsOverview({ courts, slots, lessons, onSelectSlot }: Props) {
  if (courts.length === 0) {
    return <Text style={styles.emptyText}>No courts set up yet — add some from Club settings.</Text>;
  }

  return (
    <View>
      <View style={styles.dayLabelRow}>
        <View style={styles.courtNameCol} />
        {DAY_LETTERS.map((d, i) => (
          <Text key={i} style={styles.dayLetter}>{d}</Text>
        ))}
      </View>
      {courts.map((court) => (
        <View key={court.id} style={styles.courtRow}>
          <Text style={styles.courtName} numberOfLines={1}>{court.name}</Text>
          {Array.from({ length: 7 }, (_, dow) => {
            const segments = segmentsFor(court, dow, slots, lessons);
            const totalMinutes = segments.reduce((sum, s) => sum + s.minutes, 0);
            const fullness = Math.min(1, totalMinutes / OPEN_MINUTES_PER_DAY);
            const barHeight = totalMinutes > 0 ? Math.max(MIN_BAR_HEIGHT, fullness * MAX_BAR_HEIGHT) : MIN_BAR_HEIGHT;
            return (
              <TouchableOpacity key={dow} style={styles.dayCol} onPress={() => onSelectSlot(court, dow)}>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: barHeight }]}>
                    {segments.map((s, i) => (
                      <View key={i} style={{ flex: s.minutes, backgroundColor: s.color.bg }} />
                    ))}
                  </View>
                </View>
                <Text style={styles.sessionCount}>{segments.length || ''}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginVertical: 8 },
  dayLabelRow: { flexDirection: 'row', marginBottom: 6 },
  courtNameCol: { width: 84 },
  dayLetter: { flex: 1, textAlign: 'center', fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.textMuted },
  courtRow: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 12, marginBottom: 10 },
  courtName: { width: 84, fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textPrimary, paddingBottom: 4 },
  dayCol: { flex: 1, alignItems: 'center' },
  barTrack: { height: MAX_BAR_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: 16, borderRadius: 4, overflow: 'hidden', flexDirection: 'column-reverse' },
  sessionCount: { fontFamily: Fonts.sansRegular, fontSize: 11, color: Theme.textMuted, marginTop: 4, height: 14 },
});
