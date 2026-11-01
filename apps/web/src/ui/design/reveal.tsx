// Un contrôle qui paraît en fondu, à sa place (§9.6) : la corbeille de la pill Dessin garde sa case brouillon
// vide, rien ne bouge autour d'elle quand elle paraît. Toujours dans la page, `inert` quand il est fermé : ni clavier, ni lecteur d'écran.

import type { ReactNode } from "react";
import { classNames } from "./class-names";

type RevealProps = { isOpen: boolean; children: ReactNode };

export const Reveal = ({ isOpen, children }: RevealProps) => (
  <div className={classNames("lp-reveal", isOpen && "is-open")} inert={!isOpen}>
    {children}
  </div>
);
