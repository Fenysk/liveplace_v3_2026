// Une variable de `tokens.css`, montrée sur /design avec sa valeur lue dans le navigateur : jamais recopiée à la main.

import { useEffect, useRef, useState } from "react";
import type { CssVariables } from "./class-names";

// `motion` : une courbe ou une durée, qui ne se dessine pas ; seule sa valeur s'affiche.
export type SpecimenKind = "color" | "space" | "radius" | "size" | "shadow" | "motion";

type VariableSpecimenProps = { name: string; kind: SpecimenKind; usage: string };

const specimenStyle = (name: string): CssVariables => ({ "--lp-specimen": `var(--${name})` });

export const VariableSpecimen = ({ name, kind, usage }: VariableSpecimenProps) => {
  const sample = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState("");
  // Lue là où l'échantillon est posé : dans une colonne claire ou sombre, la valeur de ce thème.
  useEffect(() => {
    if (sample.current) setValue(getComputedStyle(sample.current).getPropertyValue(`--${name}`).trim());
  }, [name]);
  return (
    <div className="lp-specimen">
      <span ref={sample} className={`lp-specimen-sample is-${kind}`} style={specimenStyle(name)} />
      <span className="lp-specimen-text">
        <code className="lp-type-caption">--{name}</code>
        <span className="lp-type-caption lp-muted">{value}</span>
        <span className="lp-type-caption">{usage}</span>
      </span>
    </div>
  );
};
