// Le titre de l'onglet et la description de `/` suivent la langue (Écart §14, JOURNAL 2026-10-22) : le serveur les écrit dans la langue
// rendue ; un changement de langue sans recharger les réécrit ici, comme la page Confidentialité.

import { useEffect } from "react";
import { useTexts } from "../locale/use-locale";
import { HOME_HEAD_TEXTS } from "./home-head-texts";

export const useHomeHead = (): void => {
  const t = useTexts(HOME_HEAD_TEXTS);
  useEffect(() => {
    document.title = t.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", t.description);
  }, [t]);
};
