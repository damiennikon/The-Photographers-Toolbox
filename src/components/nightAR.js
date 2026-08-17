// "Night AR" — camera overlay pointing toward the Milky Way core's live
// position. Radar-style dot/arrow logic and proximity thresholds (0.8°/5°)
// are ported from DSO Search's `handleAR` (github.com/damiennikon/DSO-Search
// app.js) rather than re-derived — reuses the same field-tested approach,
// adapted to this app's mount/render pattern (see placeholderModal.js).
import { icon } from "../icons.js";
import { getGalacticCoreAltAz, getGalacticPlaneTiltDeg } from "../lib/astroCalc.js";
import {
  smoothAngle,
  headingFromEvent,
  pitchFromEvent,
  fetchMagneticDeclination,
  requestOrientationPermission,
  startOrientationListener,
} from "../lib/deviceOrientation.js";

// Recomputing the core's alt/az every frame is unnecessary — the sky barely
// moves over a couple of seconds, only the device orientation reading needs
// to track in near-real-time.
const EPHEMERIS_REFRESH_MS = 2000;
const CLOSE_THRESHOLD_DEG = 0.8;
const NEAR_THRESHOLD_DEG = 5;
const DECLINATION_FALLBACK = 11.0;

// The band texture's own diagonal isn't horizontal — measured from the
// source file (public/assets/night-ar/milky-way-band.png) by fitting a line
// through the alpha-weighted centroid of each column: ~29.2° clockwise from
// horizontal (screen/CSS convention). Rotating the element by
// (calculatedSkyAngle - BAND_IMAGE_BAKED_IN_ANGLE_DEG) cancels that baked-in
// tilt out before applying the real one.
const BAND_IMAGE_BAKED_IN_ANGLE_DEG = 29.2;
// Where the bright core sits within the image, as a fraction of width/height
// — measured as the alpha- and brightness-weighted centroid of the
// brightest 0.5% of pixels. Used as the rotation pivot and screen anchor.
const BAND_IMAGE_ANCHOR_X_FRAC = 0.5;
const BAND_IMAGE_ANCHOR_Y_FRAC = 0.6;
// No attempt at matching a real camera's field of view (out of scope for
// this pass) — this is just a fixed assumption used to turn the already-
// calculated deltaAz/deltaAlt into a screen-pixel offset for the band's
// anchor point, tuned to look reasonable on a typical phone screen.
const BAND_ASSUMED_FOV_DEG = 60;
const BAND_IMAGE_URL = `${import.meta.env.BASE_URL}assets/night-ar/milky-way-band.png`;

let root = null;
let stream = null;
let stopOrientation = null;
let wakeLock = null;
let ephemerisTimer = null;
let smoothedHeading = null;
let declination = DECLINATION_FALLBACK;
let targetAltAz = { altitude: -90, azimuth: 0 };
let planeTiltDeg = 0;
let location = null;
let bandEnabled = true;

function render() {
  return `
    <div class="pt-ar-overlay" data-ar-overlay style="display:none">
      <video class="pt-ar-video" data-ar-video autoplay playsinline muted></video>
      <img class="pt-ar-band" data-ar-band src="${BAND_IMAGE_URL}" alt="" />
      <div class="pt-ar-hud-top">
        <button class="pt-ar-back" data-ar-back type="button" aria-label="Close Night AR">
          ${icon("arrowLeft")}<span>Back</span>
        </button>
        <div class="pt-ar-title">Milky Way Core</div>
        <button class="pt-ar-band-toggle" data-ar-band-toggle type="button" aria-pressed="true">Band</button>
      </div>
      <div class="pt-ar-reticle"></div>
      <div class="pt-ar-target-dot" data-ar-dot></div>
      <div class="pt-ar-arrow" data-ar-arrow>${icon("arrowUp")}</div>
      <div class="pt-ar-status" data-ar-status></div>
    </div>`;
}

function ensureMounted() {
  if (root) return;
  root = document.createElement("div");
  root.innerHTML = render();
  document.body.appendChild(root);
  root.querySelector("[data-ar-back]").addEventListener("click", closeNightAR);
  root.querySelector("[data-ar-band-toggle]").addEventListener("click", toggleBand);
}

function toggleBand() {
  bandEnabled = !bandEnabled;
  const toggle = root.querySelector("[data-ar-band-toggle]");
  toggle.setAttribute("aria-pressed", String(bandEnabled));
  toggle.classList.toggle("pt-ar-band-toggle--off", !bandEnabled);
  if (!bandEnabled) root.querySelector("[data-ar-band]").style.display = "none";
}

function setStatus(text) {
  const el = root?.querySelector("[data-ar-status]");
  if (el) el.textContent = text;
}

function updateTargetPosition() {
  if (!location) return;
  const now = new Date();
  targetAltAz = getGalacticCoreAltAz(now, location.lat, location.lon);
  planeTiltDeg = getGalacticPlaneTiltDeg(now, location.lat, location.lon);
}

// Cached rendered size of the band image (its CSS width is a fixed vmin
// value plus a fixed aspect-ratio, so this only changes on resize/rotation,
// not every orientation event) — avoids forcing a layout reflow on every
// handleOrientation call, which can fire at high frequency.
let bandDims = null;

function measureBand() {
  const band = root?.querySelector("[data-ar-band]");
  if (!band) return;
  // offsetWidth/offsetHeight (not getBoundingClientRect) — the latter
  // returns the post-rotation bounding box once a transform is applied,
  // which would corrupt this on a resize/orientation-change mid-session.
  // Briefly force display:block to measure, since it defaults to none and
  // offsetWidth/Height are 0 for a non-rendered element — reverted before
  // this synchronous function returns, so nothing paints in between.
  const prevDisplay = band.style.display;
  band.style.display = "block";
  const { offsetWidth, offsetHeight } = band;
  if (offsetWidth > 0 && offsetHeight > 0) bandDims = { width: offsetWidth, height: offsetHeight };
  band.style.display = prevDisplay;
}

// Positions the band so the anchor point measured on the source image
// (BAND_IMAGE_ANCHOR_X/Y_FRAC, near the bright core) lands at the same
// screen point the core marker's own deltaAz/deltaAlt tracking already
// resolves to, then rotates the image around that same point so its
// baked-in diagonal (BAND_IMAGE_BAKED_IN_ANGLE_DEG) is replaced by the
// real, calculated sky tilt (planeTiltDeg).
function updateBandPosition(deltaAz, deltaAlt) {
  const band = root.querySelector("[data-ar-band]");
  if (!bandEnabled) {
    band.style.display = "none";
    return;
  }
  if (!bandDims) measureBand();
  if (!bandDims) return;
  band.style.display = "block";

  const pxPerDeg = window.innerWidth / BAND_ASSUMED_FOV_DEG;
  const anchorScreenX = window.innerWidth / 2 + deltaAz * pxPerDeg;
  const anchorScreenY = window.innerHeight / 2 - deltaAlt * pxPerDeg;

  band.style.left = `${anchorScreenX - bandDims.width * BAND_IMAGE_ANCHOR_X_FRAC}px`;
  band.style.top = `${anchorScreenY - bandDims.height * BAND_IMAGE_ANCHOR_Y_FRAC}px`;
  band.style.transformOrigin = `${BAND_IMAGE_ANCHOR_X_FRAC * 100}% ${BAND_IMAGE_ANCHOR_Y_FRAC * 100}%`;
  band.style.transform = `rotate(${planeTiltDeg - BAND_IMAGE_BAKED_IN_ANGLE_DEG}deg)`;
}

function handleOrientation(event) {
  if (event.alpha == null || event.beta == null) return;

  const rawHeading = headingFromEvent(event, declination);
  smoothedHeading = smoothAngle(smoothedHeading, rawHeading);
  const pitch = pitchFromEvent(event);

  const dot = root.querySelector("[data-ar-dot]");
  const arrow = root.querySelector("[data-ar-arrow]");
  const band = root.querySelector("[data-ar-band]");

  if (targetAltAz.altitude < 0) {
    dot.style.display = "none";
    arrow.style.display = "none";
    band.style.display = "none";
    setStatus("Core is below the horizon right now.");
    return;
  }
  setStatus("");

  const deltaAz = ((targetAltAz.azimuth - smoothedHeading + 540) % 360) - 180;
  const deltaAlt = targetAltAz.altitude - pitch;
  const distance = Math.hypot(deltaAz, deltaAlt);

  updateBandPosition(deltaAz, deltaAlt);

  if (distance < NEAR_THRESHOLD_DEG) {
    arrow.style.display = "none";
    dot.style.display = "block";
    dot.classList.toggle("pt-ar-target-dot--close", distance < CLOSE_THRESHOLD_DEG);
  } else {
    dot.style.display = "none";
    arrow.style.display = "block";
    const angleDeg = Math.atan2(deltaAz, deltaAlt) * (180 / Math.PI);
    arrow.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg) translateY(-90px)`;
  }
}

async function requestWakeLockSafe() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    // non-fatal — AR still works, the screen may just dim/sleep during use
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  const video = root?.querySelector("[data-ar-video]");
  if (video) video.srcObject = null;
}

export async function openNightAR(currentLocation) {
  ensureMounted();
  location = currentLocation;
  smoothedHeading = null;
  declination = DECLINATION_FALLBACK;

  const overlay = root.querySelector("[data-ar-overlay]");
  const dot = root.querySelector("[data-ar-dot]");
  const arrow = root.querySelector("[data-ar-arrow]");
  dot.style.display = "none";
  arrow.style.display = "none";
  overlay.style.display = "block";
  bandDims = null;
  measureBand();
  window.addEventListener("resize", measureBand);
  setStatus("Requesting camera…");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Camera access isn't available in this browser.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch {
    setStatus("Camera access denied — Night AR needs your camera to work. Tap Back and try again.");
    return;
  }
  root.querySelector("[data-ar-video]").srcObject = stream;
  setStatus("Requesting motion & orientation access…");

  let permission;
  try {
    permission = await requestOrientationPermission();
  } catch {
    permission = "denied";
  }
  if (permission !== "granted") {
    setStatus("Motion & orientation access denied — Night AR needs this to point you toward the core. Tap Back, then allow motion access when your browser asks.");
    stopCamera();
    return;
  }
  setStatus("");

  fetchMagneticDeclination(location.lat, location.lon).then((value) => {
    declination = value;
  });

  updateTargetPosition();
  ephemerisTimer = setInterval(updateTargetPosition, EPHEMERIS_REFRESH_MS);
  stopOrientation = startOrientationListener(handleOrientation);
  requestWakeLockSafe();
}

export function closeNightAR() {
  if (ephemerisTimer) {
    clearInterval(ephemerisTimer);
    ephemerisTimer = null;
  }
  if (stopOrientation) {
    stopOrientation();
    stopOrientation = null;
  }
  window.removeEventListener("resize", measureBand);
  stopCamera();
  releaseWakeLock();
  smoothedHeading = null;
  if (root) root.querySelector("[data-ar-overlay]").style.display = "none";
}
