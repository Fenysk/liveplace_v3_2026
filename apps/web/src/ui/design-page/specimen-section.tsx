// Un groupe d'exemples sur /design : un titre, une phrase qui dit à quoi il sert, puis les exemples.

import type { ReactNode } from "react";

type SpecimenSectionProps = { title: string; note?: string; children: ReactNode };

export const SpecimenSection = ({ title, note, children }: SpecimenSectionProps) => (
  <section className="design-group">
    <h3 className="lp-type-title">{title}</h3>
    {note && <p className="lp-type-caption lp-muted">{note}</p>}
    <div className="design-specimens">{children}</div>
  </section>
);

// Un exemple légendé : ce qu'on voit, et le nom de l'état qu'il montre.
type SpecimenProps = { caption: string; children: ReactNode };

export const Specimen = ({ caption, children }: SpecimenProps) => (
  <figure className="design-specimen">
    {children}
    <figcaption className="lp-type-caption lp-muted">{caption}</figcaption>
  </figure>
);
