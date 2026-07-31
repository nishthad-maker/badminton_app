import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { Theme, Fonts } from '@/constants/theme';
import { DAY_SHORT, timeToMinutes } from '../lib/scheduling';

export type GridBlock = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string;
  sublabel?: string;
  color: { bg: string; fg: string };
};

type Props = {
  /** Which day-of-week columns to render, in order. Defaults to Sun–Sat. Pass a single day for a day-drilldown view. */
  days?: number[];
  blocks: GridBlock[];
  onPressBlock?: (block: GridBlock) => void;
  rangeStartHour?: number;
  rangeEndHour?: number;
  hourHeight?: number;
  columnWidth?: number;
};

const formatHour = (h: number) => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'a' : 'p'}`;
};

type Laid = GridBlock & { top: number; height: number; lane: number; lanes: number };

// Greedy lane assignment so overlapping blocks (e.g. two coaches teaching
// the same student at once) sit side-by-side instead of stacking on top of
// each other. Not a perfect packer, but overlaps are rare in practice here.
const layoutDay = (blocks: GridBlock[], rangeStartHour: number, hourHeight: number): Laid[] => {
  const withMinutes = blocks.map((b) => ({
    block: b,
    startMinutes: timeToMinutes(b.startTime),
    endMinutes: Math.max(timeToMinutes(b.endTime), timeToMinutes(b.startTime) + 20),
  }));
  const sorted = [...withMinutes].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const laneEnds: number[] = [];
  const placed = sorted.map((b) => {
    let lane = laneEnds.findIndex((end) => end <= b.startMinutes);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.endMinutes); }
    else laneEnds[lane] = b.endMinutes;
    return { ...b, lane };
  });
  return placed.map((b) => {
    const overlapping = placed.filter((o) => o.startMinutes < b.endMinutes && b.startMinutes < o.endMinutes);
    const lanes = Math.max(...overlapping.map((o) => o.lane)) + 1;
    const rangeStartMinutes = rangeStartHour * 60;
    return {
      ...b.block,
      top: Math.max(0, ((b.startMinutes - rangeStartMinutes) / 60) * hourHeight),
      height: Math.max(28, ((b.endMinutes - b.startMinutes) / 60) * hourHeight),
      lane: b.lane,
      lanes,
    };
  });
};

export function WeeklyGrid({
  days = [0, 1, 2, 3, 4, 5, 6],
  blocks,
  onPressBlock,
  rangeStartHour: defaultStartHour = 7,
  rangeEndHour: defaultEndHour = 22,
  hourHeight = 44,
  columnWidth,
}: Props) {
  const colWidth = columnWidth ?? (days.length <= 1 ? 280 : 116);
  // 7am-10pm covers the normal day, but a block outside that (early-morning
  // slot, late tournament block) would render off the top/bottom of the grid
  // otherwise — grow the range to include every block, never shrink below
  // the default, never go past a single day's bounds.
  const blockHourBounds = blocks.reduce(
    (acc, b) => {
      const startH = Math.floor(timeToMinutes(b.startTime) / 60);
      const endH = Math.ceil(Math.max(timeToMinutes(b.endTime), timeToMinutes(b.startTime) + 20) / 60);
      return { min: Math.min(acc.min, startH), max: Math.max(acc.max, endH) };
    },
    { min: defaultStartHour, max: defaultEndHour }
  );
  const rangeStartHour = Math.max(0, Math.min(defaultStartHour, blockHourBounds.min));
  const rangeEndHour = Math.min(24, Math.max(defaultEndHour, blockHourBounds.max));
  const hours = Array.from({ length: rangeEndHour - rangeStartHour }, (_, i) => rangeStartHour + i);
  const totalHeight = hours.length * hourHeight;

  const blocksByDay: Record<number, Laid[]> = {};
  days.forEach((d) => {
    blocksByDay[d] = layoutDay(blocks.filter((b) => b.dayOfWeek === d), rangeStartHour, hourHeight);
  });

  return (
    <View style={styles.container}>
      <View style={styles.gutter}>
        <View style={styles.headerSpacer} />
        {hours.map((h) => (
          <View key={h} style={[styles.hourRow, { height: hourHeight }]}>
            <Text style={styles.hourLabel} maxFontSizeMultiplier={1.3}>{formatHour(h)}</Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.headerRow}>
            {days.map((d) => (
              <View key={d} style={[styles.dayHeader, { width: colWidth }]}>
                <Text style={styles.dayHeaderText} maxFontSizeMultiplier={1.3}>{DAY_SHORT[d]}</Text>
              </View>
            ))}
          </View>
          <View style={styles.bodyRow}>
            {days.map((d) => (
              <View key={d} style={[styles.dayColumn, { width: colWidth, height: totalHeight }]}>
                {hours.map((h, i) => (
                  <View key={h} style={[styles.gridLine, { top: i * hourHeight }]} />
                ))}
                {blocksByDay[d].map((b) => {
                  const laneWidth = (colWidth - 4) / b.lanes;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => onPressBlock?.(b)}
                      style={[
                        styles.block,
                        {
                          top: b.top,
                          height: b.height,
                          left: 2 + b.lane * laneWidth,
                          width: laneWidth - 2,
                          backgroundColor: b.color.bg,
                        },
                      ]}
                    >
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.blockLabel, { color: b.color.fg }]}>{b.label}</Text>
                      {b.sublabel && <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.blockSublabel, { color: b.color.fg }]}>{b.sublabel}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' },
  gutter: { width: 32 },
  headerSpacer: { height: 32 },
  hourRow: { justifyContent: 'flex-start' },
  hourLabel: { fontFamily: Fonts.sansRegular, fontSize: 11, color: Theme.textMuted, marginTop: -6 },
  headerRow: { flexDirection: 'row', height: 32 },
  dayHeader: { alignItems: 'center', justifyContent: 'center' },
  dayHeaderText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary },
  bodyRow: { flexDirection: 'row' },
  dayColumn: { borderLeftWidth: 1, borderLeftColor: Theme.divider },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: Theme.divider },
  block: { position: 'absolute', borderRadius: 6, padding: 4, overflow: 'hidden' },
  blockLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 11 },
  blockSublabel: { fontFamily: Fonts.sansRegular, fontSize: 10, marginTop: 1 },
});
