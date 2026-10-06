// Un canvas de la section Activité (écart §4.3, JOURNAL 2026-10-06) : son streamer, la pastille OBS s'il est streamé,
// ses chiffres, et, déplié, ses comptes connectés puis ses invités. Une ligne sur grand écran, une carte sur mobile.
// Avatars et noms suivent la règle des profils (profile.tsx) : ils mènent au canvas de la personne.

import type { Device } from "@liveplace/domain";
import { ChevronDown, Monitor, MonitorPlay, Smartphone } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { classNames } from "./class-names";
import { Profile, type ProfileUser } from "./profile";

// `mention` : son rôle et depuis quand, sous son nom.
export type CanvasActivityAccount = {
  user: ProfileUser & { userId: string };
  mention: string;
  devices: readonly Device[];
};

export type CanvasActivityCardProps = {
  owner: ProfileUser;
  obsTitle: string | null; // streamé : la pastille, et ses vues OBS en infobulle
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

export const CanvasActivityCard = ({
  owner,
  obsTitle,
  facts,
  accounts,
  guestsLine,
  isOpen,
  onToggle,
}: CanvasActivityCardProps) => (
  <article className={classNames("lp-canvas-activity", isOpen && "is-open")}>
    <div className="lp-canvas-activity-head">
      <span className="lp-canvas-activity-summary">
        <span className="lp-canvas-activity-owner">
          <Profile user={owner} />
          {obsTitle && <Badge label="OBS" icon={MonitorPlay} title={obsTitle} />}
        </span>
        <span className="lp-canvas-activity-facts lp-type-caption lp-muted">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
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
      <ul className="lp-canvas-activity-accounts">
        {accounts.map(({ user, mention, devices }) => (
          <li key={user.userId} className="lp-canvas-activity-account">
            <span className="lp-marked">
              <Profile user={user} />
              <span className="lp-marked-mention lp-type-caption lp-muted">{mention}</span>
            </span>
            <span className="lp-canvas-activity-devices">
              {devices.map((device) => (
                <DeviceIcon key={device} device={device} />
              ))}
            </span>
          </li>
        ))}
        {guestsLine && <li className="lp-type-caption lp-muted">{guestsLine}</li>}
        {accounts.length === 0 && !guestsLine && (
          <li className="lp-type-caption lp-muted">Aucune page ouverte sur ce canvas.</li>
        )}
      </ul>
    )}
  </article>
);
