// `/auth/expired` : là où `/auth/twitch/callback` renvoie un retour de Twitch qu'il refuse (§10.1).

import { createFileRoute } from "@tanstack/react-router";
import { SignInExpired } from "../../ui/account/sign-in-expired";

const ExpiredPage = () => (
  <main>
    <SignInExpired />
  </main>
);

export const Route = createFileRoute("/auth/expired")({ component: ExpiredPage });
