// Pill de consentement pub : phrase + en savoir plus, puis Refuser / Accepter à parts égales (dock `bl`).

import { Heart } from "lucide-react";
import { Button } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { PRIVACY_PATH } from "../design/twitch";

const DOCK: PillDock = "bl";

export type ConsentPillProps = {
  onAccept: () => void;
  onRefuse: () => void;
  isDocked?: boolean;
};

export const ConsentPill = ({ onAccept, onRefuse, isDocked = true }: ConsentPillProps) => (
  <Pill dock={isDocked ? DOCK : undefined} layout="stack" isForeground={isDocked}>
    <div className="lp-ad-consent">
      <div className="lp-ad-consent-copy">
        <p className="lp-type-body">
          LivePlace a besoin d&apos;afficher des publicités non ciblées pour financer le service.
        </p>
        <a className="lp-link lp-type-caption" href={PRIVACY_PATH}>
          En savoir plus
        </a>
      </div>
      <div className="lp-ad-consent-actions">
        <Button label="Refuser" onPress={onRefuse} />
        <Button label="Accepter" icon={Heart} onPress={onAccept} />
      </div>
    </div>
  </Pill>
);
