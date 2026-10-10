// Un canvas de la section Activité (écart §4.3, JOURNAL 2026-10-06) : son streamer, ses chiffres, et, déplié, ses comptes
// connectés puis ses invités. Une ligne sur grand écran, une carte sur mobile.
// Avatars et noms suivent la règle des profils (profile.tsx) : ils mènent au canvas de la personne.
// Le streamer et la liste des comptes servent aussi seuls, dans la section Ce canvas (JOURNAL 2026-10-07).

import type { Device } from "@liveplace/domain";
import { ChevronDown, Monitor, Smartphone } from "lucide-react";
import { Button } from "./button";
import { classNames } from "./class-names";
import { Profile, type ProfileUser } from "./profile";
import { RollingNumber } from "./rolling-number";
import { wordingOf } from "./use-label-morph";

// `mention` : son rôle et depuis quand, sous son nom.
export type CanvasActivityAccount = {
  user: ProfileUser & { userId: string };
  mention: string;
  devices: readonly Device[];
};

export type CanvasActivityCardProps = {
  owner: ProfileUser;
  facts: readonly string[]; // personnes, température, nouveaux comptes
  accounts: readonly CanvasActivityAccount[];
  guestsLine: string | null; // « + 2 invités », après les comptes
  isOpen: boolean;
  onToggle: () => void;
};

const DEVICE_ICONS = {
  desktop: { icon: Monitor, label: "PC" },
  phone: { icon: Smartphone, label: "Téléphone" },
} as const;

const DeviceIcon = ({ device }: { device: Device }) => {
  const { icon: Icon, label } = DEVICE_ICONS[device];
  return (
    <span className="lp-canvas-activity-device" title={label}>
      <Icon aria-hidden="true" />
      <span className="lp-visually-hidden">{label}</span>
    </span>
  );
};

type CanvasActivityOwnerProps = Pick<CanvasActivityCardProps, "owner">;

// Le streamer d'un canvas : le bouton Twitch de son profil dit s'il est en live.
export const CanvasActivityOwner = ({ owner }: CanvasActivityOwnerProps) => (
  <span className="lp-canvas-activity-owner">
    <Profile user={owner} />
  </span>
);

type ConnectedAccountsProps = Pick<CanvasActivityCardProps, "accounts" | "guestsLine"> & {
  emptyText: string; // ni compte ni invité
};

// Les comptes connectés d'un canvas, avec leur rôle, depuis quand et leurs appareils, puis ses invités.
export const ConnectedAccounts = ({ accounts, guestsLine, emptyText }: ConnectedAccountsProps) => (
  <ul className="lp-connected-accounts">
    {accounts.map(({ user, mention, devices }) => (
      <li key={user.userId} className="lp-canvas-activity-account">
        <span className="lp-marked">
          <Profile user={user} />
          <span className="lp-marked-mention lp-type-caption lp-muted">
            <RollingNumber value={mention} />
          </span>
        </span>
        <span className="lp-canvas-activity-devices">
          {devices.map((device) => (
            <DeviceIcon key={device} device={device} />
          ))}
        </span>
      </li>
    ))}
    {guestsLine && (
      <li className="lp-type-caption lp-muted">
        <RollingNumber value={guestsLine} />
      </li>
    )}
    {accounts.length === 0 && !guestsLine && <li className="lp-type-caption lp-muted">{emptyText}</li>}
  </ul>
);

export const CanvasActivityCard = ({
  owner,
  facts,
  accounts,
  guestsLine,
  isOpen,
  onToggle,
}: CanvasActivityCardProps) => (
  <article className={classNames("lp-canvas-activity", isOpen && "is-open")}>
    <div className="lp-canvas-activity-head">
      <span className="lp-canvas-activity-summary">
        <CanvasActivityOwner owner={owner} />
        <span className="lp-canvas-activity-facts lp-type-caption lp-muted">
          {/* Les mêmes mots gardent la même clé : le chiffre qui change défile au lieu de se recréer. */}
          {facts.map((fact) => (
            <span key={wordingOf(fact)}>
              <RollingNumber value={fact} />
            </span>
          ))}
        </span>
      </span>
      <span className="lp-canvas-activity-toggle">
        <Button
          icon={ChevronDown}
          variant="ghost"
          title={isOpen ? "Replier" : "Qui est dessus"}
          isPressed={isOpen}
          onPress={onToggle}
        />
      </span>
    </div>
    {isOpen && (
      <div className="lp-canvas-activity-accounts">
        <ConnectedAccounts
          accounts={accounts}
          guestsLine={guestsLine}
          emptyText="Aucune page ouverte sur cette fresque."
        />
      </div>
    )}
  </article>
);
