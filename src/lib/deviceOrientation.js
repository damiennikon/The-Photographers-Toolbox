// Device-orientation handling for Night AR, ported from DSO Search's proven
// AR compass (github.com/damiennikon/DSO-Search app.js `handleAR`/`openCamera`)
// rather than re-derived — that implementation is already tested in the field
// across iOS and Android. Two deliberate deviations from the original, both
// noted at the call site: `??` instead of `||` when picking up
// webkitCompassHeading (the original's `||` would wrongly fall through to the
// alpha-based fallback on an exact 0° heading), and returning a fallback-only
// declination on fetch failure rather than leaving a stale cached value.

const DECLINATION_FALLBACK = 11.0; // matches DSO Search's SE Queensland default

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
    return Number.isFinite(value) ? value : DECLINATION_FALLBACK;
  } catch {
    return DECLINATION_FALLBACK;
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
