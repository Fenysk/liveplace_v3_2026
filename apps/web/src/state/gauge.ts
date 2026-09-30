// La jauge affichée entre deux réponses du serveur (§9.4) : une prédiction, corrigée au prochain `ack`.

import { refillGauge, type Timestamp } from "@liveplace/domain";
import type { ServerGauge } from "./canvas-store";

export type Refill = { refillMs: number; refillCharges: number };

// La formule de `gauge.lua` : `nextRefillAt - refillMs` est l'instant `at` de la jauge stockée. `max` et `claimable`
// viennent du serveur, jamais de `welcome.params` (JOURNAL 2026-09-30).
export function predictGauge(gauge: ServerGauge, refill: Refill, nowMs: Timestamp): ServerGauge {
  const predicted = refillGauge({ charges: gauge.charges, at: gauge.nextRefillAt - refill.refillMs }, nowMs, {
    gaugeMax: gauge.max,
    ...refill,
  });
  return { ...gauge, charges: predicted.charges, nextRefillAt: predicted.at + refill.refillMs };
}
