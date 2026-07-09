// Central place for every logType your workouts.ts uses, and what fields
// each one should collect when a player logs a set. Wire this into
// whatever component currently renders your logging form/inputs.

export type LogType =
  | 'strength'       // weight, reps, sets
  | 'reps-sets'       // reps, sets (bodyweight, no weight)
  | 'plyometric'      // reps, sets, height  <-- NEW
  | 'plank'           // duration
  | 'footwork'        // duration
  | 'sets-duration'   // sets, duration per set
  | 'skipping'        // duration or rep count
  | 'duration-distance' // duration, distance
  | 'recovery';       // duration

export interface LogFieldConfig {
  fields: Array<'weight' | 'reps' | 'sets' | 'height' | 'duration' | 'distance'>;
  units?: Partial<Record<'weight' | 'height' | 'duration' | 'distance', string>>;
}

export const LOG_TYPE_FIELDS: Record<LogType, LogFieldConfig> = {
  strength: {
    fields: ['weight', 'reps', 'sets'],
    units: { weight: 'lb' }, // switch to 'kg' if that's your default
  },
  'reps-sets': {
    fields: ['reps', 'sets'],
  },
  plyometric: {
    fields: ['reps', 'sets', 'height'],
    units: { height: 'in' }, // box height / jump height — switch to 'cm' if preferred
  },
  plank: {
    fields: ['duration'],
    units: { duration: 'sec' },
  },
  footwork: {
    fields: ['duration'],
    units: { duration: 'sec' },
  },
  'sets-duration': {
    fields: ['sets', 'duration'],
    units: { duration: 'sec' },
  },
  skipping: {
    fields: ['duration', 'reps'],
    units: { duration: 'sec' },
  },
  'duration-distance': {
    fields: ['duration', 'distance'],
    units: { duration: 'min', distance: 'km' },
  },
  recovery: {
    fields: ['duration'],
    units: { duration: 'min' },
  },
};

// Example usage in your logging form:
//
// const config = LOG_TYPE_FIELDS[exercise.logType];
// config.fields.includes('height') && <HeightInput unit={config.units?.height} />