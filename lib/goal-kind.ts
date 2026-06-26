// Grove models two kinds of intention: a goal (a vector toward a horizon) and a
// habit (a rhythm with no finish line). The `kind` column stores these literally
// as 'goal' | 'habit'. `toUiKind` reads tolerantly so any legacy 'milestone'
// rows still display as goals.

export type UiKind = "goal" | "habit";
export type Domain = "physical" | "mental" | "work";

export function toUiKind(dbKind: string): UiKind {
  return dbKind === "habit" ? "habit" : "goal";
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
