"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NoteField from "@/components/note-field";
import { tendGoal } from "../actions";
import { localDayISO } from "@/lib/date";
import type { UiKind } from "@/lib/goal-kind";

// Tending — the user's analog to the check-in's carving. A small, real, honest
// act, never a dopamine-button. Graceful failure keeps the note.
export default function TendControl({
  goalId,
  kind,
}: {
  goalId: string;
  kind: UiKind;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await tendGoal({
      goalId,
      day: localDayISO(),
      note: note.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      setNote("");
      setOpen(false);
      router.refresh();
    } else {
      setError(res.error); // keep the note
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] rounded-xl border border-moss px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:bg-moss hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
      >
        Tend this
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-5 rounded-2xl border border-sage bg-dawn/50 p-5"
    >
      <NoteField
        id="tend-note"
        label="A note, if you have one"
        value={note}
        onChange={setNote}
        placeholder={kind === "habit" ? "How did it feel?" : "What moved?"}
        rows={2}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] flex-1 rounded-xl bg-moss px-4 text-sm font-medium uppercase tracking-[0.14em] text-mist transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-60"
        >
          {saving ? "Setting it down…" : "Tended"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="min-h-[44px] px-3 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy transition-colors hover:text-moss"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
