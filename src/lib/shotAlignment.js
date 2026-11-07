import { Body, Equator, Horizon, Observer } from "astronomy-engine";
import { localDayBounds } from "./timezone.js";

const RAD = Math.PI / 180;
const STEP = 2 * 60000;
const ALIGNMENT_TOLERANCE = 0.05;

export function signedAngle(angle) {
  return ((angle % 360 + 540) % 360) - 180;
}

export function landmarkBearing(origin, landmark) {
  const a = origin.lat * RAD;
  const b = landmark.lat * RAD;
  const delta = signedAngle(landmark.lon - origin.lon) * RAD;
  const x = Math.sin(delta) * Math.cos(b);
  const y = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta);
  if (Math.hypot(x, y) < 1e-9) return null;
  return (Math.atan2(x, y) / RAD + 360) % 360;
}

export function findAlignments(date, location, bearing, body) {
  const observer = new Observer(location.lat, location.lon, 0);
  const target = body === "moon" ? Body.Moon : Body.Sun;
  const [start, end] = localDayBounds(date, location.timeZone).map((time) => time.getTime());
  const results = [];

  function position(ms) {
    const time = new Date(ms);
    const equatorial = Equator(target, time, observer, true, true);
    const { azimuth, altitude } = Horizon(time, observer, equatorial.ra, equatorial.dec, "normal");
    return { time, altitude, error: signedAngle(azimuth - bearing) };
  }

  let left = start;
  let earlier = position(left);
  while (left < end) {
    const right = Math.min(left + STEP, end);
    const later = position(right);
    // Ignore the sign flip at the opposite bearing.
    if (Math.abs(earlier.error - later.error) < 180 && earlier.error * later.error <= 0) {
      let lo = left;
      let hi = right;
      while (hi - lo > 100) {
        const middle = Math.floor((lo + hi) / 2);
        if (Math.sign(position(middle).error) === Math.sign(earlier.error)) lo = middle;
        else hi = middle;
      }
      const hit = [position(lo), position(hi)].sort((a, b) => Math.abs(a.error) - Math.abs(b.error))[0];
      if (hit.time.getTime() < end && hit.altitude >= 0 && Math.abs(hit.error) <= ALIGNMENT_TOLERANCE &&
          !results.some((entry) => Math.abs(entry.time - hit.time) < 1000)) {
        results.push(hit);
      }
    }
    left = right;
    earlier = later;
  }
  return results;
}
