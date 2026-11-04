// La page d'accueil `/` (§9.10) : « LivePlace » et Soutenir en haut à gauche, les réglages (Nouveautés, langue, apparence) en haut
// à droite, puis à gauche une phrase et « Lancer ma fresque avec Twitch », à droite la scène. Sur un écran étroit, la phrase et le
// bouton, puis l'écran du stream, la fresque et la feuille. Le serveur écrit le mot-symbole, Soutenir, les réglages, la phrase, le
// bouton et le stream ; le téléphone se monte dans le navigateur (phone-screen.tsx). Tout en bas, les liens vers la confidentialité et
// les mentions légales.

import { AccountDeletedToast } from "../account/account-deleted-toast";
import { ToastProvider } from "../design/toast";
import { SignInButton, SignInNote } from "../design/twitch";
import { useMediaQuery } from "../design/use-media-query";
import { Wordmark } from "../design/wordmark";
import { DocumentLinks } from "../document/document-links";
import { useTexts } from "../locale/use-locale";
import { HomeScene } from "./home-scene";
import { HomeSettings } from "./home-settings";
import { HomeSupport } from "./home-support";
import { HOME_TEXTS } from "./home-texts";
import { useHomeHead } from "./use-home-head";

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
      <div className="lp-home-header">
        <div className="lp-home-brand">
          <Wordmark />
          <HomeSupport />
        </div>
        <HomeSettings />
      </div>
      <div className="lp-home-layout">
        <HomeIntro />
        <HomeScene isMotionReduced={isMotionReduced ?? prefersReducedMotion} />
      </div>
      <DocumentLinks names={["privacy", "legal"]} />
    </div>
  );
};

export const HomePage = () => {
  useHomeHead();
  return (
    <main className="lp-home-page">
      <div className="lp-void" aria-hidden="true" />
      <ToastProvider>
        <HomeContent />
        <AccountDeletedToast />
      </ToastProvider>
    </main>
  );
};
