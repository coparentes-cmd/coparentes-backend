export function formatPlDate(value) {
  const date = new Date(value);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

export function utcDayStart(isoDate) {
  const date = new Date(isoDate);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
}

export function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Monday 00:00 UTC of the Mon–Sun week containing [date]. */
export function mondayOfCalendarWeek(isoDate) {
  const day = utcDayStart(isoDate);
  const utcDay = day.getUTCDay(); // 0=Sun … 6=Sat
  const daysFromMonday = utcDay === 0 ? 6 : utcDay - 1;
  return addUtcDays(day, -daysFromMonday);
}

/** Week index relative to the calendar week of [start] (Mon–Sun). */
export function calendarWeekIndexSince(startIso, currentIso) {
  const startMonday = mondayOfCalendarWeek(startIso);
  const currentMonday = mondayOfCalendarWeek(currentIso);
  return Math.floor((currentMonday - startMonday) / (7 * 24 * 60 * 60 * 1000));
}

export function addUtcMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function custodianLabel(role) {
  return role === 'parentA' ? 'Mama' : 'Tata';
}
