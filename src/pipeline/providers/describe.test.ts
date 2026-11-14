import { describe, expect, it } from 'vitest';
import { describeProgress, formatElapsed } from './describe';

describe('formatElapsed', () => {
  it('formats seconds and minutes', () => {
    expect(formatElapsed(4200)).toBe('4s');
    expect(formatElapsed(65000)).toBe('1:05');
    expect(formatElapsed(-5)).toBe('0s');
  });
});

describe('describeProgress', () => {
  it('describes each phase', () => {
    expect(describeProgress('TRELLIS', null)).toMatch(/Connecting/);
    expect(describeProgress('TRELLIS', { phase: 'generating' })).toMatch(/building/);
    expect(describeProgress('TRELLIS', { phase: 'downloading' })).toMatch(/Downloading/);
  });
  it('shows queue position', () => {
    expect(describeProgress('X', { phase: 'queued', queuePosition: 3 })).toMatch(/3 people ahead/);
    expect(describeProgress('X', { phase: 'queued', queuePosition: 1 })).toMatch(/1 person ahead/);
    expect(describeProgress('X', { phase: 'queued', queuePosition: 0 })).toMatch(/free GPU/);
  });
});
