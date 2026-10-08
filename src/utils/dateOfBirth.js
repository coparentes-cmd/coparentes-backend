/**
 * Date of birth is a calendar day, not an instant.
 * Normalize any ISO timestamp to noon UTC of its UTC Y-M-D so timezone
 * offsets (e.g. Europe/Warsaw local midnight → previous UTC day) do not
 * change the intended calendar date when comparing or storing.
 */
export function normalizeDateOfBirth(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0)
  );
}

export function isSameCalendarDay(left, right) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

export function isDateOfBirthInFuture(value) {
  const dob = normalizeDateOfBirth(value);
  if (!dob) {
    return false;
  }
  const today = normalizeDateOfBirth(new Date());
  return dob.getTime() > today.getTime();
}
