import { describe, expect, it } from "vitest";
import { daysBetween, isValidDay, rangesOverlap, todayUtc } from "../convex/lib/dates";

describe("date helpers", () => {
  it("validates calendar days", () => {
    expect(isValidDay("2026-11-09")).toBe(true);
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("09/11/2026")).toBe(false);
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-11-01", "2026-11-09")).toBe(8);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("detects overlapping inclusive ranges", () => {
    expect(rangesOverlap("2026-11-01", "2026-11-05", "2026-11-05", "2026-11-07")).toBe(true);
    expect(rangesOverlap("2026-11-01", "2026-11-04", "2026-11-05", "2026-11-07")).toBe(false);
  });

  it("uses UTC for today", () => {
    expect(todayUtc(Date.UTC(2026, 10, 9, 23, 59))).toBe("2026-11-09");
  });
});
