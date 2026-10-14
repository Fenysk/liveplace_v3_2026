// Le contenu de la page `/auth/expired` (Écart §14, JOURNAL 2026-10-13) : le retour de Twitch ne venait pas de ce navigateur,
// ou trop tard. Il le dit, et offre Se connecter au même endroit.

import { DESIGN_TEXTS } from "../design/design-texts";
import { NoticePill } from "../design/pill";
import { SignInButton } from "../design/twitch";
import { useTexts } from "../locale/use-locale";
import { ACCOUNT_TEXTS } from "./account-texts";

// Un lien et non un `Link` : `/auth/twitch` est une route serveur, la page doit vraiment partir.
export const SignInExpired = () => {
  const t = useTexts(ACCOUNT_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  return (
    <NoticePill title={t.signInRefused}>
      <SignInButton href="/auth/twitch" label={design.signInWithTwitch} />
    </NoticePill>
  );
};
