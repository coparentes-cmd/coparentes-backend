export const SCHEDULE_MESSAGING_CATEGORY = 'Zmiana grafiku';
export const GENERATION_MONTHS = 12;

export const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

export const ALL_PARENT_A = {
  monday: 'parentA',
  tuesday: 'parentA',
  wednesday: 'parentA',
  thursday: 'parentA',
  friday: 'parentA',
  saturday: 'parentA',
  sunday: 'parentA'
};

export const ALL_PARENT_B = {
  monday: 'parentB',
  tuesday: 'parentB',
  wednesday: 'parentB',
  thursday: 'parentB',
  friday: 'parentB',
  saturday: 'parentB',
  sunday: 'parentB'
};

export const PATTERN_PRESETS = {
  weekAlternating: {
    weekA: ALL_PARENT_A,
    weekB: ALL_PARENT_B
  },
  everyOtherWeekend: {
    weekA: {
      monday: 'parentA',
      tuesday: 'parentA',
      wednesday: 'parentA',
      thursday: 'parentA',
      friday: 'parentA',
      saturday: 'parentB',
      sunday: 'parentB'
    },
    weekB: {
      monday: 'parentB',
      tuesday: 'parentB',
      wednesday: 'parentB',
      thursday: 'parentB',
      friday: 'parentB',
      saturday: 'parentA',
      sunday: 'parentA'
    }
  }
};
