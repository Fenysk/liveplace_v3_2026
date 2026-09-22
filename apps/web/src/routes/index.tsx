// `/` : pas de page d'accueil en bloc 1 (CDC §1), seulement la connexion.

import { createFileRoute } from "@tanstack/react-router";

const HomePage = () => (
  <main style={{ padding: 16, display: "grid", gap: 12, justifyItems: "center" }}>
    <h1 style={{ margin: 0, fontSize: 18 }}>LivePlace</h1>
    {/* Un lien et non un `Link` : `/auth/twitch` est une route serveur, la page doit vraiment partir. */}
    <a href="/auth/twitch" style={{ color: "#c9b6ff" }}>
      Se connecter avec Twitch
    </a>
  </main>
);

export const Route = createFileRoute("/")({ component: HomePage });
