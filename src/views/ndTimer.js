import { fieldToolPage } from "../components/fieldTools.js";

function exposureSeconds(value) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/);
  return match ? Number(match[1]) / Number(match[2] || 1) : NaN;
}

function formatExposure(seconds) {
  if (seconds < 1) return `${Number(seconds.toPrecision(3))} s`;
  if (seconds < 60) return `${Number(seconds.toFixed(2))} s`;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  return [hours ? `${hours} h` : "", minutes ? `${minutes} min` : "", `${total % 60} s`].filter(Boolean).join(" ");
}

export function renderNdTimer(container) {
  container.innerHTML = fieldToolPage("nd-timer", `
    <section class="pt-card pt-field-stack">
      <h2>ND filter exposure</h2>
      <p>Meter a test shot without the filter, then enter that shutter speed and the total filter strength.</p>
      <div class="pt-field-columns">
        <label>Base shutter speed (seconds)<input data-base value="1/125" placeholder="1/125 or 2.5" maxlength="20"></label>
        <label>Filter strength (stops)<input data-stops type="number" min="0" max="20" step="any" value="10" inputmode="decimal"></label>
      </div>
      <div class="pt-field-actions" aria-label="Common filter strengths">
        ${[3, 6, 10, 15].map((stops) => `<button class="pt-field-btn" data-preset="${stops}" type="button">${stops} stops</button>`).join("")}
      </div>
      <p data-exposure class="pt-field-result" role="status"></p>
    </section>
    <section class="pt-card pt-field-stack">
      <h3>Exposure timer</h3>
      <p class="pt-field-result" data-countdown role="timer" aria-label="Time remaining">—</p>
      <div class="pt-field-actions">
        <button class="pt-field-btn pt-field-primary" type="button" data-start>Start timer</button>
        <button class="pt-field-btn" type="button" data-reset disabled>Reset</button>
      </div>
      <p data-timer-status role="status">Keep this screen open for the completion tone.</p>
    </section>`);

  const base = container.querySelector("[data-base]");
  const stops = container.querySelector("[data-stops]");
  const exposure = container.querySelector("[data-exposure]");
  const countdown = container.querySelector("[data-countdown]");
  const start = container.querySelector("[data-start]");
  const reset = container.querySelector("[data-reset]");
  const status = container.querySelector("[data-timer-status]");
  let calculated = 0;
  let remaining = 0;
  let deadline = null;
  let interval = null;
  let audio;

  function updateButtons() {
    start.disabled = deadline === null && remaining <= 0 && (!calculated || calculated > 86400);
    start.textContent = deadline !== null ? "Pause" : remaining > 0 ? "Resume" : "Start timer";
    reset.disabled = deadline === null && remaining === 0 && countdown.textContent === "—";
  }

  function updateExposure() {
    const seconds = exposureSeconds(base.value);
    const strength = stops.valueAsNumber;
    const valid = seconds > 0 && seconds <= 3600 && strength >= 0 && strength <= 20;
    calculated = valid ? seconds * 2 ** strength : 0;
    exposure.textContent = valid ? formatExposure(calculated) : "Enter a shutter speed up to 3,600 seconds and 0–20 stops.";
    if (calculated > 86400) exposure.textContent += " · Timer limit is 24 hours.";
    updateButtons();
  }

  function stopInterval() {
    deadline = null;
    clearInterval(interval);
  }

  function playTone() {
    if (audio?.state !== "running") return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.45);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.45);
  }

  function tick() {
    if (deadline === null) return;
    remaining = Math.max(0, deadline - Date.now());
    countdown.textContent = formatExposure(Math.ceil(remaining / 100) / 10);
    if (remaining > 0) return;
    stopInterval();
    status.textContent = "Exposure complete.";
    playTone();
    updateButtons();
  }

  start.addEventListener("click", () => {
    if (deadline !== null) {
      tick();
      if (deadline !== null) {
        stopInterval();
        status.textContent = "Paused.";
      }
      updateButtons();
      return;
    }
    try {
      audio ||= new AudioContext();
      audio.resume().catch(() => {});
    } catch {
      // The visual timer also works when audio is unavailable.
    }
    remaining ||= calculated * 1000;
    deadline = Date.now() + remaining;
    status.textContent = "Exposure running.";
    interval = setInterval(tick, 50);
    tick();
    updateButtons();
  });
  reset.addEventListener("click", () => {
    stopInterval();
    remaining = 0;
    countdown.textContent = "—";
    status.textContent = "Timer reset.";
    updateButtons();
  });
  for (const field of [base, stops]) field.addEventListener("input", updateExposure);
  container.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      stops.value = button.dataset.preset;
      updateExposure();
    });
  });
  document.addEventListener("visibilitychange", tick);
  updateExposure();
  return () => {
    stopInterval();
    document.removeEventListener("visibilitychange", tick);
    audio?.close().catch(() => {});
  };
}
