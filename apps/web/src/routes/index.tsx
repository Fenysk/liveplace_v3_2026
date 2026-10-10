// `/` : pas de page d'accueil en bloc 1 (CDC §1), seulement la connexion.

import { createFileRoute } from "@tanstack/react-router";
import { DESIGN_TEXTS } from "../ui/design/design-texts";
import { NoticePill } from "../ui/design/pill";
import { SignInButton, SignInNote } from "../ui/design/twitch";
import { useTexts } from "../ui/locale/use-locale";

// Un lien et non un `Link` : `/auth/twitch` est une route serveur, la page doit vraiment partir.
const HomePage = () => {
  const t = useTexts(DESIGN_TEXTS);
  return (
    <main>
      <NoticePill title="LivePlace">
        <SignInButton href="/auth/twitch" label={t.signInWithTwitch} />
        <SignInNote />
      </NoticePill>
    </main>
  );
};

export const Route = createFileRoute("/")({ component: HomePage });
