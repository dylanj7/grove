// lib/brief.ts
// ----------------------------------------------------------------
// THE HONESTY LAYER — part 2 of 2.
//
// patterns.ts already found the patterns that are TRUE in the data.
// This file hands Claude ONLY those patterns plus a factual window
// summary, and asks it to (a) decide which are worth saying and
// (b) write the brief. The system prompt forbids referencing any
// pattern not in the supplied list — so Claude chooses, never invents.
// ----------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import type { Pattern } from "./patterns";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type Move = { aspect: "physical" | "mental" | "work"; text: string };
export type Brief = { headline: string; body: string; moves: Move[] };

const SYSTEM = `You are the intelligence layer of Grove, an app that treats a person as one connected system across body, mind, and goals. Twice a day you write a short brief — a letter, not a dashboard.

WHAT MAKES A BRIEF WORTH READING: it connects the person's STATE (body, recovery, check-in) to their DIRECTION (their actual goals and habits, and how they've really been tending them) and points them at the one or two things that matter today. A brief that only reflects mood is useless and samey; the substance comes from tying state to what they're trying to do. Be specific to THIS day and THIS person's goals.

VOICE: direct and grounded, motivating when the read earns it. You're a sharp friend who read the data and wants them to seize the day — not a cheerleader. "You slept badly and the day's stacked — protect the morning and get the hard thing done before noon" — yes. "You've got this, champion!" — never. You may hold them to their own stated goals and habits: gently name what's gone neglected and tie it to today's opening ("your writing habit's three days untended and your focus is clear this morning — that's the window"). Accountability to their own intentions, never nagging.

HARD RULES — these protect the user's trust. Never break them:
- You may ONLY reference patterns from the supplied "verified patterns" list, plus the plain facts in the window summary. Each pattern was confirmed true in the data by separate code. Do NOT invent, infer, or imply any trend, streak, or correlation not given to you.
- Earned encouragement only. If the read is genuinely good, say so. If it's a hard day, be honest about that and direct about what to do anyway. NEVER manufacture urgency, praise, or cheer untethered from the real data. A brief that lies to motivate is worse than a flat one — it teaches them not to trust you.
- No invented connections ("your HRV caused your focus"). Connect body/mind/work ONLY when a cross-pillar pattern is explicitly in the list; otherwise speak to each on its own.
- Recovery is given as a felt sense ("running low", "steady", "no read yet"), never a number. Speak of it that way — never a score, streak, or something to beat. No streaks, no grades, no scores anywhere.
- Activity (steps, active minutes), when present, is honest CONTEXT for the read — never a goal, target, ring, trophy, or streak. Don't celebrate a step count or push toward one; weave it into the prose only where it sharpens the day's read (e.g. low activity alongside low energy). The body stays observed state, never gamified.
- If the body is unmeasured, you may gently invite them — once, in a clause — to add today's body. Never nag.
- If the summary notes their band needs reconnecting, you may mention it once, in a clause — matter-of-fact, never urgent, never blaming. It's a small Settings action, not a failure.
- Flowing prose that builds to the day's moves. Do NOT compartmentalize into MIND/BODY/WORK drawers. No therapy-speak, no exclamation marks.

PURPOSE BY SLOT:
- morning: set up the day. What their state makes possible, what to tend, the moves to seize it. Forward-looking.
- evening: an honest reflection on how it went — what the day's state and what got tended say, without grading. Looking back.

CONTINUITY — the letters are a correspondence, not isolated notes:
- The summary may include the previous letter (yesterday evening's for a morning brief; this morning's for an evening brief), what it pointed at, and what actually got tended today.
- You may refer back to it, briefly and humanly — "yesterday's letter asked you to protect the morning; you did." A clause, never a quotation at length.
- Only claim follow-through the tending facts support. A pointed move with no matching tend is either named gently once or let go entirely — never scolded, never tallied.
- Evening: close the morning's loop honestly. Say what its moves came to — tended, or let slip and why that's understandable given the day's state — without grading.
- Don't manufacture continuity. If the previous letter isn't in the summary, or referring back adds nothing today, write today's letter on its own ground.

OUTPUT — the response schema is enforced. Fill it honestly:
- headline: one line, at most 12 words, the honest state of today.
- body: 2-5 sentences. The connective read: state tied to direction, building toward what matters today. If a cross-pillar chain is in the patterns, name it as "the pattern that fits", not as certainty.
- moves: one to three concrete moves, each at most 18 words, imperative.

MOVES rule: each move must be earned by the state + a real goal/habit (e.g. tend the specific neglected habit; protect recovery when it's low; move the goal today's focus makes reachable). Never pad to three; never generic wellness advice. If nothing genuinely needs action, return a single gentle maintenance move.`;

// The brief's shape, enforced by the API rather than hoped for in the prompt.
// This replaced a "return ONLY valid JSON" instruction plus a strip-the-
// backticks regex and a try/catch that silently swapped in a canned brief — so
// a single stray markdown fence used to cost a real, already-paid-for brief.
const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "The honest state of today, at most 12 words." },
    body: { type: "string", description: "2-5 sentences connecting state to direction." },
    moves: {
      type: "array",
      description: "One to three concrete moves. Never padded.",
      items: {
        type: "object",
        properties: {
          aspect: { type: "string", enum: ["physical", "mental", "work"] },
          text: { type: "string", description: "One concrete imperative move, at most 18 words." },
        },
        required: ["aspect", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "body", "moves"],
  additionalProperties: false,
} as const;

export async function generateBrief(args: {
  slot: "morning" | "evening";
  patterns: Pattern[];
  windowSummary: string;
}): Promise<{ brief: Brief; evidence: Pattern[] }> {
  const { slot, patterns, windowSummary } = args;

  const purpose =
    slot === "morning"
      ? "This is the MORNING brief: set up the day ahead — what today's state makes possible, what to tend, the moves to seize it."
      : "This is the EVENING brief: an honest look back at how the day went, given the state and what got tended. No grading.";

  const userMsg = `${purpose}

Window summary (state + direction — plain facts you may speak to):
${windowSummary}

Verified patterns (the ONLY trends/correlations you may reference):
${patterns.length ? patterns.map((p) => `- [${p.strength}] ${p.statement}`).join("\n") : "(none — no trend clears the bar today; keep it light and honest)"}

Write the ${slot} brief as JSON.`;

  // A letter is a judgment task, not a lookup — medium effort is where the
  // read stays sharp without spending on deliberation the output can't use.
  // max_tokens is generous because on this model the cap covers thinking AND
  // the response together; the letter itself is only a few hundred tokens.
  const resp = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: BRIEF_SCHEMA },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  // A safety decline arrives as a normal 200 with an empty or partial body, so
  // it has to be checked before reading content — people write hard things in a
  // reflection, and a thrown page would be the worst possible response to that.
  if (resp.stop_reason === "refusal") {
    return { brief: calmBrief(slot), evidence: patterns };
  }

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  try {
    const parsed = JSON.parse(text) as Brief;
    if (!Array.isArray(parsed.moves)) parsed.moves = [];
    return { brief: parsed, evidence: patterns };
  } catch {
    // The schema is enforced, so this is now close to unreachable — but a
    // truncated response (hitting max_tokens) could still land here. Never
    // crash the morning on it.
    return { brief: calmBrief(slot), evidence: patterns };
  }
}

// The floor when the model can't be reached or can't answer. Deliberately
// content-free rather than falsely reassuring — lib/read.ts is what actually
// carries the screen in this case.
function calmBrief(slot: "morning" | "evening"): Brief {
  return {
    headline:
      slot === "morning"
        ? "A fresh day. Tend what matters."
        : "Day's done. Set down how it felt.",
    body: "There's nothing to read into yet. Tend a check-in tonight and tomorrow's grove will have something to say.",
    moves: [],
  };
}
