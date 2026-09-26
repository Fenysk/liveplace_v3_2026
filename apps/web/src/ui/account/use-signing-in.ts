// Parti chez Twitch : la page reste affichée le temps que Twitch réponde, et sa connexion au gateway se ferme.
// La pill Dessin dit alors « Connexion à Twitch », jamais « Reconnexion ». Un retour arrière depuis le cache l'efface.

import { useEffect, useState } from "react";

export function useSigningIn(): { isSigningIn: boolean; onSignIn: () => void } {
  const [isSigningIn, setIsSigningIn] = useState(false);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsSigningIn(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return { isSigningIn, onSignIn: () => setIsSigningIn(true) };
}
