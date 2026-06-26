// Grove models two kinds of intention: a goal (a vector toward a horizon) and a
// habit (a rhythm with no finish line). The Phase 0 schema's `kind` column is
// 'habit' | 'milestone'; we map the vector kind onto 'milestone' so no schema
// change is needed and the Phase 1 detector keeps working unchanged.

export type UiKind = "goal" | "habit";
export type Domain = "physical" | "mental" | "work";

export function toUiKind(dbKind: string): UiKind {
  return dbKind === "habit" ? "habit" : "goal";
}

export function toDbKind(kind: UiKind): "habit" | "milestone" {
  return kind === "habit" ? "habit" : "milestone";
}

export const DOMAIN_LABEL: Record<Domain, string> = {
  physical: "Body",
  mental: "Mind",
  work: "Work",
};

export const DOMAINS: Domain[] = ["physical", "mental", "work"];

export function isDomain(s: string): s is Domain {
  return s === "physical" || s === "mental" || s === "work";
}
