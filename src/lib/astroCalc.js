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

// Binary-searches a moon altitude=0 crossing between two sampled instants
// (one above horizon, one below) — same refinement approach as the Milky Way
// crossing search below, reused here so the "how much of the dark window"
// picture is as precise as the visibility flag itself.
function refineMoonCrossing(tBelowSide, tAboveSide, lat, lon, belowIsEarlier) {
  let lo = belowIsEarlier ? tBelowSide : tAboveSide;
  let hi = belowIsEarlier ? tAboveSide : tBelowSide;
  const loIsBelow = getMoonPosition(new Date(lo), lat, lon).altitude <= 0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const midIsBelow = getMoonPosition(new Date(mid), lat, lon).altitude <= 0;
    if (midIsBelow === loIsBelow) lo = mid;
    else hi = mid;
  }
  return new Date((lo + hi) / 2);
}

// Moonrise/moonset for the given calendar date, plus whether the moon is up
// at any point during [duskStart, dawnEnd], and — if so — the (start, end)
// sub-interval of the dark window it's up for (clipped to dusk/dawn at
// either edge). Sampled every 15 min then refined via binary search, which
// avoids fiddly rise/set interval-overlap math across midnight.
export function getMoonInfo(date, lat, lon, duskStart, dawnEnd) {
  const times = getMoonTimes(date, lat, lon);

  let upDuringDark = null;
  let overlapStart = null;
  let overlapEnd = null;

  if (duskStart && dawnEnd) {
    const stepMs = 15 * 60 * 1000;
    const samples = [];
    for (let t = duskStart.getTime(); t < dawnEnd.getTime(); t += stepMs) {
      samples.push({ t, up: getMoonPosition(new Date(t), lat, lon).altitude > 0 });
    }
    samples.push({ t: dawnEnd.getTime(), up: getMoonPosition(dawnEnd, lat, lon).altitude > 0 });

    upDuringDark = samples.some((s) => s.up);

    if (upDuringDark) {
      const firstIdx = samples.findIndex((s) => s.up);
      const lastIdx = samples.length - 1 - [...samples].reverse().findIndex((s) => s.up);

      overlapStart = firstIdx === 0 ? duskStart : refineMoonCrossing(samples[firstIdx - 1].t, samples[firstIdx].t, lat, lon, true);
      overlapEnd = lastIdx === samples.length - 1 ? dawnEnd : refineMoonCrossing(samples[lastIdx].t, samples[lastIdx + 1].t, lat, lon, false);
    }
  }

  return {
    rise: times.rise ?? null,
    set: times.set ?? null,
    alwaysUp: !!times.alwaysUp,
    alwaysDown: !!times.alwaysDown,
    upDuringDark,
    overlapStart,
    overlapEnd,
  };
}

// Galactic core (Sagittarius A*), J2000 equatorial coordinates — fixed, only
// altitude/azimuth from a given location/time changes. Same constants as
// Photography Manager's src/main/astronomy.js (also astronomy-engine) so the
// two apps agree.
const GALACTIC_CORE_RA = 17.7611; // hours
const GALACTIC_CORE_DEC = -29.0078; // degrees

// Was 10° originally, as a deliberate "impractical to shoot below this"
// buffer — but that made the window end ~52 min earlier than PhotoPills for
// the same night (18:44–02:16 here vs PhotoPills' 18:45–03:08). Checked
// AstroWeather's own Milky Way calc (src/weatherWorker.js) before touching
// this: it uses the identical 10° threshold and astronomy-engine call, so
// its closer-looking ~3:00am display isn't evidence of a better threshold —
// it's a rounding artifact of only sampling once per hour, which reports
// the *next* whole hour after a threshold crossing (a true ~02:16 crossing
// shows as "sets 03:00"). That ruled out "copy AstroWeather's threshold" as
// the fix, since it's already the same value.
// What actually explains the gap: `Horizon(..., 'normal')` already applies
// atmospheric refraction, so 0° here means "the core's refracted position
// crosses the true horizon" — the standard rise/set definition, and the one
// PhotoPills appears to use. Checked the core's altitude at both candidate
// end times for the same night: 10.1° at 02:16 (confirms that's exactly
// where the old threshold cut it off), and still +0.5° at PhotoPills'
// 03:08 — positive, just below the old 10° buffer. Recomputing with this
// threshold at 0° lands the crossing at 03:11, ~3 min from PhotoPills — the
// old 10° buffer, not a refraction or timezone bug, was the cause.
// Exported so a specific site with an unusually low/high horizon can tune it.
export const MILKY_WAY_MIN_ALTITUDE = 0;

const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function compassDirection(azimuthDeg) {
  return COMPASS_POINTS[Math.round(azimuthDeg / 22.5) % 16];
}

// Generic alt/az lookup for any RA/Dec — the piece `coreHorizon()` used to
// do only for the galactic core's fixed coordinates. Kept separate from
// `coreHorizon()` (rather than inlined) so callers that need an arbitrary
// target's position, like `getTargetPeakAltitude()` below, don't have to
// duplicate the `Horizon(..., "normal")` call.
function horizonFor(date, observer, raHours, decDeg) {
  return Horizon(date, observer, raHours, decDeg, "normal");
}

function coreHorizon(date, observer) {
  return horizonFor(date, observer, GALACTIC_CORE_RA, GALACTIC_CORE_DEC);
}

// Altitude at each 5-min tick across [startMs, endMs] (inclusive of both
// ends) for an arbitrary RA/Dec — the sampling loop `getMilkyWayVisibility()`
// used to run only for the galactic core, now shared with
// `getTargetPeakAltitude()` so both walk the darkness window the same way.
function sampleAltitudeWindow(startMs, endMs, stepMs, observer, raHours, decDeg) {
  const samples = [];
  for (let t = startMs; t < endMs; t += stepMs) {
    samples.push({ t, alt: horizonFor(new Date(t), observer, raHours, decDeg).altitude });
  }
  samples.push({ t: endMs, alt: horizonFor(new Date(endMs), observer, raHours, decDeg).altitude });
  return samples;
}

// Galactic core's altitude/azimuth right now (or at any instant) for a given
// location — the single live reading Night AR polls periodically, reusing
// the exact same calculation as the visibility window above rather than a
// second version of it.
export function getGalacticCoreAltAz(date, lat, lon) {
  return coreHorizon(date, new Observer(lat, lon, 0));
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

  const samples = sampleAltitudeWindow(startMs, endMs, stepMs, observer, GALACTIC_CORE_RA, GALACTIC_CORE_DEC);

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

// Below this, a DSO catalog target is technically above the horizon but not
// worth planning a night around — atmospheric extinction and the thicker
// light-pollution band near the horizon both bite hard by this point.
// Exported so a specific site can tune it, same pattern as
// MILKY_WAY_MIN_ALTITUDE above.
export const DSO_MIN_ALTITUDE = 25;

// How high a given RA/Dec target gets during the darkness window, and when —
// used to rank DSO catalog entries for "tonight's best targets". Same 5-min
// sampling as getMilkyWayVisibility, but callers only need the peak, not a
// precise rise/set crossing, so this skips refineCrossing entirely.
export function getTargetPeakAltitude(darkness, lat, lon, raHours, decDeg) {
  if (!darkness.valid) {
    return { peakAltitude: null, peakTime: null };
  }

  const observer = new Observer(lat, lon, 0);
  const startMs = darkness.duskStart.getTime();
  const endMs = darkness.dawnEnd.getTime();
  const stepMs = 5 * 60 * 1000;

  const samples = sampleAltitudeWindow(startMs, endMs, stepMs, observer, raHours, decDeg);

  let peak = samples[0];
  for (const s of samples) {
    if (s.alt > peak.alt) peak = s;
  }

  return { peakAltitude: peak.alt, peakTime: new Date(peak.t) };
}

// Standard IAU J2000 galactic north pole — used only to work out the
// galactic plane's *orientation* on screen (for the Night AR band overlay),
// not the core's own position, which stays pinned to the Sgr A* radio
// coordinates above. The pole is by definition perpendicular to the plane,
// so rotating the core's direction vector around this axis traces the
// galactic equator.
const GALACTIC_POLE_RA = 12.8524; // hours (192.85948°)
const GALACTIC_POLE_DEC = 27.1283; // degrees
const GALACTIC_PLANE_OFFSET_DEG = 10;

function toUnitVector(raHours, decDeg) {
  const raRad = ((raHours * 15) / 180) * Math.PI;
  const decRad = (decDeg / 180) * Math.PI;
  return {
    x: Math.cos(decRad) * Math.cos(raRad),
    y: Math.cos(decRad) * Math.sin(raRad),
    z: Math.sin(decRad),
  };
}

function fromUnitVector(v) {
  const decDeg = (Math.asin(v.z) * 180) / Math.PI;
  const raDeg = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
  return { raHours: raDeg / 15, decDeg };
}

// Rodrigues' rotation formula: rotates unit vector `v` by `angleRad` around
// unit axis `k`.
function rotateAroundAxis(v, k, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const kDotV = k.x * v.x + k.y * v.y + k.z * v.z;
  const kCrossV = { x: k.y * v.z - k.z * v.y, y: k.z * v.x - k.x * v.z, z: k.x * v.y - k.y * v.x };
  return {
    x: v.x * cos + kCrossV.x * sin + k.x * kDotV * (1 - cos),
    y: v.y * cos + kCrossV.y * sin + k.y * kDotV * (1 - cos),
    z: v.z * cos + kCrossV.z * sin + k.z * kDotV * (1 - cos),
  };
}

// A fixed point GALACTIC_PLANE_OFFSET_DEG of galactic longitude away from
// the core (latitude 0, same as the core by definition) — computed once at
// module load since it doesn't depend on date/location, only recomputed
// (converted to alt/az) per observation below.
const planeOffsetPoint = fromUnitVector(
  rotateAroundAxis(
    toUnitVector(GALACTIC_CORE_RA, GALACTIC_CORE_DEC),
    toUnitVector(GALACTIC_POLE_RA, GALACTIC_POLE_DEC),
    (GALACTIC_PLANE_OFFSET_DEG * Math.PI) / 180
  )
);

function planeOffsetHorizon(date, observer) {
  return Horizon(date, observer, planeOffsetPoint.raHours, planeOffsetPoint.decDeg, "normal");
}

// Tilt of the galactic plane on screen, right now, at this location: the
// angle (screen/CSS convention — clockwise-positive from local horizontal)
// of the line through the core and the second point defined above, both
// projected to alt/az for the same date/observer. Used by Night AR to
// rotate the Milky Way band texture to match the sky; recomputed on the
// same cadence as the core position itself (see EPHEMERIS_REFRESH_MS in
// nightAR.js), since the sky's rotation changes this continuously.
//
// Screen mapping: azimuth increases to the right (like screen x), altitude
// increases upward (opposite of screen y, which increases downward) — same
// convention nightAR.js already uses for deltaAz/deltaAlt.
export function getGalacticPlaneTiltDeg(date, lat, lon) {
  const observer = new Observer(lat, lon, 0);
  const core = coreHorizon(date, observer);
  const offset = planeOffsetHorizon(date, observer);

  const dAz = ((offset.azimuth - core.azimuth + 540) % 360) - 180;
  const dAlt = offset.altitude - core.altitude;
  return (Math.atan2(-dAlt, dAz) * 180) / Math.PI;
}

// The celestial pole for Polar Align — whichever pole (dec = +90 for the
// northern hemisphere, -90 for the southern) is on the observer's side of
// the sky, matching DSO Search's dsoDatabase "NCP"/"SCP" entries
// (github.com/damiennikon/DSO-Search database.js: { id: "NCP", ra: 0,
// dec: 90 } / { id: "SCP", ra: 0, dec: -90 }) rather than re-deriving new
// coordinates. RA is irrelevant at dec = ±90 (every RA gives an identical
// alt/az there) — kept at 0 to match that source rather than for any
// mathematical reason.
//
// Unlike the galactic core, the pole doesn't move in alt/az over the course
// of a night — that's what makes it useful for polar alignment. Altitude
// always equals the observer's latitude (its magnitude); azimuth is always
// true north (0°) from the northern hemisphere or true south (180°) from
// the southern. Both are exact, refraction aside, for any date/time — which
// also makes this trivial to sanity-check (see astroCalc.pole.test in the
// PR description): compute it at several different times and confirm it
// doesn't move, then confirm altitude ≈ |lat| and azimuth ≈ 0°/180°.
export function getCelestialPoleAltAz(date, lat, lon) {
  const hemisphere = lat >= 0 ? "N" : "S";
  const dec = hemisphere === "N" ? 90 : -90;
  const altAz = Horizon(date, new Observer(lat, lon, 0), 0, dec, "normal");
  return { ...altAz, hemisphere };
}
