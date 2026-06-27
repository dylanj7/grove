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

const SYSTEM = `You are the intelligence layer of Grove, an app that treats a person as one connected system across body, mind, and goals. Once or twice a day you write a short brief.

HARD RULES — these protect the user's trust. Never break them:
- You may ONLY reference patterns from the supplied "verified patterns" list. Each has already been confirmed true in the data by separate code. Do NOT invent, infer, or imply any trend, streak, or correlation not in that list.
- If the verified patterns list is empty or thin, say so plainly and keep it light. A quiet day gets a quiet brief. Never manufacture a problem to sound insightful.
- Connect pillars ONLY when a cross-pillar pattern is explicitly in the list. Otherwise speak to each pillar on its own.
- Recovery is given to you as a felt sense ("running low", "steady", "no read yet"), never a number. Speak of it the same way — never as a score, a streak, or something to beat.
- If the body is unmeasured (no physical reading), you may gently invite the user — once, in a single short clause — to add today's body so the next brief can read it. Never nag, never demand, never invent a body trend you weren't given.
- Be specific and plain. No therapy-speak, no hype, no exclamation marks. Sound like a sharp friend who actually read the data.

OUTPUT — return ONLY valid JSON, no markdown, no preamble:
{
  "headline": "one line, <= 12 words, the honest state of today",
  "body": "2-4 sentences. The connective read. If a cross-pillar chain is in the patterns, name it as 'the pattern that fits', not as certainty.",
  "moves": [ { "aspect": "physical|mental|work", "text": "one concrete move, imperative, <= 18 words" } ]
}

MOVES rule: include one move per category that genuinely needs attention today (max 3). If body recovery is the bottleneck, the physical move addresses recovery. If a habit lapsed, the move is to tend that specific habit. Never pad to three — only include a move a verified pattern justifies. If nothing needs action, return a single gentle maintenance move.`;

export async function generateBrief(args: {
  slot: "morning" | "evening";
  patterns: Pattern[];
  windowSummary: string;
}): Promise<{ brief: Brief; evidence: Pattern[] }> {
  const { slot, patterns, windowSummary } = args;

  const userMsg = `Slot: ${slot}.

Window summary:
${windowSummary}

Verified patterns (the ONLY things you may reference):
${patterns.length ? patterns.map((p) => `- [${p.strength}] ${p.statement}`).join("\n") : "(none — the data is quiet today)"}

Write the ${slot} brief as JSON.`;

  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(text) as Brief;
    if (!Array.isArray(parsed.moves)) parsed.moves = [];
    return { brief: parsed, evidence: patterns };
  } catch {
    // Never crash the morning on a parse error — degrade to a calm brief.
    return {
      brief: {
        headline:
          slot === "morning"
            ? "A fresh day. Tend what matters."
            : "Day's done. Set down how it felt.",
        body: "There's nothing to read into yet. Tend a check-in tonight and tomorrow's grove will have something to say.",
        moves: [],
      },
      evidence: patterns,
    };
  }
}
