import tzlookup from "tz-lookup";
import { getPreferences } from "./preferences.js";

const FALLBACK_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function getTimeZone(lat, lon) {
  try {
    return tzlookup(Number(lat), ((Number(lon) % 360 + 540) % 360) - 180);
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function partsFor(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function getTimeZoneOffsetMinutes(date, timeZone = FALLBACK_TIME_ZONE) {
  const parts = partsFor(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function utcDateString(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function dateInZone(date, timeZone) {
  const { year, month, day } = partsFor(date, timeZone);
  return utcDateString(year, month, day);
}

export function clockInZone(date, timeZone) {
  const { hour, minute } = partsFor(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseLocalDateTime(dateValue, timeValue = "12:00", timeZone = FALLBACK_TIME_ZONE) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const dayMs = 86400000;
  const before = getTimeZoneOffsetMinutes(new Date(localAsUtc - dayMs), timeZone);
  const after = getTimeZoneOffsetMinutes(new Date(localAsUtc + dayMs), timeZone);
  const earlier = new Date(localAsUtc - Math.max(before, after) * 60000);
  if (getTimeZoneOffsetMinutes(earlier, timeZone) === Math.max(before, after)) return earlier;
  // A repeated time uses the first occurrence. A skipped time advances by the gap.
  return new Date(localAsUtc - Math.min(before, after) * 60000);
}

export function localDayBounds(date, timeZone) {
  const { year, month, day } = partsFor(date, timeZone);
  return [
    parseLocalDateTime(utcDateString(year, month, day), "00:00", timeZone),
    parseLocalDateTime(utcDateString(year, month, day + 1), "00:00", timeZone),
  ];
}

export function addLocalCalendarDays(date, days, timeZone = FALLBACK_TIME_ZONE) {
  const parts = partsFor(date, timeZone);
  return parseLocalDateTime(utcDateString(parts.year, parts.month, parts.day + days), "12:00", timeZone);
}

export function formatTimeInZone(date, timeZone = FALLBACK_TIME_ZONE) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "—";
  const hourCycle = getPreferences().timeFormat === "12" ? "h12" : "h23";
  return date.toLocaleTimeString([], { timeZone, hour: "2-digit", minute: "2-digit", hourCycle });
}

