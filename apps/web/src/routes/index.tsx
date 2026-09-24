// `/` : pas de page d'accueil en bloc 1 (CDC §1), seulement la connexion.

import { createFileRoute } from "@tanstack/react-router";
import { NoticePill } from "../ui/design/pill";
import { SignInButton } from "../ui/design/twitch";

// Un lien et non un `Link` : `/auth/twitch` est une route serveur, la page doit vraiment partir.
const HomePage = () => (
  <main>
    <NoticePill title="LivePlace">
      <SignInButton href="/auth/twitch" label="Se connecter avec Twitch" />
    </NoticePill>
  </main>
);

export const Route = createFileRoute("/")({ component: HomePage });
