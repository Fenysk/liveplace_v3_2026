// `/` : pas de page d'accueil en bloc 1 (CDC §1), seulement la connexion.

import { createFileRoute } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { Button } from "../ui/design/button";
import { NoticePill } from "../ui/design/pill";

// Un lien et non un `Link` : `/auth/twitch` est une route serveur, la page doit vraiment partir.
const HomePage = () => (
  <main>
    <NoticePill title="LivePlace">
      <Button label="Se connecter avec Twitch" icon={LogIn} variant="primary" href="/auth/twitch" />
    </NoticePill>
  </main>
);

export const Route = createFileRoute("/")({ component: HomePage });
