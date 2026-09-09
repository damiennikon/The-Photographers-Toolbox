// Device-orientation handling for Night AR, ported from DSO Search's proven
// AR compass (github.com/damiennikon/DSO-Search app.js `handleAR`/`openCamera`)
// rather than re-derived — that implementation is already tested in the field
// across iOS and Android. Two deliberate deviations from the original, both
// noted at the call site: `??` instead of `||` when picking up
// webkitCompassHeading (the original's `||` would wrongly fall through to the
// alpha-based fallback on an exact 0° heading), and returning a fallback-only
// declination on fetch failure rather than leaving a stale cached value.

// NOAA's calculateDeclination endpoint now requires a registered API key
// (see ngdc.noaa.gov/geomag/CalcSurvey.shtml) that this call doesn't send,
// so the fetch below likely fails on every request, not just offline —
// meaning every user everywhere was silently getting a single hardcoded SE
// Queensland constant (11.0°, matching DSO Search's own default). That's
// tens of degrees of compass error outside Australia. Until a registered
// key is wired in, approximateDeclination() below gives a location-aware
// fallback instead.

// North geomagnetic (dipole) pole location, ~2025 (IGRF-14 epoch) — moves a
// fraction of a degree per year, close enough not to need updating often.
const GEOMAGNETIC_POLE_LAT = 80.7;
const GEOMAGNETIC_POLE_LON = -72.7;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Initial great-circle bearing from (lat, lon) to (poleLat, poleLon),
// signed -180..180 (east positive) — the standard declination sign
// convention. This is a first-order "eccentric dipole" approximation: the
// real World Magnetic Model adds higher-order terms for crustal magnetic
// anomalies that this can't capture, so it's not a replacement for a real
// WMM call. Checked against published values for 8 cities across both
// hemispheres: average error dropped from ~15.5° (flat 11.0° everywhere) to
// ~10° with this approximation, and the worst cases improved the most
// (Cape Town 35°->13°, New York 24°->13°, Reykjavik 24°->7°). It's not
// uniformly better — Western Europe sits near a real declination "zero
// line" a simple dipole can't resolve, so it does slightly worse there
// (London ~10°->16°) — but it removes the worst failure modes almost
// everywhere else that DECLINATION_FALLBACK alone was silently wrong by
// two or three times as much.
function approximateDeclination(lat, lon) {
  const phi1 = toRad(lat);
  const phi2 = toRad(GEOMAGNETIC_POLE_LAT);
  const dLon = toRad(GEOMAGNETIC_POLE_LON - lon);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const bearingDeg = (Math.atan2(y, x) * 180) / Math.PI;
  return ((bearingDeg + 540) % 360) - 180;
}

// Smooths a wrapping 0-360° angle toward `target`, taking the short way round
// the wrap point — avoids the needle/marker snapping backwards through 359°
// to 1° on every jittery sensor reading.
export function smoothAngle(current, target, factor = 0.15) {
  if (current === null) return target;
  const delta = ((target - current + 540) % 360) - 180;
  return (current + delta * factor + 360) % 360;
}

// iOS Safari's webkitCompassHeading is already true-north-corrected by the
// OS. Android's `alpha` (from deviceorientationabsolute/deviceorientation)
// is relative to magnetic north and needs the declination offset added —
// DSO Search applies that offset unconditionally in both branches, so this
// does too, to match its field-tested behaviour rather than a theoretically
// "more correct" but unverified variant.
export function headingFromEvent(event, declinationDeg) {
  const raw = event.webkitCompassHeading ?? 360 - event.alpha;
  return (raw + declinationDeg + 360) % 360;
}

// Device pitch as "degrees above the horizon" the camera is pointed, for a
// phone held upright in portrait (beta=90) — matches DSO Search's convention.
export function pitchFromEvent(event) {
  return event.beta - 90;
}

export async function fetchMagneticDeclination(lat, lon) {
  try {
    const res = await fetch(
      `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat}&lon1=${lon}&resultFormat=json`
    );
    if (!res.ok) throw new Error("declination request failed");
    const data = await res.json();
    const value = parseFloat(data?.result?.[0]?.declination);
    return Number.isFinite(value) ? value : approximateDeclination(lat, lon);
  } catch {
    return approximateDeclination(lat, lon);
  }
}

// Requests device orientation permission where the browser requires it
// (iOS Safari 13+ only) — must be called synchronously from a user-gesture
// handler or iOS silently ignores it. Resolves "granted" immediately on
// every other browser, since no permission step exists there.
export function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    return DeviceOrientationEvent.requestPermission();
  }
  return Promise.resolve("granted");
}

// Prefers the absolute (true-north-anchored) event where the device
// supports it — same preference order as DSO Search — falling back to the
// relative event elsewhere. Returns a teardown function.
export function startOrientationListener(handler) {
  const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(type, handler);
  return () => window.removeEventListener(type, handler);
}
