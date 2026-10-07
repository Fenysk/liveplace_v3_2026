// Une variable de `tokens.css`, montrée sur /design : une pastille de couleur sous son thème, ou une mesure avec sa
// valeur lue dans le navigateur, jamais recopiée à la main.

import { useEffect, useRef, useState } from "react";
import type { CssVariables } from "./class-names";
import type { Theme } from "./theme";

// `motion` : une courbe ou une durée, qui ne se dessine pas ; seule sa valeur s'affiche.
export type SpecimenKind = "space" | "radius" | "size" | "shadow" | "motion";

const specimenStyle = (name: string): CssVariables => ({ "--lp-specimen": `var(--${name})` });

// La pastille d'une couleur sous un thème : elle porte son propre `data-theme`, donc la valeur de ce thème.
export const VariableSwatch = ({ name, theme }: { name: string; theme: Theme }) => (
  <span
    data-theme={theme}
    className="lp-specimen-sample is-color"
    style={specimenStyle(name)}
    aria-hidden="true"
  />
);

type VariableSpecimenProps = { name: string; kind: SpecimenKind; usage: string };

export const VariableSpecimen = ({ name, kind, usage }: VariableSpecimenProps) => {
  const sample = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState("");
  // Lue au montage : la page remonte la ligne quand le thème change (une ombre n'a pas la même valeur dans les deux).
  useEffect(() => {
    if (sample.current) setValue(getComputedStyle(sample.current).getPropertyValue(`--${name}`).trim());
  }, [name]);
  return (
    <div className="lp-specimen">
      <span className="lp-specimen-slot">
        <span ref={sample} className={`lp-specimen-sample is-${kind}`} style={specimenStyle(name)} />
      </span>
      <span className="lp-specimen-text">
        <span className="lp-specimen-name">
          <code className="lp-type-caption">--{name}</code>
          <span className="lp-type-caption lp-muted">{value}</span>
        </span>
        <span className="lp-type-caption">{usage}</span>
      </span>
    </div>
  );
};
