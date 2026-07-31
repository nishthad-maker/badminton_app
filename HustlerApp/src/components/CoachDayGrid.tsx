import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { Theme, Fonts } from '@/constants/theme';
import { timeToMinutes } from '../lib/scheduling';

export type CoachColumn = { id: string; name: string };

export type CoachDayBlock = {
  id: string;
  // One id = sits in that coach's own column. Two or more ids (e.g. a group
  // lesson with a main + assistant coach) = spans across those coaches'
  // columns as a single wide block instead of repeating per-column.
  coachIds: string[];
  startTime: string;
  endTime: string;
  label: string;
  sublabel?: string;
  // Pinned to the bottom of the block instead of stacking under sublabel —
  // used for a "Book" call-to-action on an open slot so it reads as an
  // action tied to that specific slot, not a generic header button.
  footerLabel?: string;
  color: { bg: string; fg: string };
};

type Props = {
  coaches: CoachColumn[];
  blocks: CoachDayBlock[];
  onPressBlock?: (block: CoachDayBlock) => void;
  rangeStartHour?: number;
  rangeEndHour?: number;
  hourHeight?: number;
  columnWidth?: number;
};

const formatHour = (h: number) => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'a' : 'p'}`;
};

type Laid = CoachDayBlock & { top: number; height: number; lane: number; lanes: number };

// Same greedy lane-packing as WeeklyGrid, just applied within one coach's
// column for a single day instead of within one day's column across a week.
const layoutColumn = (blocks: CoachDayBlock[], rangeStartHour: number, hourHeight: number): Laid[] => {
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
      height: Math.max(36, ((b.endMinutes - b.startMinutes) / 60) * hourHeight),
      lane: b.lane,
      lanes,
    };
  });
};

// A single day's schedule laid out as one column per coach (instead of
// WeeklyGrid's one column per day-of-week) — used for the "All coaches, one
// day" overview. A block naming 2+ coachIds (a group lesson taught by a main
// + assistant) renders once as a wide block spanning those coaches' columns,
// rather than being duplicated into each one.
export function CoachDayGrid({
  coaches,
  blocks,
  onPressBlock,
  rangeStartHour: defaultStartHour = 7,
  rangeEndHour: defaultEndHour = 22,
  hourHeight = 64,
  columnWidth = 200,
}: Props) {
  // The 7am-10pm default covers the normal club day, but a block scheduled
  // outside it (an early-morning slot, a late tournament block, etc.) would
  // otherwise render off the top/bottom of the grid — so the visible range
  // grows to include every block's start/end, never shrinks below the
  // default, and never goes past the bounds of a single day.
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
  const totalWidth = Math.max(coaches.length, 1) * columnWidth;

  const soloBlocks = blocks.filter((b) => b.coachIds.length <= 1);
  const spanBlocks = blocks.filter((b) => b.coachIds.length > 1);

  const blocksByCoach: Record<string, Laid[]> = {};
  coaches.forEach((c) => {
    blocksByCoach[c.id] = layoutColumn(soloBlocks.filter((b) => b.coachIds[0] === c.id), rangeStartHour, hourHeight);
  });

  const rangeStartMinutes = rangeStartHour * 60;
  const spanLaid = spanBlocks.map((b) => {
    const indices = b.coachIds.map((id) => coaches.findIndex((c) => c.id === id)).filter((i) => i >= 0);
    const left = (indices.length ? Math.min(...indices) : 0) * columnWidth;
    const right = (indices.length ? Math.max(...indices) + 1 : coaches.length) * columnWidth;
    const startMinutes = timeToMinutes(b.startTime);
    const endMinutes = Math.max(timeToMinutes(b.endTime), startMinutes + 20);
    return {
      ...b,
      left,
      width: right - left,
      top: Math.max(0, ((startMinutes - rangeStartMinutes) / 60) * hourHeight),
      height: Math.max(36, ((endMinutes - startMinutes) / 60) * hourHeight),
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.gutter}>
        <View style={styles.headerSpacer} />
        {hours.map((h) => (
          <View key={h} style={[styles.hourRow, { height: hourHeight }]}>
            <Text style={styles.hourLabel} maxFontSizeMultiplier={1.2}>{formatHour(h)}</Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.headerRow}>
            {coaches.map((c) => (
              <View key={c.id} style={[styles.coachHeader, { width: columnWidth }]}>
                <Text style={styles.coachHeaderText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{c.name}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.body, { width: totalWidth, height: totalHeight }]}>
            {hours.map((h, i) => (
              <View key={h} style={[styles.gridLine, { top: i * hourHeight, width: totalWidth }]} />
            ))}
            {coaches.map((c, ci) => (
              <View key={c.id} style={[styles.coachColumn, { left: ci * columnWidth, width: columnWidth, height: totalHeight }]}>
                {blocksByCoach[c.id].map((b) => {
                  const laneWidth = (columnWidth - 4) / b.lanes;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => onPressBlock?.(b)}
                      style={[
                        styles.block,
                        { top: b.top, height: b.height, left: 2 + b.lane * laneWidth, width: laneWidth - 2, backgroundColor: b.color.bg },
                      ]}
                    >
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.blockLabel, { color: b.color.fg }]}>{b.label}</Text>
                      {b.sublabel && <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.blockSublabel, { color: b.color.fg }]}>{b.sublabel}</Text>}
                      {b.footerLabel && (
                        <View style={[styles.blockFooterBtn, { backgroundColor: b.color.fg }]}>
                          <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.blockFooterBtnText}>{b.footerLabel}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {spanLaid.map((b) => (
              <TouchableOpacity
                key={b.id}
                onPress={() => onPressBlock?.(b)}
                style={[styles.spanBlock, { top: b.top, height: b.height, left: b.left + 2, width: b.width - 4, backgroundColor: b.color.bg }]}
              >
                <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.blockLabel, { color: b.color.fg }]}>{b.label}</Text>
                {b.sublabel && <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.blockSublabel, { color: b.color.fg }]}>{b.sublabel}</Text>}
                {b.footerLabel && (
                  <View style={[styles.blockFooterBtn, { backgroundColor: b.color.fg }]}>
                    <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.blockFooterBtnText}>{b.footerLabel}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' },
  gutter: { width: 50 },
  headerSpacer: { height: 50 },
  hourRow: { justifyContent: 'flex-start' },
  hourLabel: { fontFamily: Fonts.sansBold, fontSize: 18, color: Theme.textSecondary, marginTop: -10, textAlign: 'right', paddingRight: 6 },
  headerRow: { flexDirection: 'row', height: 50 },
  coachHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: Theme.textPrimary, paddingBottom: 10 },
  coachHeaderText: { fontFamily: Fonts.sansBold, fontSize: 19, color: Theme.textPrimary },
  body: {},
  coachColumn: { position: 'absolute', top: 0, borderLeftWidth: 1, borderLeftColor: Theme.divider },
  gridLine: { position: 'absolute', left: 0, height: 1, backgroundColor: Theme.divider },
  block: { position: 'absolute', borderRadius: 8, padding: 6, overflow: 'hidden' },
  spanBlock: { position: 'absolute', borderRadius: 8, padding: 8, overflow: 'hidden' },
  blockLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 19 },
  blockSublabel: { fontFamily: Fonts.sansRegular, fontSize: 15, marginTop: 3 },
  blockFooterBtn: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 6 },
  blockFooterBtnText: { fontFamily: Fonts.sansBold, fontSize: 13, color: '#FFFFFF' },
});
