import test from "node:test";
import assert from "node:assert/strict";
import {
  addLocalCalendarDays,
  formatTimeInZone,
  getTimeZone,
  parseLocalDateTime,
} from "../src/lib/timezone.js";

test("looks up the default Queensland location", () => {
  assert.equal(getTimeZone(-27.6954, 153.1185), "Australia/Brisbane");
});

test("converts a selected local time to the correct instant", () => {
  const londonNoon = parseLocalDateTime("2026-11-07", "12:00", "Europe/London");
  const newYorkNoon = parseLocalDateTime("2026-07-01", "12:00", "America/New_York");

  assert.equal(londonNoon.toISOString(), "2026-11-07T12:00:00.000Z");
  assert.equal(newYorkNoon.toISOString(), "2026-07-01T16:00:00.000Z");
});

test("adds calendar days across daylight-saving changes", () => {
  const beforeTransition = parseLocalDateTime("2026-03-07", "12:00", "America/New_York");
  const nextLocalDay = addLocalCalendarDays(beforeTransition, 1, "America/New_York");

  assert.equal(nextLocalDay.toISOString(), "2026-03-08T16:00:00.000Z");
  assert.equal(formatTimeInZone(nextLocalDay, "America/New_York"), "12:00");
});

