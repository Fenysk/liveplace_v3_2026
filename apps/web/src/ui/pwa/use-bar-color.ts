// La couleur des barres du navigateur ou du système (Écart §9.1, JOURNAL 2026-10-08) : le fond du jeu, clair ou sombre.
// Une balise posée ici et non dans le `head` du routeur : il ne garde qu'une balise par nom, et le choix de l'apparence
// (le sien ou celui du système) ne se lit que dans le navigateur.

import { useEffect } from "react";

export function useBarColor(): void {
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    // `--void` est le fond de la page : le lire suit l'apparence affichée, choix du joueur compris.
    const sync = () => {
      const color = getComputedStyle(root).getPropertyValue("--void").trim();
      if (color) meta.content = color;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-appearance"] });
    return () => {
      observer.disconnect();
      meta.remove();
    };
  }, []);
}
