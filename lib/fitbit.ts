// lib/fitbit.ts
// ----------------------------------------------------------------
// The Fitbit seam — BUILT here, WIRED in Phase 5.
//
// A physical-data provider is just: "given a user, hand back physical
// readings." Manual input is one source (it writes readings directly);
// Fitbit will be another. Both produce the same `PhysicalReading` shape,
// so the recovery calc, the brief, and the UI never learn where a number
// came from. This is the same provider-seam discipline as lib/dictation.ts.
//
// In Phase 4 the Fitbit provider is intentionally DARK: not connected, no
// readings. The manual path is what actually feeds data. Phase 5's whole
// focused job is to drop real OAuth + token refresh + the Fitbit API behind
// exactly this interface — touching nothing above it. Token storage is
// prepared (the `fitbit_connections` table from scripts/phase4.sql) and left
// empty until then.
// ----------------------------------------------------------------

import type { PhysicalReading } from "./physical";

export interface PhysicalProvider {
  /** Stable id for the source, recorded on readings as their provenance. */
  readonly source: PhysicalReading["source"];

  /** Has this user connected the provider? Phase 4: always false. */
  isConnected(userId: string): Promise<boolean>;

  /**
   * Readings from `sinceDay` (inclusive, YYYY-MM-DD) to today. Phase 4 returns
   * none; Phase 5 fetches from the Fitbit API and maps into PhysicalReading.
   */
  fetchReadings(userId: string, sinceDay: string): Promise<PhysicalReading[]>;
}

// The disconnected stub. Everything compiles and runs against it today; Phase 5
// replaces the bodies, not the shape.
export const fitbitProvider: PhysicalProvider = {
  source: "fitbit",

  async isConnected() {
    // No token storage is populated yet — there is nothing to connect to.
    return false;
  },

  async fetchReadings() {
    // Dark until Phase 5 wires OAuth. Manual input feeds the body for now.
    return [];
  },
};
