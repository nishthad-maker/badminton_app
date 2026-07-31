// A fixed bg/fg palette, same spirit as CategoryTheme in constants/theme —
// reused everywhere a coach or group tier needs a color (court bar-strips,
// weekly-grid blocks, dashboard chips, tier/coach list dots) so the mapping
// stays consistent across the app instead of being re-rolled per render.
// Keyed deterministically off the coach/tier id via a string hash, so no
// color needs to be stored in the database.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: '#CFE0F9', fg: '#0C447C' }, // blue
  { bg: '#E2EFAE', fg: '#3B6D11' }, // green
  { bg: '#FBDAB3', fg: '#854F0B' }, // orange
  { bg: '#E3D9F5', fg: '#534AB7' }, // purple
  { bg: '#F9D5E5', fg: '#9B2559' }, // pink
  { bg: '#D5F0EC', fg: '#0F6B5C' }, // teal
  { bg: '#FDE7A8', fg: '#8A6200' }, // gold
  { bg: '#E8E2D0', fg: '#5C5440' }, // sand
];

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function colorForId(id: string): { bg: string; fg: string } {
  return PALETTE[hashId(id) % PALETTE.length];
}

// Fixed (non-hashed) colors for the two lesson types — used wherever a
// calendar view mixes group and private lessons together (the Courts lens's
// single-slot drilldown) so the type is visually distinguishable regardless
// of which coach/tier it belongs to. Deliberately separate from colorForId's
// per-identity palette, which stays in use where distinguishing WHO (which
// coach/tier) matters more than WHAT (lesson type) — e.g. the By Student lens.
const LESSON_TYPE_COLORS: { private: { bg: string; fg: string }; group: { bg: string; fg: string } } = {
  private: { bg: '#CFE0F9', fg: '#0C447C' }, // blue
  group: { bg: '#E2EFAE', fg: '#3B6D11' }, // green
};

export function colorForLessonType(type: 'private' | 'group'): { bg: string; fg: string } {
  return LESSON_TYPE_COLORS[type];
}
