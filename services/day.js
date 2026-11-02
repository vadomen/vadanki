// Calendar-day boundaries in the app's timezone. The server runs in UTC on
// Render, so "today" must be computed explicitly for the users' local day.
export const APP_TZ = process.env.APP_TZ || 'Europe/Kyiv';

// Offset (ms) of `tz` from UTC at instant `date` — positive east of UTC.
function tzOffsetMs(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The UTC instant of local midnight (in `tz`) for the day containing `now`.
export function startOfDay(now = new Date(), tz = APP_TZ) {
  const local = new Date(now.getTime() + tzOffsetMs(now, tz));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Re-evaluate the offset at midnight itself so DST switch days are exact.
  let guess = midnightAsUtc - tzOffsetMs(now, tz);
  guess = midnightAsUtc - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}
