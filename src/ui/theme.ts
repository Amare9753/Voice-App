import type { SectionId } from '../domain/types';

export const theme = {
  bg: '#F4F5F7',
  ink: '#121417',
  muted: '#5C6570',
  card: '#FFFFFF',
  line: '#E3E6EB',
  green: '#0E6B57',
  greenInk: '#FFFFFF',
  record: '#9F2D2D',
  recordInk: '#FFFFFF',
  low: '#FBF3DF',
  lowInk: '#6D5420',
  danger: '#8F2433',
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
