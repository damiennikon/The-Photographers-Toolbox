// "Night AR" — camera overlay pointing toward the Milky Way core's live
// position. Radar-style dot/arrow logic and proximity thresholds (0.8°/5°)
// are ported from DSO Search's `handleAR` (github.com/damiennikon/DSO-Search
// app.js) rather than re-derived — reuses the same field-tested approach,
// adapted to this app's mount/render pattern (see placeholderModal.js).
import { icon } from "../icons.js";
import { getGalacticCoreAltAz } from "../lib/astroCalc.js";
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

let root = null;
let stream = null;
let stopOrientation = null;
let wakeLock = null;
let ephemerisTimer = null;
let smoothedHeading = null;
let declination = DECLINATION_FALLBACK;
let targetAltAz = { altitude: -90, azimuth: 0 };
let location = null;

function render() {
  return `
    <div class="pt-ar-overlay" data-ar-overlay style="display:none">
      <video class="pt-ar-video" data-ar-video autoplay playsinline muted></video>
      <div class="pt-ar-hud-top">
        <button class="pt-ar-back" data-ar-back type="button" aria-label="Close Night AR">
          ${icon("arrowLeft")}<span>Back</span>
        </button>
        <div class="pt-ar-title">Milky Way Core</div>
        <div class="pt-ar-hud-spacer"></div>
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
}

function setStatus(text) {
  const el = root?.querySelector("[data-ar-status]");
  if (el) el.textContent = text;
}

function updateTargetPosition() {
  if (!location) return;
  targetAltAz = getGalacticCoreAltAz(new Date(), location.lat, location.lon);
}

function handleOrientation(event) {
  if (event.alpha == null || event.beta == null) return;

  const rawHeading = headingFromEvent(event, declination);
  smoothedHeading = smoothAngle(smoothedHeading, rawHeading);
  const pitch = pitchFromEvent(event);

  const dot = root.querySelector("[data-ar-dot]");
  const arrow = root.querySelector("[data-ar-arrow]");

  if (targetAltAz.altitude < 0) {
    dot.style.display = "none";
    arrow.style.display = "none";
    setStatus("Core is below the horizon right now.");
    return;
  }
  setStatus("");

  const deltaAz = ((targetAltAz.azimuth - smoothedHeading + 540) % 360) - 180;
  const deltaAlt = targetAltAz.altitude - pitch;
  const distance = Math.hypot(deltaAz, deltaAlt);

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
  stopCamera();
  releaseWakeLock();
  smoothedHeading = null;
  if (root) root.querySelector("[data-ar-overlay]").style.display = "none";
}
