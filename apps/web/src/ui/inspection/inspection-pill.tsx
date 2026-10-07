// La pill Inspection (CDC 2026), au centre à droite : l'auteur du pixel inspecté, sa couleur, sa date de pose.
// Sous un filet, Signaler pour tout compte (JOURNAL 2026-09-28), puis pour qui modère Retirer ses pixels et Bannir
// (maquette). L'affichage seul, nourri par `useInspectionPillProps`.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { InspectEntry } from "@liveplace/domain/ports";
import { Check, Flag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Inspection } from "../../state/canvas-store";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { ColorChip } from "../design/palette";
import { Pill, type PillDock } from "../design/pill";
import { Profile } from "../design/profile";
import { TwitchGlyph } from "../design/twitch";
import { formatDateTime } from "../locale/locale";
import { useLocale, useTexts } from "../locale/use-locale";
import type { ModeratedAuthor } from "../moderation/moderation-window";
import type { ModerationControls } from "../moderation/use-moderation";
import { INSPECTION_TEXTS } from "./inspection-texts";
import { formatPlacedAgo } from "./placed-ago";

const DOCK: PillDock = "cr";

// Signaler la pose inspectée (JOURNAL 2026-09-28). `reported` : c'est fait, le bouton le dit et se désactive.
export type ReportControl = { status: "available" | "sending" | "reported"; onReport: () => void };

export type InspectionPillProps = {
  inspection: Inspection | null;
  palette: readonly string[];
  nowMs: number; // pour la date relative
  onClose: () => void;
  report?: ReportControl | undefined; // absent : cette pose ne se signale pas
  moderation?: ModerationControls | undefined; // absente : pas le droit de modérer
  isDocked?: boolean;
};

const CloseButton = ({ onClose }: Pick<InspectionPillProps, "onClose">) => {
  const design = useTexts(DESIGN_TEXTS);
  return <Button icon={X} variant="ghost" title={design.closeTip} onPress={onClose} />;
};

const ReportRow = ({ report }: { report: ReportControl }) => {
  const t = useTexts(INSPECTION_TEXTS);
  return (
    <div className="lp-row lp-row--ruled">
      {report.status === "reported" ? (
        <Button icon={Check} label={t.reported} isDisabled onPress={report.onReport} />
      ) : (
        <Button
          icon={Flag}
          label={t.report}
          isDisabled={report.status === "sending"}
          onPress={report.onReport}
        />
      )}
    </div>
  );
};

type ModerationRowProps = { moderation: ModerationControls; author: InspectEntry };

type RoleRowProps = {
  author: ModeratedAuthor;
  onSetModerator: (author: ModeratedAuthor, isModerator: boolean) => void;
};

// JOURNAL 2026-09-27 : pour le streamer. Nommé ici, il se retire ici ; venu de Twitch seul, il se retire sur Twitch.
const RoleRow = ({ author, onSetModerator }: RoleRowProps) => {
  const t = useTexts(INSPECTION_TEXTS);
  const origin = author.moderatorOrigin;
  if (origin?.isNamedHere)
    return (
      <div className="lp-row">
        <Button label={t.removeModerator} onPress={() => onSetModerator(author, false)} />
      </div>
    );
  if (origin?.isFromTwitch)
    return (
      <div className="lp-row">
        <Badge label={t.twitchModerator} icon={TwitchGlyph} title={t.twitchModeratorTip} />
      </div>
    );
  return (
    <div className="lp-row">
      <Button label={t.makeModerator} onPress={() => onSetModerator(author, true)} />
    </div>
  );
};

// Jamais sur les pixels du streamer, ni sur les siens (maquette). §4.3 : ni sans identifiant.
const ModerationRow = ({ moderation, author }: ModerationRowProps) => {
  const t = useTexts(INSPECTION_TEXTS);
  const { userId } = author;
  if (!userId || moderation.isProtected(userId)) return null;
  const moderated = { ...author, userId };
  return (
    <>
      <div className="lp-row lp-row--ruled">
        <Button label={t.clearTheirPixels} onPress={() => moderation.onModerate("clear", moderated)} />
        <Button label={t.ban} variant="danger" onPress={() => moderation.onModerate("ban", moderated)} />
      </div>
      {moderation.onSetModerator && <RoleRow author={moderated} onSetModerator={moderation.onSetModerator} />}
    </>
  );
};

type InspectedCellProps = Pick<
  InspectionPillProps,
  "palette" | "nowMs" | "onClose" | "report" | "moderation"
> & {
  inspection: Exclude<Inspection, { status: "loading" }>;
};

const InspectedCell = ({ inspection, palette, nowMs, onClose, report, moderation }: InspectedCellProps) => {
  const locale = useLocale();
  const t = useTexts(INSPECTION_TEXTS);
  const coordinates = `(${inspection.x}, ${inspection.y})`;
  if (inspection.status === "empty")
    return (
      <>
        <div className="lp-row">
          <span className="lp-type-body lp-prompt">{t.nobodyYet}</span>
          <span className="lp-spacer" />
          <CloseButton onClose={onClose} />
        </div>
        <span className="lp-type-caption lp-muted lp-prompt">{coordinates}</span>
      </>
    );
  const { entry } = inspection;
  const color = entry.colorIndex === TRANSPARENT_COLOR_INDEX ? undefined : palette[entry.colorIndex];
  return (
    <>
      <div className="lp-row">
        <Profile user={entry} variant="full" />
        <span className="lp-spacer" />
        <CloseButton onClose={onClose} />
      </div>
      <div className="lp-row lp-prompt">
        <ColorChip {...(color ? { color } : {})}>
          <span className="lp-type-numeric" title={color ?? t.transparentEraser}>
            {coordinates}
          </span>
        </ColorChip>
        <span className="lp-type-caption lp-muted" title={t.placedOn(formatDateTime(entry.placedAt, locale))}>
          {formatPlacedAgo(entry.placedAt, nowMs, locale)}
        </span>
      </div>
      {report && <ReportRow report={report} />}
      {moderation && <ModerationRow moderation={moderation} author={entry} />}
    </>
  );
};

type ShownInspection = Exclude<Inspection, { status: "loading" }>;

const toShown = (inspection: Inspection | null): ShownInspection | null =>
  inspection && inspection.status !== "loading" ? inspection : null;

// La pill garde la dernière case montrée : elle s'efface avec elle à la fermeture, et une autre case la remplace
// par un morphing sans qu'elle disparaisse (maquette). À la première ouverture, elle attend la réponse, masquée.
const useShownInspection = (inspection: Inspection | null) => {
  const current = toShown(inspection);
  const [lastShown, setLastShown] = useState<ShownInspection | null>(current);
  const wasVisible = useRef(false);
  const isVisible = inspection !== null && (current !== null || wasVisible.current);
  useEffect(() => {
    wasVisible.current = isVisible;
    if (current) setLastShown(current);
  }, [isVisible, current]);
  return { shown: current ?? lastShown, isVisible };
};

export const InspectionPill = ({
  inspection,
  palette,
  nowMs,
  onClose,
  report,
  moderation,
  isDocked = true,
}: InspectionPillProps) => {
  const { shown, isVisible } = useShownInspection(inspection);
  if (!inspection && !shown) return null;
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout="stack" isVisible={isVisible}>
      {shown && (
        <InspectedCell
          inspection={shown}
          palette={palette}
          nowMs={nowMs}
          onClose={onClose}
          report={report}
          moderation={moderation}
        />
      )}
    </Pill>
  );
};
