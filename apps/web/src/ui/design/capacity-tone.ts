// La teinte d'un taux (la section Capacité, Écart §4.3, JOURNAL 2026-10-07) : vert sous 50 %, orange de 50 à 80 %, rouge à
// partir de 80 % ; neutre quand la mesure n'est pas complète. Une classe de texte de tokens.css, jamais une couleur écrite ici.

export type CapacityTone = "ok" | "warning" | "danger" | "neutral";

export const TONE_CLASSES: Record<CapacityTone, string | undefined> = {
  ok: "lp-success",
  warning: "lp-warning",
  danger: "lp-danger",
  neutral: undefined,
};
