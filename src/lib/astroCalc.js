// Astro calculations for the Night Quality Dashboard (Astro Planner Phase 1).
import { getTimes, getMoonPosition, getMoonTimes } from "suncalc";

// Ported from LensLink's getMilkyWayIntel(). KNOWN SIMPLIFICATION: the rise-hour
// table is a rough monthly approximation (one fixed value per calendar month,
// Southern Hemisphere timing), not date-precise — it doesn't account for the
// observer's longitude, year, or day-of-month drift. A future refinement should
// calculate galactic-center rise time properly via ephemeris (RA/Dec of Sgr A*
// transformed to the observer's local sidereal time) instead of this lookup
// table. Direction is intentionally omitted here (see astroPlanner.js) rather
// than carrying over LensLink's hardcoded "ESE" value, which was never
// calculated either.
export function getMilkyWayIntel(date = new Date()) {
  const month = date.getMonth();
  const riseHours = [23, 1, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5];
  const riseHour = riseHours[month];
  const riseTime = `${String(riseHour).padStart(2, "0")}:00`;
  const bestWindow = `${String((riseHour + 2) % 24).padStart(2, "0")}:00 - 04:30`;
  return { riseTime, bestWindow };
}

// Ported from LensLink's getMoonIllumination(). A simple synodic-cycle
// approximation (not full lunar ephemeris) — good enough for a "roughly how
// full is the moon" readout.
export function getMoonIllumination(date = new Date()) {
  const synodic = 29.53058867;
  const msPerDay = 86400000;
  const baseDate = new Date("2000-01-06T18:14:00Z");
  const diff = date - baseDate;
  const days = diff / msPerDay;
  const phase = (days % synodic) / synodic;
  return Math.round(50 * (1 - Math.cos(phase * 2 * Math.PI)));
}

// Astronomical twilight (sun at -18°) start/end for the night that begins on
// `date`. suncalc's `night` field is dusk (dark starts) on the given calendar
// date; `nightEnd` is dawn (dark ends), so dawn is fetched from the following
// calendar date since it falls after midnight.
export function getDarknessWindow(date, lat, lon) {
  const eveningTimes = getTimes(date, lat, lon);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const morningTimes = getTimes(nextDay, lat, lon);

  const duskStart = eveningTimes.night;
  const dawnEnd = morningTimes.nightEnd;
  const valid = duskStart instanceof Date && !isNaN(duskStart) && dawnEnd instanceof Date && !isNaN(dawnEnd);

  return {
    duskStart: valid ? duskStart : null,
    dawnEnd: valid ? dawnEnd : null,
    valid,
  };
}

// Moonrise/moonset for the given calendar date, plus whether the moon is up
// at any point during [duskStart, dawnEnd] (sampled every 15 min — cheap and
// avoids fiddly rise/set interval-overlap math across midnight).
export function getMoonInfo(date, lat, lon, duskStart, dawnEnd) {
  const times = getMoonTimes(date, lat, lon);

  let upDuringDark = null;
  if (duskStart && dawnEnd) {
    upDuringDark = false;
    const stepMs = 15 * 60 * 1000;
    for (let t = duskStart.getTime(); t <= dawnEnd.getTime(); t += stepMs) {
      const pos = getMoonPosition(new Date(t), lat, lon);
      if (pos.altitude > 0) {
        upDuringDark = true;
        break;
      }
    }
  }

  return {
    rise: times.rise ?? null,
    set: times.set ?? null,
    alwaysUp: !!times.alwaysUp,
    alwaysDown: !!times.alwaysDown,
    upDuringDark,
  };
}
