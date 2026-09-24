// La jauge affichée entre deux réponses du serveur (§9.4) : une prédiction, corrigée au prochain `ack`.

import { refillGauge, type Timestamp } from "@liveplace/domain";
import type { ServerGauge } from "./canvas-store";

export type Refill = { refillMs: number; refillCharges: number };

// La formule de `place.lua` : `nextRefillAt - refillMs` est l'instant `at` de la jauge stockée.
export function predictGauge(gauge: ServerGauge, refill: Refill, nowMs: Timestamp): ServerGauge {
  const predicted = refillGauge({ charges: gauge.charges, at: gauge.nextRefillAt - refill.refillMs }, nowMs, {
    gaugeMax: gauge.max,
    ...refill,
  });
  return { charges: predicted.charges, max: gauge.max, nextRefillAt: predicted.at + refill.refillMs };
}
