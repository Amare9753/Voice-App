import type { SectionId } from '../domain/types';

export const theme = {
  bg: '#F3F0E8',
  ink: '#1C1917',
  muted: '#57534E',
  card: '#FFFDF8',
  line: '#D6D3D1',
  green: '#0F6E56',
  greenInk: '#FFFFFF',
  record: '#B42318',
  recordInk: '#FFFFFF',
  low: '#FDE68A',
  lowInk: '#78350F',
  danger: '#9F1239',
};

export const sectionColors: Record<SectionId, string> = {
  observation: '#155E75',
  deviation: '#9F1239',
  material: '#1D4ED8',
  result: '#166534',
  procedure: '#6D28D9',
  note: '#44403C',
};

export const minTouch = 64;
