import {
  ALL_PARENT_A,
  ALL_PARENT_B,
  DAY_NAMES,
  PATTERN_PRESETS
} from './constants.js';
import { utcDayStart } from './dateUtils.js';

const INTERVAL_META_KEY = '_weekInterval';
const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

export function patternLabel(patternType) {
  switch (patternType) {
    case 'weekAlternating':
      return 'Co tydzień na zmianę';
    case 'everyOtherWeekend':
      return 'Co drugi weekend';
    case 'customWeek':
      return 'Własny tydzień';
    default:
      return patternType;
  }
}

export function resolveWeekPattern(patternType, weekA, weekB, weekInterval) {
  if (patternType === 'customWeek') {
    const interval =
      Number.isFinite(weekInterval) && weekInterval > 0 ? weekInterval : 2;
    const cleanA = { ...(weekA ?? ALL_PARENT_A) };
    delete cleanA[INTERVAL_META_KEY];
    const cleanB = { ...(weekB ?? ALL_PARENT_B) };
    delete cleanB[INTERVAL_META_KEY];
    return {
      weekA: {
        ...cleanA,
        [INTERVAL_META_KEY]: interval
      },
      weekB: cleanB
    };
  }

  const preset = PATTERN_PRESETS[patternType];
  if (!preset) {
    return PATTERN_PRESETS.weekAlternating;
  }
  return preset;
}

function parseWeekPayload(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : { ...(raw || {}) };
  const intervalRaw = data[INTERVAL_META_KEY];
  const interval =
    Number.isFinite(Number(intervalRaw)) && Number(intervalRaw) > 0
      ? Number(intervalRaw)
      : null;
  delete data[INTERVAL_META_KEY];
  return { days: data, interval };
}

function weeksEqual(a, b) {
  return WEEKDAY_KEYS.every((day) => a[day] === b[day]);
}

export function getCustodianForDate(schedule, date) {
  const weekAParsed = parseWeekPayload(schedule.weekAJson);
  const weekBParsed = parseWeekPayload(schedule.weekBJson);
  const start = utcDayStart(schedule.startDate);
  const current = utcDayStart(date);
  const diffDays = Math.floor((current - start) / (24 * 60 * 60 * 1000));
  const weekIndex = Math.floor(diffDays / 7);
  const dayName = DAY_NAMES[current.getUTCDay()];

  if (schedule.patternType === 'customWeek') {
    let interval = 2;
    if (weekAParsed.interval != null) {
      interval = weekAParsed.interval;
    } else if (weeksEqual(weekAParsed.days, weekBParsed.days)) {
      interval = 1;
    }
    const week =
      weekIndex % interval === 0 ? weekAParsed.days : weekBParsed.days;
    return week[dayName] ?? week.monday ?? 'parentA';
  }

  const week = weekIndex % 2 === 0 ? weekAParsed.days : weekBParsed.days;
  return week[dayName] ?? week.monday ?? 'parentA';
}
