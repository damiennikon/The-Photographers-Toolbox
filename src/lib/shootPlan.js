import { getTimeZone } from "./timezone.js";

export function locationFromPin(pin) {
  return {
    lat: pin.lat,
    lon: pin.lng,
    name: pin.name || "Saved location",
    timeZone: getTimeZone(pin.lat, pin.lng),
    notes: pin.notes || "",
  };
}

export function shootingWindow(label, start, end, bearing) {
  if (!(start instanceof Date) || !Number.isFinite(start.getTime())) return null;
  return {
    label,
    start: start.toISOString(),
    end: end instanceof Date && end > start ? end.toISOString() : null,
    bearing: Number.isFinite(bearing) ? Math.round(bearing) % 360 : null,
  };
}

function calendarText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[;,]/g, "\\$&");
}

function calendarTime(value) {
  return new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, "");
}

function foldCalendarLine(line) {
  const encoder = new TextEncoder();
  let size = 0;
  let folded = "";
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 75) {
      folded += "\r\n ";
      size = 1;
    }
    folded += character;
    size += bytes;
  }
  return folded;
}

export function shootCalendar(shoot) {
  const { window, location } = shoot;
  const description = [
    window.label,
    `Location timezone: ${location.timeZone}`,
    window.bearing === null ? "" : `Direction: ${window.bearing}° true`,
    shoot.notes,
  ].filter(Boolean).join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Photographer's Toolbox//My Shoots//EN",
    "BEGIN:VEVENT",
    `UID:${shoot.id}@photographers-toolbox`,
    `DTSTAMP:${calendarTime(shoot.createdAt)}`,
    `DTSTART:${calendarTime(window.start)}`,
    ...(window.end ? [`DTEND:${calendarTime(window.end)}`] : []),
    `SUMMARY:${calendarText(shoot.title)}`,
    `LOCATION:${calendarText(`${location.name} (${location.lat}, ${location.lon})`)}`,
    `DESCRIPTION:${calendarText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].map(foldCalendarLine).join("\r\n");
}
