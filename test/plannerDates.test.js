import assert from "node:assert/strict";
import test from "node:test";
import { getDarknessWindow, getMoonInfo, getSunTimes, parseCalendarDate } from "../src/lib/astroCalc.js";
import { dateInZone, localDayBounds, parseLocalDateTime } from "../src/lib/timezone.js";

test("keeps Sun and Moon events on the selected day near the International Date Line", () => {
  const lat = 1.87;
  const lon = -157.4;
  const zone = "Pacific/Kiritimati";
  const day = "2026-11-07";
  const date = parseCalendarDate(day, zone);
  const sun = getSunTimes(date, lat, lon, zone);
  const night = getDarknessWindow(date, lat, lon, zone);
  const moon = getMoonInfo(date, lat, lon, night.duskStart, night.dawnEnd, zone);
  assert.ok(sun.sunrise < sun.solarNoon && sun.solarNoon < sun.sunset);
  for (const event of [sun.sunrise, sun.sunset, moon.rise, moon.set, night.duskStart]) {
    assert.ok(event instanceof Date);
    assert.equal(dateInZone(event, zone), day);
  }
  assert.equal(dateInZone(night.dawnEnd, zone), "2026-11-08");
});

test("uses a 23-hour local day on spring transition and advances skipped clock times", () => {
  const zone = "America/New_York";
  const day = "2026-03-08";
  const [start, end] = localDayBounds(parseCalendarDate(day, zone), zone);
  assert.equal(end - start, 23 * 3600000);
  assert.equal(parseLocalDateTime(day, "02:30", zone).toISOString(), "2026-03-08T07:30:00.000Z");
  assert.equal(parseLocalDateTime("2026-11-01", "01:30", zone).toISOString(), "2026-11-01T05:30:00.000Z");
});
