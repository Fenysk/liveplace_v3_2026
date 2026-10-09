// La pill Compte (CDC 2026), en haut à droite : Développeur (lui seul), Réglages (le streamer sur son canvas) ou
// Modération (qui modère sans être le streamer), l'apparence, puis sa photo (Mon compte) ou Se connecter.
// Sur son canvas, c'est la seule pill du streamer. Sur mobile (Écart §8.1, JOURNAL 2026-10-08), ni l'apparence (elle est
// dans Mon compte) ni Se connecter (la barre du bas le dit) : l'invité n'a plus de pill, sauf sans barre du bas (une archive).

import { Activity, Settings, Shield } from "lucide-react";
import type { AppearanceChoice } from "../design/appearance";
import { AppearanceButton } from "../design/appearance-controls";
import { Button } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, type ProfileUser } from "../design/profile";
import { SignInButton } from "../design/twitch";
import { BubbleTarget } from "../help/bubble-target";
import { reportCountLabel } from "../moderation/moderation-texts";

const DOCK: PillDock = "tr";

// `unknown` : le gateway n'a pas encore répondu au `hello`. Le web affiche, le gateway décide (§10.3).
export type AccountIdentity =
  | { kind: "unknown" }
  | { kind: "guest" }
  | { kind: "signedIn"; user: ProfileUser };

export type AccountPillProps = {
  identity: AccountIdentity;
  signInHref: string;
  appearanceChoice: AppearanceChoice;
  onPickAppearance: (choice: AppearanceChoice) => void;
  onOpenAccount: () => void; // la fenêtre, ouverte sur Mon compte, ou sur Modération si des signalements attendent (sauf au modérateur)
  onOpenSettings?: (() => void) | undefined; // la fenêtre, sur Canvas ; absent : pas le streamer sur son canvas
  onOpenModeration?: (() => void) | undefined; // la fenêtre, sur Modération ; absent : pas modérateur sans être le streamer
  onOpenDeveloper?: (() => void) | undefined; // écart §10.3 (JOURNAL 2026-10-06) : la fenêtre Développeur, pour lui seul
  pendingReports?: number; // pour qui modère : un point tant qu'il y en a, sur Modération s'il l'a, sinon sur sa photo (JOURNAL 2026-09-28)
  onSignIn?: () => void; // la page part chez Twitch
  isCompact?: boolean;
  hasBottomBar?: boolean; // faux sans barre du bas (la page d'une archive) : l'invité y garde Se connecter sur mobile
  isDocked?: boolean;
  isVisible?: boolean; // masquée tant que le serveur a reconnu le streamer et que le gateway n'a pas répondu
};

// Sur mobile, Se connecter ne reste que sans barre du bas ; sans lui ni photo, il ne reste rien : la pill s'efface et la pill
// Canvas prend la rangée (pill.css).
const visibilityOf = (identity: AccountIdentity, isCompact: boolean, hasBottomBar: boolean) => {
  const showsSignIn = identity.kind === "guest" && (!isCompact || !hasBottomBar);
  return { showsSignIn, hasNothingToShow: isCompact && identity.kind !== "signedIn" && !showsSignIn };
};

const titleWithReports = (title: string, reports: number): string =>
  reports > 0 ? `${title} · ${reportCountLabel(reports)} en attente` : title;

export const AccountPill = ({
  identity,
  signInHref,
  appearanceChoice,
  onPickAppearance,
  onOpenAccount,
  onOpenSettings,
  onOpenModeration,
  onOpenDeveloper,
  pendingReports = 0,
  onSignIn,
  isCompact = false,
  hasBottomBar = true,
  isDocked = true,
  isVisible = true,
}: AccountPillProps) => {
  // Le point suit le bouton qui mène aux signalements : Modération pour le modérateur, sinon la photo (une seule pastille).
  // La bulle d'aide des signalements vise le même bouton (Écart §8.1, JOURNAL 2026-10-08).
  const moderationReports = onOpenModeration ? pendingReports : 0;
  const avatarReports = onOpenModeration ? 0 : pendingReports;
  const { showsSignIn, hasNothingToShow } = visibilityOf(identity, isCompact, hasBottomBar);
  const avatar = identity.kind === "signedIn" && (
    <AvatarButton
      user={identity.user}
      title={titleWithReports("Mon compte", avatarReports)}
      hasDot={avatarReports > 0}
      onPress={onOpenAccount}
    />
  );
  return (
    <Pill dock={isDocked ? DOCK : undefined} isVisible={isVisible && !hasNothingToShow}>
      {onOpenDeveloper && (
        <Button icon={Activity} variant="ghost" title="Développeur" onPress={onOpenDeveloper} />
      )}
      {onOpenSettings && (
        <BubbleTarget name="settings">
          <Button icon={Settings} variant="ghost" title="Réglages" onPress={onOpenSettings} />
        </BubbleTarget>
      )}
      {onOpenModeration && (
        <BubbleTarget name="reports">
          <Button
            icon={Shield}
            variant="ghost"
            title={titleWithReports("Modération", moderationReports)}
            hasDot={moderationReports > 0}
            onPress={onOpenModeration}
          />
        </BubbleTarget>
      )}
      {!isCompact && <AppearanceButton choice={appearanceChoice} onPick={onPickAppearance} />}
      {showsSignIn && <SignInButton href={signInHref} label="Se connecter" onPress={onSignIn} />}
      {avatar && (onOpenModeration ? avatar : <BubbleTarget name="reports">{avatar}</BubbleTarget>)}
    </Pill>
  );
};
