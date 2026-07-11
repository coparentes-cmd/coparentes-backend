import {
  ALL_PARENT_A,
  ALL_PARENT_B,
  DAY_NAMES,
  PATTERN_PRESETS
} from './constants.js';
import { utcDayStart } from './dateUtils.js';

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

export function resolveWeekPattern(patternType, weekA, weekB) {
  if (patternType === 'customWeek') {
    return {
      weekA: weekA ?? ALL_PARENT_A,
      weekB: weekB ?? ALL_PARENT_B
    };
  }

  const preset = PATTERN_PRESETS[patternType];
  if (!preset) {
    return PATTERN_PRESETS.weekAlternating;
  }
  return preset;
}

export function getCustodianForDate(schedule, date) {
  const weekA = JSON.parse(schedule.weekAJson);
  const weekB = JSON.parse(schedule.weekBJson);
  const start = utcDayStart(schedule.startDate);
  const current = utcDayStart(date);
  const diffDays = Math.floor((current - start) / (24 * 60 * 60 * 1000));
  const weekIndex = Math.floor(diffDays / 7);
  const dayName = DAY_NAMES[current.getUTCDay()];
  const week = weekIndex % 2 === 0 ? weekA : weekB;
  return week[dayName] ?? week.monday ?? 'parentA';
}
