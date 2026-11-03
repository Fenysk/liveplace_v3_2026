// Son titre de Soutien pour Mon compte (JOURNAL 2026-11-03) : lu dans Convex à chaque ouverture de la fenêtre, jamais à
// l'affichage de la page. Une donnée rare, qu'aucun viewer qui n'ouvre pas Mon compte ne paie.

import type { SupportTitle } from "@liveplace/domain/support";
import { useEffect, useState } from "react";
import { getMySupportFn } from "../../routes/-badges";

// `null` : aucun don, ou pas encore lu. Un invité n'a pas de compte : rien n'est lu.
export function useMySupportTitle(isOpen: boolean, isSignedIn: boolean): SupportTitle | null {
  const [title, setTitle] = useState<SupportTitle | null>(null);
  useEffect(() => {
    if (!isOpen || !isSignedIn) return;
    let isCurrent = true;
    getMySupportFn().then(
      (result) => {
        if (isCurrent && result.ok) setTitle(result.value);
      },
      (error: unknown) => console.error("mon soutien : titre non lu", error),
    );
    return () => {
      isCurrent = false;
    };
  }, [isOpen, isSignedIn]);
  return title;
}
