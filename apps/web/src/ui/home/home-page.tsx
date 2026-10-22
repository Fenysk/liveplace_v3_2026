// La page d'accueil `/` (Écart §9.1, JOURNAL 2026-10-22) : « LivePlace » en haut à gauche, puis à gauche une phrase et « Lancer ma
// fresque », à droite la scène. Sur un écran étroit, la phrase et le bouton, puis l'écran du stream, la fresque et la feuille. Le
// serveur écrit le mot-symbole, la phrase, le bouton et le stream ; le téléphone se monte dans le navigateur (phone-screen.tsx).

import { SignInButton, SignInNote } from "../design/twitch";
import { useMediaQuery } from "../design/use-media-query";
import { useTexts } from "../locale/use-locale";
import { HomeScene } from "./home-scene";
import { HOME_TEXTS } from "./home-texts";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// `/auth/twitch` est une route serveur : un lien, la page doit vraiment partir. Sans `returnTo`, la connexion ramène le
// streamer sur `/{login}`.
const HomeIntro = () => {
  const t = useTexts(HOME_TEXTS);
  return (
    <div className="lp-home-intro">
      <h1 className="lp-type-display lp-home-headline">{t.headline}</h1>
      <SignInButton href="/auth/twitch" label={t.start} />
      <SignInNote />
    </div>
  );
};

// `isMotionReduced` : /design montre l'état mouvement réduit sans changer le réglage du système. Absent, c'est le système qui dit.
export const HomeContent = ({ isMotionReduced }: { isMotionReduced?: boolean }) => {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  return (
    <div className="lp-home">
      <p className="lp-type-display lp-home-wordmark">LivePlace</p>
      <div className="lp-home-layout">
        <HomeIntro />
        <HomeScene isMotionReduced={isMotionReduced ?? prefersReducedMotion} />
      </div>
    </div>
  );
};

export const HomePage = () => (
  <main className="lp-home-page">
    <div className="lp-void" aria-hidden="true" />
    <HomeContent />
  </main>
);
