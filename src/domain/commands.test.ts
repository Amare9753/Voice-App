import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';
import { parseDurationPrefix } from './duration';

describe('voice commands', () => {
  it('parses timer phrases from the bench', () => {
    expect(parseCommand('start timer 5 minutes')).toEqual({
      type: 'start-timer',
      durationMs: 5 * 60_000,
      label: '5 min',
    });
    expect(parseCommand('start timer for five minutes')).toMatchObject({ durationMs: 300_000 });
    expect(parseCommand('timer 90 seconds')).toMatchObject({ durationMs: 90_000, label: '1 min 30 s' });
    expect(parseCommand('start timer 1 hour 30 minutes lysis')).toMatchObject({
      durationMs: 5_400_000,
      label: 'lysis',
    });
    expect(parseCommand('stop timer')).toEqual({ type: 'stop-timer' });
    expect(parseCommand('cancel timer.')).toEqual({ type: 'cancel-timer' });
  });

  it('parses section commands and leaves scientific prose alone', () => {
    expect(parseCommand('section observation')).toEqual({ type: 'set-section', section: 'observation' });
    expect(parseCommand('deviation')).toEqual({ type: 'set-section', section: 'deviation' });
    expect(parseCommand('observation: the gel shows two bands')).toEqual({
      type: 'content',
      voiceSection: 'observation',
    });
    expect(parseCommand('the gel shows two bands').type).toBe('content');
    expect(parseCommand('take a photo')).toEqual({ type: 'take-photo' });
  });

  it('parses compound durations', () => {
    expect(parseDurationPrefix('half an hour')).toEqual({ ms: 1_800_000, rest: '' });
    expect(parseDurationPrefix('1.5 hours then check')).toEqual({ ms: 5_400_000, rest: 'then check' });
  });
});
