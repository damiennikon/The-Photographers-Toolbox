import tzlookup from "tz-lookup";

const FALLBACK_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function getTimeZone(lat, lon) {
  try {
    return tzlookup(Number(lat), Number(lon));
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

export function parseLocalDateTime(dateValue, timeValue = "12:00", timeZone = FALLBACK_TIME_ZONE) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = localAsUtc;

  // Iterate because the offset itself can change around a daylight-saving
  // transition. This also keeps the conversion correct for zones that are
  // not whole-hour offsets.
  for (let i = 0; i < 4; i += 1) {
    const offset = getTimeZoneOffsetMinutes(new Date(instant), timeZone);
    const adjusted = localAsUtc - offset * 60000;
    if (adjusted === instant) break;
    instant = adjusted;
  }

  return new Date(instant);
}

export function addLocalCalendarDays(date, days, timeZone = FALLBACK_TIME_ZONE) {
  const parts = partsFor(date, timeZone);
  return parseLocalDateTime(utcDateString(parts.year, parts.month, parts.day + days), "12:00", timeZone);
}

export function formatTimeInZone(date, timeZone = FALLBACK_TIME_ZONE) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
}


