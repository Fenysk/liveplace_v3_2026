// Twitch dans le design system : son logo (le « glitch »), et le bouton de connexion à ses couleurs.
// Le tracé vient de Simple Icons (CC0). Les couleurs de marque sont des tokens : --twitch, --on-twitch.

import { Button } from "./button";

export const TwitchGlyph = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
  </svg>
);

// Se connecter, toujours avec Twitch : texte blanc sur violet Twitch, et son logo. Sans libellé : le logo seul.
type SignInButtonProps = { href: string; label?: string };

export const SignInButton = ({ href, label }: SignInButtonProps) =>
  label ? (
    <Button label={label} icon={TwitchGlyph} variant="twitch" title="Se connecter avec Twitch" href={href} />
  ) : (
    <Button icon={TwitchGlyph} variant="twitch" title="Se connecter avec Twitch" href={href} />
  );
