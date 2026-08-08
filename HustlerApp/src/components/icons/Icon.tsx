import React from 'react';
import { ColorValue, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

// Smasho's own icon language: a hand-drawn, 24x24 line-icon set that
// replaces the stock MaterialCommunityIcons glyphs used throughout the app.
// Every glyph below is original artwork built from primitives (no icon
// library assets) so the app stops looking like every other AI-scaffolded
// React Native app. `name` keeps the same string keys the screens already
// pass in, so call sites only need `MaterialCommunityIcons` swapped for
// `Icon` — no prop changes required.

type GlyphProps = { c: string; w: number };
type Glyph = (p: GlyphProps) => React.ReactElement;

const stroke = (c: string, w: number) => ({
  stroke: c,
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
});

const dot = (cx: number, cy: number, r: number, c: string) => (
  <Circle cx={cx} cy={cy} r={r} fill={c} stroke="none" />
);

// ---- shared building blocks -------------------------------------------

const person = (p: GlyphProps, cx = 12, cy = 12, scale = 1) => {
  const s = stroke(p.c, p.w);
  const headR = 2.6 * scale;
  const headCy = cy - 4.4 * scale;
  return (
    <>
      <Circle cx={cx} cy={headCy} r={headR} {...s} />
      <Path
        d={`M${cx - 5.5 * scale} ${cy + 6 * scale} Q${cx - 5.5 * scale} ${cy + 0.5 * scale} ${cx} ${cy + 0.5 * scale} Q${cx + 5.5 * scale} ${cy + 0.5 * scale} ${cx + 5.5 * scale} ${cy + 6 * scale}`}
        {...s}
      />
    </>
  );
};

const ring = (p: GlyphProps, cx = 12, cy = 12, r = 9) => (
  <Circle cx={cx} cy={cy} r={r} {...stroke(p.c, p.w)} />
);

const check = (p: GlyphProps, ox = 0, oy = 0, scale = 1) => (
  <Path
    d={`M${5 + ox} ${13 * scale + oy}l${4 * scale} ${4 * scale}L${19 * scale + ox} ${7 * scale + oy}`}
    {...stroke(p.c, p.w)}
  />
);

const plus = (p: GlyphProps, cx = 12, cy = 12, half = 7) => {
  const s = stroke(p.c, p.w);
  return (
    <>
      <Line x1={cx} y1={cy - half} x2={cx} y2={cy + half} {...s} />
      <Line x1={cx - half} y1={cy} x2={cx + half} y2={cy} {...s} />
    </>
  );
};

const cross = (p: GlyphProps, cx = 12, cy = 12, half = 6) => {
  const s = stroke(p.c, p.w);
  return (
    <>
      <Line x1={cx - half} y1={cy - half} x2={cx + half} y2={cy + half} {...s} />
      <Line x1={cx + half} y1={cy - half} x2={cx - half} y2={cy + half} {...s} />
    </>
  );
};

const calendarBase = (p: GlyphProps) => {
  const s = stroke(p.c, p.w);
  return (
    <>
      <Rect x={4} y={5} width={16} height={15} rx={2} {...s} />
      <Line x1={8} y1={3} x2={8} y2={7} {...s} />
      <Line x1={16} y1={3} x2={16} y2={7} {...s} />
      <Line x1={4} y1={9.5} x2={20} y2={9.5} {...s} />
    </>
  );
};

const clipboardBase = (p: GlyphProps) => {
  const s = stroke(p.c, p.w);
  return (
    <>
      <Rect x={5} y={5} width={14} height={16} rx={2} {...s} />
      <Rect x={9} y={3} width={6} height={3.4} rx={1.2} {...s} />
    </>
  );
};

const bookOpen = (p: GlyphProps) => {
  const s = stroke(p.c, p.w);
  return (
    <>
      <Path d="M12 7.5 L3 5.5 V17.5 L12 19.5 Z" {...s} />
      <Path d="M12 7.5 L21 5.5 V17.5 L12 19.5 Z" {...s} />
      <Line x1={12} y1={7.5} x2={12} y2={19.5} {...s} />
    </>
  );
};

const heart = (p: GlyphProps) => (
  <Path
    d="M12 20s-7-4.3-7-9.7A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7 2.7C19 15.7 12 20 12 20z"
    {...stroke(p.c, p.w)}
  />
);

const bell = (p: GlyphProps) => {
  const s = stroke(p.c, p.w);
  return (
    <>
      <Path
        d="M12 4a1.1 1.1 0 0 1 1.1 1.1v.5c2.6.7 4.4 3 4.4 5.9v3.6l1.6 2.4H4.9l1.6-2.4V11.5c0-2.9 1.8-5.2 4.4-5.9v-.5A1.1 1.1 0 0 1 12 4z"
        {...s}
      />
      {dot(12, 20, 1, p.c)}
    </>
  );
};

const speechBubble = (p: GlyphProps, tailX = 8) => {
  const s = stroke(p.c, p.w);
  return (
    <>
      <Rect x={4} y={5} width={16} height={11} rx={3} {...s} />
      <Path d={`M${tailX} 16 L${tailX - 2} 20 L${tailX + 4} 16 Z`} {...s} />
    </>
  );
};

const chevron = (points: string, p: GlyphProps) => (
  <Path d={points} {...stroke(p.c, p.w)} />
);

// ---- glyph registry ------------------------------------------------------

const glyphs: Record<string, Glyph> = {
  // navigation / tabs
  home: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M4 11 L12 4 L20 11" {...s} />
        <Path d="M6 10 V20 H18 V10" {...s} />
        <Rect x={9.5} y={14} width={5} height={6} rx={1} {...s} />
      </>
    );
  },
  run: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <G>
        <Ellipse cx={8} cy={7} rx={4.2} ry={5.4} {...s} />
        <Line x1={8} y1={1.8} x2={8} y2={12.2} {...s} />
        <Line x1={4} y1={7} x2={12} y2={7} {...s} />
        <Line x1={8} y1={12.4} x2={11.7} y2={17.8} {...s} strokeWidth={p.w + 1.1} />
        <Circle cx={18.3} cy={8.2} r={1.15} {...s} />
        <Path d="M17 6.8 L18.3 2.4 L19.6 6.8 Z" {...s} />
      </G>
    );
  },
  'account-group': (p) => glyphs['forum-outline'](p),
  'account-group-outline': (p) => glyphs['forum-outline'](p),
  footprints: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={7} y1={2} x2={7} y2={22} {...s} />
        <Line x1={17} y1={2} x2={17} y2={22} {...s} />
        {[4.5, 9, 13.5, 18].map((y, i) => (
          <Line key={i} x1={7} y1={y} x2={17} y2={y} {...s} />
        ))}
      </>
    );
  },
  'account-circle': (p) => (
    <>
      {ring(p, 12, 12, 9)}
      {person(p, 12, 12.6, 0.55)}
    </>
  ),
  'account-multiple': (p) => (
    <>
      <Circle cx={8.5} cy={9} r={2.4} {...stroke(p.c, p.w)} />
      <Circle cx={15.5} cy={9} r={2.4} {...stroke(p.c, p.w)} />
      <Path d="M3.5 20c0-3.3 2.2-5.6 5-5.6s5 2.3 5 5.6" {...stroke(p.c, p.w)} />
      <Path d="M10.5 20c0-3.3 2.2-5.6 5-5.6s5 2.3 5 5.6" {...stroke(p.c, p.w)} />
    </>
  ),
  'account-child-outline': (p) => (
    <>
      {person(p, 9, 10.5, 0.85)}
      {person(p, 17, 14, 0.48)}
    </>
  ),
  'clipboard-text': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        {clipboardBase(p)}
        <Line x1={8.5} y1={12} x2={15.5} y2={12} {...s} />
        <Line x1={8.5} y1={16} x2={13.5} y2={16} {...s} />
      </>
    );
  },
  'clipboard-text-outline': (p) => glyphs['clipboard-text'](p),

  // account / profile / auth
  account: (p) => <>{person(p)}</>,
  'account-badge': (p) => (
    <>
      {person(p)}
      <Circle cx={17.5} cy={17.5} r={3} fill="#fff" stroke={p.c} strokeWidth={p.w} />
      {dot(17.5, 17.5, 1.1, p.c)}
    </>
  ),
  'office-building-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={5} y={3.5} width={14} height={17} rx={1} {...s} />
        <Line x1={3.5} y1={20.5} x2={20.5} y2={20.5} {...s} />
        <Line x1={8} y1={7.5} x2={10} y2={7.5} {...s} />
        <Line x1={14} y1={7.5} x2={16} y2={7.5} {...s} />
        <Line x1={8} y1={11.5} x2={10} y2={11.5} {...s} />
        <Line x1={14} y1={11.5} x2={16} y2={11.5} {...s} />
        <Rect x={10.5} y={15.5} width={3} height={5} {...s} />
      </>
    );
  },
  'account-edit-outline': (p) => (
    <>
      {person(p, 10.5, 12, 0.85)}
      <Path d="M15.5 15.5 L20 11 L21.5 12.5 L17 17 L15 17.5 Z" {...stroke(p.c, p.w)} />
    </>
  ),
  'account-plus-outline': (p) => (
    <>
      {person(p, 9.5, 13, 0.78)}
      {plus(p, 18, 9, 3)}
    </>
  ),
  'account-remove-outline': (p) => (
    <>
      {person(p, 9.5, 13, 0.78)}
      <Line x1={15} y1={9} x2={21} y2={9} {...stroke(p.c, p.w)} />
    </>
  ),
  'account-search-outline': (p) => (
    <>
      {person(p, 10, 11, 0.72)}
      <Circle cx={16.5} cy={16.5} r={3.2} {...stroke(p.c, p.w)} />
      <Line x1={18.8} y1={18.8} x2={21} y2={21} {...stroke(p.c, p.w)} />
    </>
  ),
  'lock-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={6} y={11} width={12} height={9} rx={2} {...s} />
        <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" {...s} />
        {dot(12, 15.3, 1, p.c)}
      </>
    );
  },
  logout: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M12 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h6" {...s} />
        <Line x1={10} y1={12} x2={20} y2={12} {...s} />
        <Path d="M16.5 8 L20 12 L16.5 16" {...s} />
      </>
    );
  },
  incognito: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M4 12c2-3 5-4 8-4s6 1 8 4" {...s} />
        <Circle cx={7.5} cy={13.5} r={2.6} {...s} />
        <Circle cx={16.5} cy={13.5} r={2.6} {...s} />
        <Line x1={10.1} y1={13.5} x2={13.9} y2={13.5} {...s} />
      </>
    );
  },

  // add / edit / remove / check
  plus: (p) => <>{plus(p)}</>,
  'plus-circle-outline': (p) => (
    <>
      {ring(p)}
      {plus(p, 12, 12, 4.5)}
    </>
  ),
  'plus-circle': (p) => glyphs['plus-circle-outline'](p),
  'pencil-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M5 19 L6 15 L15.5 5.5 L18.5 8.5 L9 18 Z" {...s} />
        <Line x1={13.2} y1={7.3} x2={16.2} y2={10.3} {...s} />
      </>
    );
  },
  close: (p) => <>{cross(p)}</>,
  'close-circle': (p) => (
    <>
      {ring(p)}
      {cross(p, 12, 12, 4)}
    </>
  ),
  'close-circle-outline': (p) => glyphs['close-circle'](p),
  'delete-forever-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={4} y1={7} x2={20} y2={7} {...s} />
        <Path d="M8.5 7 V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2" {...s} />
        <Path d="M6.5 7 L7.5 20 A1.5 1.5 0 0 0 9 21.4 h6 A1.5 1.5 0 0 0 16.5 20 L17.5 7" {...s} />
        <Line x1={10.5} y1={10.5} x2={10.5} y2={17.5} {...s} />
        <Line x1={13.5} y1={10.5} x2={13.5} y2={17.5} {...s} />
      </>
    );
  },
  'trash-can-outline': (p) => glyphs['delete-forever-outline'](p),
  check: (p) => <>{check(p)}</>,
  'check-circle': (p) => (
    <>
      {ring(p)}
      {check(p, -1, -1, 0.68)}
    </>
  ),
  'check-circle-outline': (p) => glyphs['check-circle'](p),
  'check-decagram': (p) => {
    const s = stroke(p.c, p.w);
    const ticks = [0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = 12 + Math.cos(rad) * 9.4;
      const y1 = 12 + Math.sin(rad) * 9.4;
      const x2 = 12 + Math.cos(rad) * 7.6;
      const y2 = 12 + Math.sin(rad) * 7.6;
      return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...s} />;
    });
    return (
      <>
        {ring(p, 12, 12, 7)}
        {check(p, -1, -1, 0.62)}
        {ticks}
      </>
    );
  },

  // calendar / time
  'calendar-blank-outline': (p) => <>{calendarBase(p)}</>,
  'calendar-check': (p) => (
    <>
      {calendarBase(p)}
      {check(p, 3, 3, 0.55)}
    </>
  ),
  'calendar-edit': (p) => (
    <>
      {calendarBase(p)}
      <Path d="M9 18 L9.5 16 L14.5 11 L16.5 13 L11.5 18 Z" {...stroke(p.c, p.w)} />
    </>
  ),
  'calendar-month': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        {calendarBase(p)}
        <Line x1={7.5} y1={14} x2={16.5} y2={14} {...s} />
        <Line x1={7.5} y1={17} x2={13} y2={17} {...s} />
      </>
    );
  },
  'calendar-week': (p) => (
    <>
      {calendarBase(p)}
      {[0, 1, 2, 3].map((col) => (
        <G key={col}>{dot(7.5 + col * 3, 14.5, 0.9, p.c)}</G>
      ))}
    </>
  ),
  'clock-outline': (p) => (
    <>
      {ring(p)}
      <Line x1={12} y1={12} x2={12} y2={7.5} {...stroke(p.c, p.w)} />
      <Line x1={12} y1={12} x2={15.2} y2={13.2} {...stroke(p.c, p.w)} />
    </>
  ),
  history: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M6 6.5A8 8 0 1 1 4.3 12" {...s} />
        <Path d="M4.3 7.5 L4.3 12 L8.5 12" {...s} />
        <Line x1={12} y1={9} x2={12} y2={13} {...s} />
        <Line x1={12} y1={13} x2={14.5} y2={14.5} {...s} />
      </>
    );
  },

  // chevrons / arrows
  'arrow-left': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={19} y1={12} x2={5} y2={12} {...s} />
        <Path d="M11 6 L5 12 L11 18" {...s} />
      </>
    );
  },
  menu: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={4} y1={7} x2={20} y2={7} {...s} />
        <Line x1={4} y1={12} x2={20} y2={12} {...s} />
        <Line x1={4} y1={17} x2={20} y2={17} {...s} />
      </>
    );
  },
  'chevron-down': (p) => chevron('M6 9 L12 15 L18 9', p),
  'chevron-left': (p) => chevron('M15 6 L9 12 L15 18', p),
  'chevron-right': (p) => chevron('M9 6 L15 12 L9 18', p),
  'chevron-up': (p) => chevron('M6 15 L12 9 L18 15', p),

  // workouts / sport
  badminton: (p) => {
    const s = stroke(p.c, p.w);
    const tips = [
      [7, 5], [10, 4], [14, 4], [17, 5],
    ];
    return (
      <>
        <Circle cx={12} cy={17.5} r={2.4} {...s} />
        {tips.map(([x, y], i) => (
          <Line key={i} x1={12 + (x - 12) * 0.4} y1={16} x2={x} y2={y} {...s} />
        ))}
      </>
    );
  },
  // A literal racquet — 'badminton' above is actually a shuttlecock (used
  // for the workout/training category icon and the signup role picker).
  'racquet-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        {/* elongated oval head — taller than wide, unlike a round tennis face */}
        <Ellipse cx={12} cy={6.5} rx={4.3} ry={5.7} {...s} />
        <Line x1={12} y1={1.3} x2={12} y2={11.7} {...s} />
        <Line x1={8.2} y1={6.5} x2={15.8} y2={6.5} {...s} />
        {/* long thin shaft straight into a clearly rectangular handle — the proportion that reads as badminton rather than tennis */}
        <Line x1={12} y1={12.2} x2={12} y2={17} {...s} />
        <Rect x={10.2} y={17} width={3.6} height={5.5} rx={1.3} {...s} />
      </>
    );
  },
  dumbbell: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={7} y1={12} x2={17} y2={12} {...s} strokeWidth={p.w + 1.2} />
        <Rect x={1.6} y={7.2} width={3.2} height={9.6} rx={1.2} {...s} />
        <Rect x={5.4} y={8.8} width={2.2} height={6.4} rx={0.9} {...s} />
        <Rect x={19.2} y={7.2} width={3.2} height={9.6} rx={1.2} {...s} />
        <Rect x={16.4} y={8.8} width={2.2} height={6.4} rx={0.9} {...s} />
      </>
    );
  },
  'heart-pulse': (p) => (
    <>
      {heart(p)}
      <Path d="M6.5 12h3l1.5-3 2 5 1.5-3h3.5" {...stroke(p.c, p.w)} />
    </>
  ),
  'lightning-bolt': (p) => (
    <Path d="M13 3 L6.5 13.5 H11 L10 21 L17.5 10 H13 Z" {...stroke(p.c, p.w)} />
  ),
  'whistle-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path
          d="M12 3 L18.5 6 V11.4 C18.5 16.2 15.3 19.2 12 20.6 C8.7 19.2 5.5 16.2 5.5 11.4 V6 Z"
          {...s}
        />
        <Path d="M9 12 L11 14 L15.2 9.2" {...s} />
      </>
    );
  },
  whistle: (p) => glyphs['whistle-outline'](p),
  'playlist-check': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={4} y1={6} x2={14} y2={6} {...s} />
        <Line x1={4} y1={12} x2={14} y2={12} {...s} />
        <Line x1={4} y1={18} x2={11} y2={18} {...s} />
        <Path d="M16 16 L18 18.5 L21.5 13" {...s} />
      </>
    );
  },
  'dice-3-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={4} y={4} width={16} height={16} rx={3} {...s} />
        {dot(8, 8, 1.1, p.c)}
        {dot(12, 12, 1.1, p.c)}
        {dot(16, 16, 1.1, p.c)}
      </>
    );
  },
  'chart-line': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M4 4 V20 H20" {...s} />
        <Path d="M6 16 L10 11 L13 14 L18.5 7" {...s} />
      </>
    );
  },
  'chart-timeline-variant': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M4 4 V20 H20" {...s} />
        <Line x1={7} y1={17} x2={7} y2={14} {...s} />
        <Line x1={11} y1={17} x2={11} y2={9} {...s} />
        <Line x1={15} y1={17} x2={15} y2={12} {...s} />
        <Line x1={19} y1={17} x2={19} y2={6} {...s} />
      </>
    );
  },
  'trophy-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M8 4h8v5a4 4 0 0 1-8 0z" {...s} />
        <Path d="M8 6H5a1 1 0 0 0-1 1c0 2.5 1.8 4 4.2 4.3" {...s} />
        <Path d="M16 6h3a1 1 0 0 1 1 1c0 2.5-1.8 4-4.2 4.3" {...s} />
        <Line x1={12} y1={13} x2={12} y2={17} {...s} />
        <Rect x={9} y={19} width={6} height={2} rx={1} {...s} />
      </>
    );
  },
  trophy: (p) => glyphs['trophy-outline'](p),

  // journal / notes
  'book-open-outline': (p) => <>{bookOpen(p)}</>,
  'book-open-page-variant': (p) => <>{bookOpen(p)}</>,
  'notebook-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={6} y={3} width={14} height={18} rx={2} {...s} />
        {[6, 9.5, 13, 16.5].map((y, i) => (
          <Line key={i} x1={4} y1={y} x2={6} y2={y} {...s} />
        ))}
      </>
    );
  },
  'notebook-edit-outline': (p) => (
    <>
      {glyphs['notebook-outline'](p)}
      <Path d="M11 17 L11.5 15 L15.5 11 L17.5 13 L13.5 17 Z" {...stroke(p.c, p.w)} />
    </>
  ),
  'clipboard-plus-outline': (p) => (
    <>
      {clipboardBase(p)}
      {plus(p, 12, 14.5, 3.2)}
    </>
  ),
  'school-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M12 4 L21 9 L12 14 L3 9 Z" {...s} />
        <Line x1={7} y1={11} x2={7} y2={16} {...s} />
        <Path d="M7 16 a5 2 0 0 0 10 0" {...s} />
      </>
    );
  },

  // media / camera
  'camera-plus-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={2.5} y={8.5} width={14} height={10.5} rx={2} {...s} />
        <Path d="M7.5 8.5 L9 6 H13 L14.5 8.5" {...s} />
        <Circle cx={9.5} cy={13.7} r={3} {...s} />
        <Circle cx={19.5} cy={6.5} r={3} {...s} />
        {plus(p, 19.5, 6.5, 1.4)}
      </>
    );
  },
  'image-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={4} y={5} width={16} height={14} rx={2} {...s} />
        <Circle cx={8.5} cy={9.5} r={1.4} {...s} />
        <Path d="M5 17 L9.5 12 L12.5 15 L16.5 10 L20 15" {...s} />
      </>
    );
  },
  image: (p) => glyphs['image-outline'](p),
  'image-plus': (p) => (
    <>
      {glyphs['image-outline'](p)}
      <Circle cx={19.5} cy={6.5} r={3} fill="#fff" stroke={p.c} strokeWidth={p.w} />
      {plus(p, 19.5, 6.5, 1.4)}
    </>
  ),
  'image-multiple-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={7} y={3} width={13} height={10} rx={1.8} {...s} />
        <Rect x={4} y={7} width={13} height={13} rx={1.8} {...s} />
        <Circle cx={8.2} cy={11.2} r={1.1} {...s} />
        <Path d="M4.5 16.8 L8 13 L10.3 15.2 L13.3 11.8 L17 16.2" {...s} />
      </>
    );
  },
  'image-multiple': (p) => glyphs['image-multiple-outline'](p),
  'video-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={3} y={6} width={13} height={12} rx={2} {...s} />
        <Path d="M16 10 L21 6.5 V17.5 L16 14 Z" {...s} />
      </>
    );
  },
  video: (p) => glyphs['video-outline'](p),
  'video-check': (p) => (
    <>
      {glyphs['video-outline'](p)}
      <Circle cx={7} cy={17.5} r={3} fill="#fff" stroke={p.c} strokeWidth={p.w} />
      {check(p, -4, -8.6, 0.35)}
    </>
  ),
  'image-check': (p) => (
    <>
      {glyphs['image-outline'](p)}
      <Circle cx={18} cy={17.5} r={3} fill="#fff" stroke={p.c} strokeWidth={p.w} />
      {check(p, 5, -8.6, 0.35)}
    </>
  ),
  'play-circle-outline': (p) => (
    <>
      {ring(p)}
      <Path d="M10 8.3 L16 12 L10 15.7 Z" {...stroke(p.c, p.w)} />
    </>
  ),
  'play-circle': (p) => glyphs['play-circle-outline'](p),
  'pause-circle': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        {ring(p)}
        <Line x1={10} y1={8.5} x2={10} y2={15.5} {...s} />
        <Line x1={14} y1={8.5} x2={14} y2={15.5} {...s} />
      </>
    );
  },
  play: (p) => <Path d="M8 6 L18 12 L8 18 Z" fill={p.c} stroke="none" />,
  pause: (p) => (
    <>
      <Rect x={7} y={5} width={3.4} height={14} rx={1} fill={p.c} stroke="none" />
      <Rect x={13.6} y={5} width={3.4} height={14} rx={1} fill={p.c} stroke="none" />
    </>
  ),
  stop: (p) => <Rect x={6.5} y={6.5} width={11} height={11} rx={2} {...stroke(p.c, p.w)} />,
  'stop-circle-outline': (p) => (
    <>
      {ring(p)}
      <Rect x={9} y={9} width={6} height={6} rx={1} {...stroke(p.c, p.w)} />
    </>
  ),
  'microphone-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={9.5} y={3} width={5} height={10} rx={2.5} {...s} />
        <Path d="M6 11a6 6 0 0 0 12 0" {...s} />
        <Line x1={12} y1={17} x2={12} y2={21} {...s} />
        <Line x1={8} y1={21} x2={16} y2={21} {...s} />
      </>
    );
  },
  microphone: (p) => glyphs['microphone-outline'](p),
  'microphone-off': (p) => (
    <>
      {glyphs['microphone-outline'](p)}
      <Line x1={4} y1={4} x2={20} y2={20} {...stroke(p.c, p.w)} />
    </>
  ),
  'volume-off': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M4 9v6h4l5 4V5L8 9H4z" {...s} />
        <Line x1={16} y1={9} x2={20.5} y2={15} {...s} />
        <Line x1={20.5} y1={9} x2={16} y2={15} {...s} />
      </>
    );
  },
  'volume-high': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M4 9v6h4l5 4V5L8 9H4z" {...s} />
        <Path d="M16.3 9.5 a3.2 3.2 0 0 1 0 5" {...s} />
        <Path d="M18 7.2 a5.4 5.4 0 0 1 0 9.6" {...s} />
      </>
    );
  },
  paperclip: (p) => (
    <Path
      d="M7.5 12.5V6.8a4 4 0 0 1 8 0v9a2.6 2.6 0 0 1-5.2 0V7.5"
      {...stroke(p.c, p.w)}
    />
  ),
  'content-copy': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={8.5} y={3.5} width={11} height={13} rx={1.8} {...s} />
        <Path d="M15.5 16.5 V18.7 A1.8 1.8 0 0 1 13.7 20.5 H6.3 A1.8 1.8 0 0 1 4.5 18.7 V9.3 A1.8 1.8 0 0 1 6.3 7.5 H8.5" {...s} />
      </>
    );
  },
  'radiobox-blank': (p) => <Circle cx={12} cy={12} r={8} {...stroke(p.c, p.w)} />,
  'radiobox-marked': (p) => (
    <>
      <Circle cx={12} cy={12} r={8} {...stroke(p.c, p.w)} />
      {dot(12, 12, 3.6, p.c)}
    </>
  ),
  'flag-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={6} y1={3.5} x2={6} y2={20.5} {...s} />
        <Path d="M6 4.5 H17.5 L14.5 8.5 L17.5 12.5 H6" {...s} />
      </>
    );
  },
  flag: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Line x1={6} y1={3.5} x2={6} y2={20.5} {...s} />
        <Path d="M6 4.5 H17.5 L14.5 8.5 L17.5 12.5 H6 Z" fill={p.c} stroke="none" />
      </>
    );
  },
  'cloud-upload-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 15.9 8 4.5 4.5 0 0 1 17 17H7z" {...s} />
        <Line x1={12} y1={16} x2={12} y2={10.5} {...s} />
        <Path d="M9.3 12.8 L12 10 L14.7 12.8" {...s} />
      </>
    );
  },
  'link-variant': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={2.5} y={13.5} width={8} height={4.5} rx={2.25} transform="rotate(-45 6.5 15.75)" {...s} />
        <Rect x={13.5} y={6} width={8} height={4.5} rx={2.25} transform="rotate(-45 17.5 8.25)" {...s} />
        <Line x1={10} y1={14} x2={14} y2={10} {...s} />
      </>
    );
  },

  // communication
  'message-outline': (p) => <>{speechBubble(p)}</>,
  'message-text-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        {speechBubble(p)}
        <Line x1={7} y1={9} x2={17} y2={9} {...s} />
        <Line x1={7} y1={12} x2={14} y2={12} {...s} />
      </>
    );
  },
  'comment-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={4} y={5} width={16} height={12} rx={6} {...s} />
        <Path d="M8 17 L6.5 20.5 L11 17 Z" {...s} />
      </>
    );
  },
  'forum-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={8} y={3.5} width={12} height={8} rx={2.5} {...s} />
        <Path d="M13 11.5 L14 14 L17 11.5" {...s} />
        <Rect x={4} y={11} width={12} height={8} rx={2.5} {...s} />
        <Path d="M8 19 L7 21.5 L10.5 19" {...s} />
      </>
    );
  },
  send: (p) => <Path d="M4 12 L20 4 L14 20 L11 14 L4 12 Z" {...stroke(p.c, p.w)} />,
  'bell-outline': (p) => <>{bell(p)}</>,
  'bell-check-outline': (p) => (
    <>
      {bell(p)}
      <Circle cx={18} cy={7} r={3.4} fill="#fff" stroke={p.c} strokeWidth={p.w} />
      {check(p, -3.6, -8.6, 0.32)}
    </>
  ),
  'email-check-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={3} y={6} width={15} height={12} rx={2} {...s} />
        <Path d="M3 7 L10.5 13 L18 7" {...s} />
        <Circle cx={19} cy={17} r={3.4} fill="#fff" stroke={p.c} strokeWidth={p.w} />
        {check(p, -4.4, -6.6, 0.32)}
      </>
    );
  },

  // misc
  magnify: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Circle cx={10.5} cy={10.5} r={6} {...s} />
        <Line x1={15} y1={15} x2={20} y2={20} {...s} />
      </>
    );
  },
  refresh: (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M5 12a7 7 0 0 1 12.1-4.8" {...s} />
        <Path d="M17.1 3.5 V7.7 H12.9" {...s} />
        <Path d="M19 12a7 7 0 0 1-12.1 4.8" {...s} />
        <Path d="M6.9 20.5 V16.3 H11.1" {...s} />
      </>
    );
  },
  'information-outline': (p) => (
    <>
      {ring(p)}
      {dot(12, 8, 1, p.c)}
      <Line x1={12} y1={11} x2={12} y2={16.5} {...stroke(p.c, p.w)} />
    </>
  ),
  'lightbulb-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M8 10.5a4 4 0 1 1 8 0c0 2-1.2 3-2 4.2V17H10v-2.3c-.8-1.2-2-2.2-2-4.2z" {...s} />
        <Line x1={10} y1={19.5} x2={14} y2={19.5} {...s} />
        <Line x1={10.5} y1={21.5} x2={13.5} y2={21.5} {...s} />
      </>
    );
  },
  'heart-outline': (p) => <>{heart(p)}</>,
  heart: (p) => (
    <Path
      d="M12 20s-7-4.3-7-9.7A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7 2.7C19 15.7 12 20 12 20z"
      fill={p.c}
      stroke="none"
    />
  ),
  'bed-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M3.5 19 V9.5a1.5 1.5 0 0 1 1.5-1.5h5.5v4" {...s} />
        <Path d="M3.5 14.5 H20 a1 1 0 0 1 1 1 V19" {...s} />
        <Path d="M10.5 12 H19 a1.5 1.5 0 0 1 1.5 1.5 v1" {...s} />
        <Circle cx={7} cy={10.5} r={1.3} {...s} />
        <Line x1={3.5} y1={19} x2={3.5} y2={20.5} {...s} />
        <Line x1={20.5} y1={19} x2={20.5} y2={20.5} {...s} />
      </>
    );
  },
  'map-marker-outline': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Path d="M12 3a6.3 6.3 0 0 1 6.3 6.3c0 5.2-6.3 12-6.3 12S5.7 14.5 5.7 9.3A6.3 6.3 0 0 1 12 3z" {...s} />
        <Circle cx={12} cy={9.3} r={2.2} {...s} />
      </>
    );
  },
  'view-dashboard': (p) => {
    const s = stroke(p.c, p.w);
    return (
      <>
        <Rect x={3.5} y={3.5} width={8} height={8} rx={1.8} {...s} />
        <Rect x={12.5} y={3.5} width={8} height={5} rx={1.8} {...s} />
        <Rect x={12.5} y={10.5} width={8} height={10} rx={1.8} {...s} />
        <Rect x={3.5} y={13.5} width={8} height={7} rx={1.8} {...s} />
      </>
    );
  },
  tune: (p) => {
    const s = stroke(p.c, p.w);
    const sliders: [number, number][] = [
      [7, 9],
      [12, 15],
      [17, 7],
    ];
    return (
      <>
        {sliders.map(([x], i) => (
          <Line key={i} x1={x} y1={4} x2={x} y2={20} {...s} />
        ))}
        {sliders.map(([x, y], i) => (
          <Rect key={i} x={x - 2} y={y - 1.6} width={4} height={3.2} rx={1.6} fill={p.c} stroke="none" />
        ))}
      </>
    );
  },
};

glyphs['__fallback'] = (p) => <>{dot(12, 12, 3, p.c)}</>;

export type IconProps = {
  name: string;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 24, color = '#1A1A18', style }: IconProps) {
  const glyph = glyphs[name] ?? glyphs['__fallback'];
  if (__DEV__ && !glyphs[name]) {
    console.warn(`[Icon] no glyph registered for "${name}", falling back to a placeholder dot.`);
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {glyph({ c: String(color), w: 1.8 })}
    </Svg>
  );
}

export default Icon;
