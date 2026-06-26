"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGoal } from "./actions";
import { DOMAINS, DOMAIN_LABEL, type Domain, type UiKind } from "@/lib/goal-kind";

const LABEL = "text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy";

function Segmented<T extends string>({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-2">
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] flex-1 rounded-xl border px-3 text-[0.7rem] font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 ${
              sel
                ? "border-moss bg-moss text-mist"
                : "border-sage bg-dawn text-canopy hover:border-canopy"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AddGoal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<UiKind>("goal");
  const [domain, setDomain] = useState<Domain>("physical");
  const [horizon, setHorizon] = useState<"short" | "long">("long");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setKind("goal");
    setDomain("physical");
    setHorizon("long");
    setError(null);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await createGoal({
      title,
      kind,
      domain,
      horizon: kind === "goal" ? horizon : undefined,
    });
    setSaving(false);
    if (res.ok) {
      reset();
      setOpen(false);
      router.refresh();
    } else {
      setError(res.error); // keep what was typed
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:text-pine focus-visible:outline-none focus-visible:underline"
      >
        Plant something
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-6 rounded-2xl border border-sage bg-dawn/50 p-5"
    >
      <div>
        <label htmlFor="goal-title" className={LABEL}>
          Intention
        </label>
        <input
          id="goal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you moving toward?"
          autoFocus
          className="mt-3 w-full rounded-xl border border-sage bg-mist px-4 py-3 text-soil outline-none transition placeholder:text-canopy/70 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/25"
        />
      </div>

      <div className="space-y-2.5">
        <span className={LABEL}>Kind</span>
        <Segmented
          ariaLabel="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "goal", label: "Goal" },
            { value: "habit", label: "Habit" },
          ]}
        />
        <p className="text-[0.72rem] leading-5 text-canopy/80">
          {kind === "goal"
            ? "A vector — something you move toward."
            : "A rhythm — something you keep. No finish line."}
        </p>
      </div>

      <div className="space-y-2.5">
        <span className={LABEL}>Domain</span>
        <Segmented
          ariaLabel="Domain"
          value={domain}
          onChange={setDomain}
          options={DOMAINS.map((d) => ({ value: d, label: DOMAIN_LABEL[d] }))}
        />
      </div>

      {kind === "goal" ? (
        <div className="space-y-2.5">
          <span className={LABEL}>Horizon</span>
          <Segmented
            ariaLabel="Horizon"
            value={horizon}
            onChange={setHorizon}
            options={[
              { value: "short", label: "Short" },
              { value: "long", label: "Long" },
            ]}
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] flex-1 rounded-xl bg-moss px-4 text-sm font-medium uppercase tracking-[0.14em] text-mist transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-60"
        >
          {saving ? "Planting…" : "Plant"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="min-h-[44px] px-3 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy transition-colors hover:text-moss"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
