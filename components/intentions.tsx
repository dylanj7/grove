"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Check, Leaf, MoreHorizontal, Undo2 } from "lucide-react";
import { setMoveState, clearMoveState } from "@/app/(app)/home/actions";
import { completeHabit, uncompleteHabit } from "@/app/(app)/goals/actions";
import { localDayISO } from "@/lib/date";
import { DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";
import type { IntentionState } from "@/lib/intentions";

// ============================================================================
// WHAT TO TEND — the app's primary interactive object.
// ----------------------------------------------------------------------------
// Two things used to sit on Home saying almost the same sentence: the letter's
// moves, which were prose and could not be acted on, and "Rhythms today", which
// had a checkbox. The person was looking at one commitment twice, once
// uncheckable and once uncheckable-but-with-a-box. They are one list now.
//
// Underneath they are still two different writes — a move resolves against the
// letter it came from (move_tends), a rhythm against its goal (goal_touches) —
// and that seam stays below this component. Above it there is one gesture.
//
// Every row is OPTIMISTIC: the tap is the truth, the write goes out in a
// transition, and only a failure moves the UI back. Nothing here waits on a
// server, and nothing here calls router.refresh() — the version that did meant
// three taps cost three full server renders to confirm state the client had.
//
// The count under the list is scoped to TODAY and to this letter — "one of two
// tended" is a status you can act on. It is not carried across days, not
// averaged, and not compared to yesterday, because that is where a status turns
// into a streak.
// ============================================================================

export type IntentionItem =
  | {
      kind: "move";
      /** React key. Unique across carried-forward and today's moves. */
      id: string;
      day: string;
      slot: "morning" | "evening";
      moveKey: string;
      aspect: string;
      text: string;
      state: IntentionState;
      /** Still open from the previous letter, rather than asked for today. */
      carried?: boolean;
    }
  | {
      kind: "rhythm";
      id: string;
      goalId: string;
      aspect: string;
      text: string;
      done: boolean;
    };

type RowState = { state: IntentionState; failed: boolean };

function initialState(item: IntentionItem): RowState {
  return {
    state: item.kind === "move" ? item.state : item.done ? "tended" : "open",
    failed: false,
  };
}

export default function IntentionList({
  items,
  label,
}: {
  items: IntentionItem[];
  label?: string;
}) {
  const [states, setStates] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(items.map((i) => [i.id, initialState(i)])),
  );

  const update = useCallback((id: string, next: Partial<RowState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }, []);

  if (items.length === 0) return null;

  // Only what's still open counts as outstanding — something deliberately let
  // go is resolved, not missing. Said in words, never as "1/2".
  const total = items.length;
  const tended = items.filter((i) => states[i.id]?.state === "tended").length;
  const letGo = items.filter((i) => states[i.id]?.state === "let_go").length;

  return (
    <div className="space-y-3">
      <ul className="-mx-2 space-y-0.5">
        {items.map((item) => (
          <IntentionRow
            key={item.id}
            item={item}
            row={states[item.id] ?? initialState(item)}
            onChange={update}
          />
        ))}
      </ul>
      <p className="px-2 text-[0.72rem] leading-relaxed text-canopy">
        {countLine(tended, letGo, total, label)}
      </p>
    </div>
  );
}

// The status line. Words, not a fraction — a fraction is a score with a slash
// in it, and it would be the only number on the screen begging to be maximized.
function countLine(tended: number, letGo: number, total: number, label?: string): string {
  const noun = label ?? (total === 1 ? "intention" : "intentions");
  if (total === 1) {
    if (tended === 1) return "Tended.";
    if (letGo === 1) return "Let go.";
    return `One ${noun === "intentions" ? "intention" : noun} sitting there.`;
  }
  const resolved = tended + letGo;
  if (resolved === 0) return `Nothing tended yet — ${WORD[total] ?? total} sitting there.`;
  if (resolved === total) {
    return letGo === 0 ? "All tended." : "All settled — some tended, some let go.";
  }
  const tendedPart = tended > 0 ? `${WORD[tended] ?? tended} of ${WORD[total] ?? total} tended` : "";
  const letGoPart = letGo > 0 ? `${WORD[letGo] ?? letGo} let go` : "";
  return [tendedPart, letGoPart].filter(Boolean).join(", ") + ".";
}

const WORD: Record<number, string> = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
};

function IntentionRow({
  item,
  row,
  onChange,
}: {
  item: IntentionItem;
  row: RowState;
  onChange: (id: string, next: Partial<RowState>) => void;
}) {
  const [today] = useState(localDayISO);
  const [menuOpen, setMenuOpen] = useState(false);
  const [landing, setLanding] = useState(false);
  const [, startTransition] = useTransition();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const resolved = row.state !== "open";

  // Write a state and roll back on failure. The only thing that ever moves the
  // UI backwards is a real error, and the row says so in plain words.
  const commit = useCallback(
    (next: IntentionState) => {
      const prev = row.state;
      onChange(item.id, { state: next, failed: false });
      if (next === "tended" && prev !== "tended") {
        setLanding(true);
        setTimeout(() => setLanding(false), 900);
      }

      startTransition(async () => {
        const res =
          item.kind === "move"
            ? next === "open"
              ? await clearMoveState({ day: item.day, slot: item.slot, moveKey: item.moveKey })
              : await setMoveState({
                  day: item.day,
                  slot: item.slot,
                  moveKey: item.moveKey,
                  moveText: item.text,
                  aspect: item.aspect,
                  state: next,
                })
            : next === "tended"
              ? await completeHabit({ goalId: item.goalId, day: today })
              : await uncompleteHabit({ goalId: item.goalId, day: today });

        if (!res.ok) onChange(item.id, { state: prev, failed: true });
      });
    },
    [item, onChange, row.state, today],
  );

  function toggle() {
    // A long-press already opened the menu; don't also flip the mark on release.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    setMenuOpen(false);
    commit(row.state === "tended" ? "open" : "tended");
  }

  // Long-press is the shortcut to letting go. It is never the only path — the
  // quiet trailing button does the same thing, so the gesture is a convenience
  // rather than a requirement, and keyboard and screen-reader users reach it.
  function startPress() {
    if (item.kind !== "move") return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuOpen(true);
    }, 480);
  }
  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  return (
    <li>
      <div className="relative flex items-stretch gap-1">
        <button
          type="button"
          onClick={toggle}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e) => {
            if (item.kind === "move") {
              e.preventDefault();
              setMenuOpen(true);
            }
          }}
          aria-pressed={row.state === "tended"}
          className="grove-press-soft flex min-h-[52px] flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
        >
          {/* The tend target. 48px of hit area around a 26px mark — the mark is
              the affordance, the button is the target. */}
          <span className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center">
            <span
              className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 transition-all duration-200 ${
                row.state === "tended"
                  ? "scale-100 border-moss bg-moss text-mist"
                  : row.state === "let_go"
                    ? "scale-95 border-sage bg-sage/30 text-canopy"
                    : "scale-95 border-sage bg-transparent text-transparent"
              }`}
            >
              {row.state === "let_go" ? (
                <span aria-hidden className="h-[2px] w-[10px] rounded-full bg-canopy" />
              ) : (
                <Check size={15} strokeWidth={3} aria-hidden />
              )}
            </span>
            {landing ? (
              <Leaf
                size={15}
                aria-hidden
                className="grove-leaf-land pointer-events-none absolute -right-1 -top-1 text-moss"
              />
            ) : null}
          </span>

          <span className="flex min-w-0 flex-col gap-0.5">
            {item.kind === "move" && item.carried ? (
              <span className="text-[0.58rem] font-medium uppercase tracking-[0.16em] text-ember">
                Still sitting there
              </span>
            ) : null}
            <span
              className={`font-voice text-[1.02rem] leading-snug transition-colors ${
                resolved ? "text-canopy" : "text-soil"
              }`}
            >
              {item.text}
            </span>
            {row.failed ? (
              <span className="text-[0.68rem] text-ember">Didn&rsquo;t save — tap again</span>
            ) : null}
          </span>

          <span className="ml-auto shrink-0 pl-2 text-[0.58rem] uppercase tracking-[0.14em] text-canopy/70">
            {DOMAIN_LABEL[item.aspect as Domain] ?? item.aspect}
          </span>
        </button>

        {item.kind === "move" ? (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label={`More for "${item.text}"`}
            className="grove-press flex min-h-[52px] w-9 shrink-0 items-center justify-center rounded-xl text-canopy/45 hover:text-canopy focus-visible:text-canopy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Letting go is a real act, offered in the app's own register. No
          "skip", no "fail", no "missed" — and nothing is recorded against it. */}
      {menuOpen && item.kind === "move" ? (
        <div className="grove-fade mx-2 mb-1 flex flex-wrap items-center gap-2 rounded-xl bg-dawn px-3 py-2.5">
          {row.state === "open" ? (
            <>
              <p className="mr-auto text-[0.74rem] text-canopy">Not this one?</p>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  commit("let_go");
                }}
                className="grove-press rounded-lg border border-sage px-3 py-1.5 text-[0.74rem] text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
              >
                Let it go
              </button>
            </>
          ) : (
            <>
              <p className="mr-auto text-[0.74rem] text-canopy">
                {row.state === "tended" ? "Tended." : "Let go."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  commit("open");
                }}
                className="grove-press flex items-center gap-1.5 rounded-lg border border-sage px-3 py-1.5 text-[0.74rem] text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
              >
                <Undo2 size={13} aria-hidden />
                Put it back
              </button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
