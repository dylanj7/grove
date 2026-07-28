// lib/read.ts
// ----------------------------------------------------------------
// THE FLOOR.
//
// Grove used to have exactly one thing to say, and it came from Claude. That
// created two problems that between them made the app unusable:
//
//   1. THE GATE. No check-in meant no brief, so the front door was a form.
//      You opened Grove and it asked you for work before it gave you anything.
//   2. THE WAIT. A brief that wasn't cached meant a multi-second model call
//      inside the render, so the first paint of the app's main screen was
//      hostage to an LLM.
//
// This file is the answer to both: a PURE, deterministic read of the same
// window the brief sees, computed in microseconds, that is always true and
// always says something. It is the floor Grove can never fall below.
//
// The letter (lib/brief.ts) is now the CEILING, not the floor — it streams in
// on top of this when it's ready. If it never arrives, the screen is still
// honest and still useful. Nothing here is invented: every sentence is a direct
// restatement of a stored number or a pattern that patterns.ts already verified.
// Same discipline as recovery.ts — no interpretation the data doesn't carry.
// ----------------------------------------------------------------

import type { Pattern, PhysicalDay, Checkin } from "./patterns";
import type { WindowData } from "./window";
import { recoveryBand } from "./recovery";
import { minutesToHours } from "./physical";
import type { Slot } from "./slot";

export type Read = {
  /** The honest state of now, in a few words. Sentence case, no period. */
  headline: string;
  /** One supporting sentence. May be empty when the headline stands alone. */
  line: string;
};

// The newest row that actually carries a body metric. A same-day partial (a
// band writes steps all day, but the night's sleep lands next morning) must not
// shadow last night's full reading — the same rule windowSummary uses.
export function latestBody(physical: PhysicalDay[]): PhysicalDay | null {
  return (
    physical.find(
      (d) =>
        d.sleep_minutes != null ||
        d.sleep_efficiency != null ||
        d.resting_hr != null ||
        d.hrv_ms != null,
    ) ?? null
  );
}

/** The compact body strip: what was measured, as plain facts. Never a score. */
export function bodyFacts(physical: PhysicalDay[]): { label: string; value: string }[] {
  const p = latestBody(physical);
  const latest = physical[0];
  const facts: { label: string; value: string }[] = [];
  if (!p && !latest) return facts;

  const hours = minutesToHours(p?.sleep_minutes ?? null);
  if (hours != null) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    facts.push({ label: "Slept", value: m ? `${h}h ${m}m` : `${h}h` });
  }
  if (p?.sleep_efficiency != null) {
    facts.push({ label: "Efficiency", value: `${Math.round(p.sleep_efficiency)}%` });
  }
  if (p?.resting_hr != null) {
    facts.push({ label: "Resting HR", value: `${Math.round(p.resting_hr)}` });
  }
  if (p?.hrv_ms != null) {
    facts.push({ label: "HRV", value: `${Math.round(p.hrv_ms)}ms` });
  }
  if (latest?.steps != null) {
    facts.push({ label: "Steps", value: Math.round(latest.steps).toLocaleString("en-US") });
  }
  return facts;
}

const MOOD = ["", "heavy", "low", "even", "light", "bright"];
const ENERGY = ["", "drained", "low", "steady", "full", "brimming"];
const FOCUS = ["", "scattered", "foggy", "okay", "clear", "sharp"];

/** A check-in as felt words. The 1–5 is an internal signal, never shown. */
export function feltWords(c: Checkin): string[] {
  const out: string[] = [];
  if (c.mood != null) out.push(MOOD[c.mood] ?? "even");
  if (c.energy != null) out.push(ENERGY[c.energy] ?? "steady");
  if (c.focus != null) out.push(FOCUS[c.focus] ?? "okay");
  return out;
}

// The patterns worth leading with, most-load-bearing first. A cross-pillar
// chain is the whole reason Grove exists, so it outranks any single-pillar dip.
const LEAD_ORDER = [
  "recovery_to_execution_chain",
  "recovery_to_mind",
  "low_recovery_streak",
  "sleep_dip",
  "hrv_suppressed",
  "energy_low",
  "focus_scattered",
  "movement_low",
  "habit_neglected",
  "milestone_stalled",
  "movement_steady",
];

function leadPattern(patterns: Pattern[]): Pattern | null {
  for (const code of LEAD_ORDER) {
    const hit = patterns.find((p) => p.code === code && p.strength !== "weak");
    if (hit) return hit;
  }
  return null;
}

/**
 * The read. Pure: same window in, same words out — no clock, no randomness, no
 * model. Priority is "what is most true right now", in this order:
 *
 *   1. A verified cross-pillar or strong single-pillar pattern.
 *   2. Last night's body, spoken as a felt sense.
 *   3. How they said they felt.
 *   4. An honest invitation — never a wall.
 */
export function deterministicRead(args: {
  slot: Slot;
  localDay: string;
  win: WindowData;
  patterns: Pattern[];
  hasCheckin: boolean;
}): Read {
  const { slot, localDay, win, patterns, hasCheckin } = args;
  const isMorning = slot === "morning";
  const body = latestBody(win.physical);
  const todaysCheckin = win.checkins.find((c) => c.day === localDay && c.slot === slot);
  const recovery = recoveryBand(body?.recovery_score ?? null);
  const lead = leadPattern(patterns);

  // --- 1. A verified pattern leads, when one is strong enough to matter. ---
  if (lead) {
    const headline = (() => {
      switch (lead.code) {
        case "recovery_to_execution_chain":
          return "Body, mind, and follow-through are moving together";
        case "recovery_to_mind":
          return "Recovery and focus are tracking each other";
        case "low_recovery_streak":
          return "Recovery has been low for a stretch";
        case "sleep_dip":
          return isMorning ? "Sleep has run short" : "A short-sleep stretch";
        case "hrv_suppressed":
          return "Your body is carrying load";
        case "energy_low":
          return "Energy has been low";
        case "focus_scattered":
          return "Focus has been scattered";
        case "movement_low":
          return "Movement has gone quiet";
        case "movement_steady":
          return "Movement has held steady";
        default:
          return isMorning ? "Something's gone untended" : "Something slipped today";
      }
    })();
    return { headline, line: lead.statement };
  }

  // --- 2. The body, spoken as a sense. ---
  if (body) {
    const hours = minutesToHours(body.sleep_minutes);
    const sleepPart =
      hours != null
        ? `${hours}h of sleep`
        : body.resting_hr != null
          ? `a resting heart rate of ${Math.round(body.resting_hr)}`
          : null;

    const headline = (() => {
      switch (recovery) {
        case "well recovered":
          return isMorning ? "You're well recovered" : "The day sat on solid ground";
        case "steady":
          return isMorning ? "Steady ground this morning" : "A steady day, by the body";
        case "a little low":
          return isMorning ? "Running a little low" : "The body ran a little low";
        case "running low":
          return isMorning ? "Running low — go gently" : "The body ran low today";
        default:
          return isMorning ? "A fresh day" : "The day winds down";
      }
    })();

    const line = sleepPart
      ? isMorning
        ? `${sleepPart[0].toUpperCase()}${sleepPart.slice(1)} behind you, and recovery reads ${recovery}.`
        : `Recovery read ${recovery} today, on ${sleepPart}.`
      : `Recovery reads ${recovery}.`;

    return { headline, line };
  }

  // --- 3. How they said they felt. ---
  const recentCheckin = todaysCheckin ?? win.checkins[0];
  if (recentCheckin) {
    const words = feltWords(recentCheckin);
    if (words.length) {
      const when = todaysCheckin ? (isMorning ? "This morning" : "Tonight") : "Last time";
      return {
        headline: isMorning ? "In your own words" : "How the day landed",
        line: `${when} you read ${words.join(", ")}.`,
      };
    }
  }

  // --- 4. The honest invitation. Never a wall. ---
  if (!hasCheckin) {
    return {
      headline: isMorning ? "A fresh day" : "The day winds down",
      line: isMorning
        ? "Nothing measured yet. Say a line about how you're heading in and Grove has something to work with."
        : "Nothing set down yet. A line about today is enough to start the read.",
    };
  }

  return {
    headline: isMorning ? "A fresh day" : "The day winds down",
    line: "Grove is still learning your shape. A few more days and the patterns start to show.",
  };
}
