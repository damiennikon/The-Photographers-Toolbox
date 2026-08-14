// Astro calculations for the Night Quality Dashboard (Astro Planner Phase 1).
import { getTimes, getMoonPosition, getMoonTimes } from "suncalc";
import { Observer, Horizon } from "astronomy-engine";

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

// Galactic core (Sagittarius A*), J2000 equatorial coordinates — fixed, only
// altitude/azimuth from a given location/time changes. Same constants as
// Photography Manager's src/main/astronomy.js (also astronomy-engine) so the
// two apps agree.
const GALACTIC_CORE_RA = 17.7611; // hours
const GALACTIC_CORE_DEC = -29.0078; // degrees

// Below this altitude, horizon obstructions and atmospheric extinction make
// the core impractical to shoot even though it's technically above 0°.
// Exported so a specific site with an unusually low/high horizon can tune it.
export const MILKY_WAY_MIN_ALTITUDE = 10;

const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function compassDirection(azimuthDeg) {
  return COMPASS_POINTS[Math.round(azimuthDeg / 22.5) % 16];
}

function coreHorizon(date, observer) {
  return Horizon(date, observer, GALACTIC_CORE_RA, GALACTIC_CORE_DEC, "normal");
}

// Binary-searches the crossing of MILKY_WAY_MIN_ALTITUDE between two sampled
// instants (one above, one below) to sub-second precision — far tighter than
// the 5-minute sampling grid used to find the bracket in the first place.
function refineCrossing(tBelowSide, tAboveSide, observer, belowIsEarlier) {
  let lo = belowIsEarlier ? tBelowSide : tAboveSide;
  let hi = belowIsEarlier ? tAboveSide : tBelowSide;
  const loIsBelow = coreHorizon(new Date(lo), observer).altitude <= MILKY_WAY_MIN_ALTITUDE;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const midIsBelow = coreHorizon(new Date(mid), observer).altitude <= MILKY_WAY_MIN_ALTITUDE;
    if (midIsBelow === loIsBelow) lo = mid;
    else hi = mid;
  }
  return new Date((lo + hi) / 2);
}

// Real visibility window for the galactic core: above MILKY_WAY_MIN_ALTITUDE
// AND within the astronomical darkness window, found by sampling altitude
// across the night (every 5 min) and refining the crossing point(s) via
// binary search. Requires `darkness` from getDarknessWindow() so the two
// cards can't disagree about what "dark" means.
export function getMilkyWayVisibility(darkness, lat, lon) {
  if (!darkness.valid) {
    return { visible: false, allNight: false, start: null, end: null, startAzimuth: null, endAzimuth: null };
  }

  const observer = new Observer(lat, lon, 0);
  const startMs = darkness.duskStart.getTime();
  const endMs = darkness.dawnEnd.getTime();
  const stepMs = 5 * 60 * 1000;

  const samples = [];
  for (let t = startMs; t < endMs; t += stepMs) {
    samples.push({ t, alt: coreHorizon(new Date(t), observer).altitude });
  }
  samples.push({ t: endMs, alt: coreHorizon(new Date(endMs), observer).altitude });

  const above = samples.map((s) => s.alt > MILKY_WAY_MIN_ALTITUDE);

  if (!above.includes(true)) {
    return { visible: false, allNight: false, start: null, end: null, startAzimuth: null, endAzimuth: null };
  }

  if (above.every(Boolean)) {
    return {
      visible: true,
      allNight: true,
      start: darkness.duskStart,
      end: darkness.dawnEnd,
      startAzimuth: coreHorizon(darkness.duskStart, observer).azimuth,
      endAzimuth: coreHorizon(darkness.dawnEnd, observer).azimuth,
    };
  }

  const firstIdx = above.indexOf(true);
  const lastIdx = above.lastIndexOf(true);

  const start = firstIdx === 0 ? darkness.duskStart : refineCrossing(samples[firstIdx - 1].t, samples[firstIdx].t, observer, true);
  const end = lastIdx === above.length - 1 ? darkness.dawnEnd : refineCrossing(samples[lastIdx].t, samples[lastIdx + 1].t, observer, false);

  return {
    visible: true,
    allNight: false,
    start,
    end,
    startAzimuth: coreHorizon(start, observer).azimuth,
    endAzimuth: coreHorizon(end, observer).azimuth,
  };
}

export function milkyWayCompassDirection(azimuthDeg) {
  return azimuthDeg == null ? null : compassDirection(azimuthDeg);
}
