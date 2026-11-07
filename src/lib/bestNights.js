import { getMoonPosition } from "suncalc";
import { getDarknessWindow, getGalacticCoreAltAz } from "./astroCalc.js";
import { addLocalCalendarDays, dateInZone } from "./timezone.js";

export const CORE_MIN_ALTITUDE = 15;
const MINUTE = 60000;
const STEP = 5 * MINUTE;

function refineBoundary(left, right, qualifies, wasInside) {
  while (right - left > 1000) {
    const middle = Math.floor((left + right) / 2);
    if (qualifies(new Date(middle)) === wasInside) left = middle;
    else right = middle;
  }
  return new Date(right);
}

function windowsBetween(start, end, qualifies) {
  const windows = [];
  let previous = start.getTime();
  const endMs = end.getTime();
  let inside = qualifies(start);
  let opened = inside ? start : null;
  while (previous < endMs) {
    const next = Math.min(previous + STEP, endMs);
    const nextInside = qualifies(new Date(next));
    if (nextInside !== inside) {
      const boundary = refineBoundary(previous, next, qualifies, inside);
      if (inside) windows.push({ start: opened, end: boundary });
      else opened = boundary;
      inside = nextInside;
    }
    previous = next;
  }
  if (opened && inside && end > opened) windows.push({ start: opened, end });
  return windows;
}

export function rankNights(firstDate, location, requireCore) {
  const { lat, lon, timeZone } = location;
  const nights = [];
  for (let i = 0; i < 30; i += 1) {
    const day = i === 0 ? firstDate : addLocalCalendarDays(firstDate, i, timeZone);
    const { valid, duskStart, dawnEnd } = getDarknessWindow(day, lat, lon, timeZone);
    if (!valid) continue;
    const windows = windowsBetween(duskStart, dawnEnd, (time) =>
      getMoonPosition(time, lat, lon).altitude <= 0 &&
      (!requireCore || getGalacticCoreAltAz(time, lat, lon).altitude >= CORE_MIN_ALTITUDE)
    );
    windows.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    const best = windows[0];
    if (best && best.end - best.start >= MINUTE) {
      nights.push({ date: dateInZone(day, timeZone), ...best, duration: best.end - best.start });
    }
  }
  return nights.sort((a, b) => b.duration - a.duration || a.date.localeCompare(b.date));
}
