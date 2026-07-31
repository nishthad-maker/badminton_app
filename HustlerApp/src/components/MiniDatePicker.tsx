import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme } from '@/constants/theme';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const toDateStr = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

type Props = {
  value: string | null; // "YYYY-MM-DD"
  onChange: (date: string) => void;
  /** Dates before this ("YYYY-MM-DD") render disabled and can't be picked. */
  minDate?: string;
  accentColor?: string;
};

// A compact inline month-grid so a specific calendar date can be picked
// directly (e.g. a tournament's exact registration deadline) without a
// native date-picker dependency — same day-grid shape as the main Calendar
// screen, just smaller and without event dots.
export function MiniDatePicker({ value, onChange, minDate, accentColor = Theme.eyebrowGreen }: Props) {
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = (() => {
    const d = new Date(viewYear, viewMonth, 1).getDay();
    return d === 0 ? 6 : d - 1;
  })();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<View key={`e${i}`} style={styles.cell} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateStr(viewYear, viewMonth, day);
    const isSelected = dateStr === value;
    const isDisabled = !!minDate && dateStr < minDate;
    cells.push(
      <TouchableOpacity
        key={day}
        disabled={isDisabled}
        style={[styles.cell, isSelected && { backgroundColor: accentColor, borderRadius: 8 }]}
        onPress={() => onChange(dateStr)}
      >
        <Text style={[
          styles.cellText,
          isDisabled && styles.cellTextDisabled,
          isSelected && styles.cellTextSelected,
        ]}>
          {day}
        </Text>
      </TouchableOpacity>
    );
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    while (row.length < 7) row.push(<View key={`p${i}-${row.length}`} style={styles.cell} />);
    rows.push(<View key={`r${i}`} style={styles.row}>{row}</View>);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="chevron-left" size={20} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="chevron-right" size={20} color={Theme.textPrimary} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        {DAY_HEADERS.map((d, i) => (
          <View key={i} style={styles.cell}><Text style={styles.headerText}>{d}</Text></View>
        ))}
      </View>
      {rows}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Theme.cardWhite, borderRadius: 12, borderWidth: 1, borderColor: Theme.divider, padding: 10 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  navTitle: { fontSize: 14, fontWeight: '700', color: Theme.textPrimary },
  row: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 13, color: Theme.textPrimary },
  cellTextDisabled: { color: Theme.textMuted, opacity: 0.4 },
  cellTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  headerText: { fontSize: 11, fontWeight: '600', color: Theme.textSecondary },
});
