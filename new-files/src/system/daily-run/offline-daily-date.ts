export const OFFLINE_DAILY_MIN_YEAR = 1900;

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

const pad = (value: number): string => String(value).padStart(2, "0");

export function formatCalendarDate(parts: CalendarDateParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function getLocalCalendarDate(date = new Date()): CalendarDateParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function getPreviousLocalCalendarDate(date = new Date()): CalendarDateParts {
  const current = getLocalCalendarDate(date);
  // Noon avoids the missing/repeated hours around daylight-saving transitions.
  const previous = new Date(current.year, current.month - 1, current.day - 1, 12);
  return getLocalCalendarDate(previous);
}

export function getOfflineDailyYears(date = new Date()): number[] {
  const currentYear = getLocalCalendarDate(date).year;
  return Array.from({ length: currentYear - OFFLINE_DAILY_MIN_YEAR + 1 }, (_, index) => currentYear - index);
}

export function getOfflineDailyMonths(year: number, date = new Date()): number[] {
  const current = getLocalCalendarDate(date);
  const lastMonth = year === current.year ? current.month : 12;
  return Array.from({ length: lastMonth }, (_, index) => index + 1);
}

export function getOfflineDailyDays(year: number, month: number, date = new Date()): number[] {
  const current = getLocalCalendarDate(date);
  const daysInMonth = new Date(year, month, 0, 12).getDate();
  const lastDay = year === current.year && month === current.month ? current.day : daysInMonth;
  return Array.from({ length: lastDay }, (_, index) => index + 1);
}

export function isValidOfflineDailyDate(parts: CalendarDateParts, date = new Date()): boolean {
  const current = getLocalCalendarDate(date);
  if (parts.year < OFFLINE_DAILY_MIN_YEAR || parts.year > current.year || parts.month < 1 || parts.month > 12) {
    return false;
  }
  const validDays = getOfflineDailyDays(parts.year, parts.month, date);
  return validDays.includes(parts.day);
}
