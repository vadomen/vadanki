import { startOfDay } from '../services/day.js';

describe('startOfDay (Europe/Kyiv)', () => {
  const tz = 'Europe/Kyiv';

  it('uses Kyiv midnight in winter (UTC+2)', () => {
    // 2026-11-02 01:30 Kyiv = 2026-11-01 23:30 UTC → still Nov 2 locally
    expect(startOfDay(new Date('2026-11-01T23:30:00Z'), tz).toISOString()).toBe(
      '2026-11-01T22:00:00.000Z',
    );
  });

  it('uses Kyiv midnight in summer (UTC+3)', () => {
    expect(startOfDay(new Date('2026-07-15T12:00:00Z'), tz).toISOString()).toBe(
      '2026-07-14T21:00:00.000Z',
    );
  });

  it('handles DST switch days', () => {
    // 2026-03-29: clocks go forward at 03:00; midnight was still UTC+2
    expect(startOfDay(new Date('2026-03-29T12:00:00Z'), tz).toISOString()).toBe(
      '2026-03-28T22:00:00.000Z',
    );
    // 2026-10-25: clocks go back at 04:00; midnight was still UTC+3
    expect(startOfDay(new Date('2026-10-25T12:00:00Z'), tz).toISOString()).toBe(
      '2026-10-24T21:00:00.000Z',
    );
  });

  it('is just before 22:00 UTC boundary in winter', () => {
    expect(startOfDay(new Date('2026-11-02T21:59:59Z'), tz).toISOString()).toBe(
      '2026-11-01T22:00:00.000Z',
    );
    expect(startOfDay(new Date('2026-11-02T22:00:00Z'), tz).toISOString()).toBe(
      '2026-11-02T22:00:00.000Z',
    );
  });
});
