export type TagCategory = { key: string; label: string; tags: string[] };

export const STRENGTH_CATEGORIES: TagCategory[] = [
  {
    key: 'technical',
    label: 'Technical',
    tags: ['Strong Smash', 'Great Net Play', 'Accurate Clears', 'Deceptive Drops', 'Solid Serve'],
  },
  {
    key: 'physical',
    label: 'Physical',
    tags: ['Fast Footwork', 'Great Endurance', 'Quick Reflexes', 'Strong Jump'],
  },
  {
    key: 'mental',
    label: 'Mental / Pattern',
    tags: ['Stays Calm', 'Good Game Reading', 'Consistent Under Pressure', 'Smart Shot Selection'],
  },
];

export const WEAKNESS_CATEGORIES: TagCategory[] = [
  {
    key: 'technical',
    label: 'Technical',
    tags: ['Weak Backhand', 'Short Serve', 'Inconsistent Clears', 'Weak Net Shots'],
  },
  {
    key: 'physical',
    label: 'Physical',
    tags: ['Slow Footwork', 'Tires Late Game', 'Weak Jump', 'Slow to Recover Position'],
  },
  {
    key: 'mental',
    label: 'Mental / Pattern',
    tags: ['Gets Frustrated Under Pressure', 'Predictable Patterns', 'Rushes Shots', 'Loses Focus Late Game'],
  },
];
