// La pill Inspection (CDC 2026), au centre à droite : l'auteur du pixel inspecté, sa couleur, sa date de pose.
// Sous un filet, Signaler pour tout compte (JOURNAL 2026-09-28), puis pour qui modère Retirer ses pixels et Bannir
// (maquette). L'affichage seul, nourri par `useInspectionPillProps`.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { InspectEntry } from "@liveplace/domain/ports";
import { Check, Flag, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Inspection } from "../../state/canvas-store";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { ColorChip } from "../design/palette";
import { Pill, type PillDock } from "../design/pill";
import { Profile } from "../design/profile";
import { SkeletonBar, SkeletonBlock, SkeletonProfile, SkeletonSlot } from "../design/skeleton";
import { TwitchGlyph } from "../design/twitch";
import { useAfterDelay } from "../design/use-after-delay";
import { SKELETON_DELAY_MS } from "../design/use-skeleton-phase";
import { formatDateTime } from "../locale/locale";
import { useLocale, useTexts } from "../locale/use-locale";
import { canBan } from "../moderation/can-ban";
import type { ModeratedAuthor } from "../moderation/moderation-window";
import type { ModerationControls } from "../moderation/use-moderation";
import { INSPECTION_TEXTS } from "./inspection-texts";
import {
  NOTHING_SHOWN,
  type PillContent,
  type PillState,
  type ShownInspection,
  toPillState,
} from "./pill-content";
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

// Jamais sur les pixels du streamer, ni sur les siens (maquette). §4.3 : ni sans identifiant. Écart §5.4 (JOURNAL
// 2026-10-08) : pas de Bannir sur un modérateur nommé ici.
const ModerationRow = ({ moderation, author }: ModerationRowProps) => {
  const t = useTexts(INSPECTION_TEXTS);
  const { userId } = author;
  if (!userId || moderation.isProtected(userId)) return null;
  const moderated = { ...author, userId };
  return (
    <>
      <div className="lp-row lp-row--ruled">
        <Button label={t.clearTheirPixels} onPress={() => moderation.onModerate("clear", moderated)} />
        {canBan(moderated) && (
          <Button label={t.ban} variant="danger" onPress={() => moderation.onModerate("ban", moderated)} />
        )}
      </div>
      {moderation.onSetModerator && <RoleRow author={moderated} onSetModerator={moderation.onSetModerator} />}
    </>
  );
};

type InspectedCellProps = Pick<
  InspectionPillProps,
  "palette" | "nowMs" | "onClose" | "report" | "moderation"
> & {
  inspection: ShownInspection;
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

// La case attendue : sa forme, avec les coordonnées qu'on connaît déjà. La couleur et la date arrivent avec la réponse.
type SkeletonCellProps = Pick<InspectionPillProps, "onClose"> & { x: number; y: number };

const SkeletonCell = ({ x, y, onClose }: SkeletonCellProps) => (
  <>
    <div className="lp-row">
      <SkeletonProfile />
      <span className="lp-spacer" />
      <CloseButton onClose={onClose} />
    </div>
    <div className="lp-row lp-prompt">
      <span className="lp-color-chip">
        <SkeletonBlock shape="swatch" />
        <span className="lp-type-numeric">{`(${x}, ${y})`}</span>
      </span>
      <SkeletonBar text="caption" width="medium" />
    </div>
  </>
);

type PillBodyProps = Pick<InspectionPillProps, "palette" | "nowMs" | "onClose" | "report" | "moderation"> & {
  content: PillContent;
};

// Un squelette que la case remplace paraît en fondu ; sans squelette vu, elle paraît seule, comme avant.
const PillBody = ({ content, onClose, ...cell }: PillBodyProps) => {
  if (content.kind === "skeleton")
    return (
      <SkeletonSlot phase="shown" skeleton={<SkeletonCell x={content.x} y={content.y} onClose={onClose} />}>
        {null}
      </SkeletonSlot>
    );
  return (
    <SkeletonSlot phase={content.isAfterSkeleton ? "revealed" : "ready"} skeleton={null}>
      <InspectedCell inspection={content.inspection} onClose={onClose} {...cell} />
    </SkeletonSlot>
  );
};

// La pill garde ce qu'elle a montré : elle s'efface avec à la fermeture, et une autre case la remplace par un morphing sans
// qu'elle disparaisse (maquette). À la première ouverture, une réponse qui tarde plus de 200 ms ouvre la pill sur un
// squelette ; avant, elle reste fermée et s'ouvre directement sur la case (pill-content.ts).
const usePillState = (inspection: Inspection | null): PillState => {
  const isWaited = useAfterDelay(inspection?.status === "loading", SKELETON_DELAY_MS);
  const previous = useRef(NOTHING_SHOWN);
  const state = toPillState(inspection, isWaited, previous.current);
  useEffect(() => {
    previous.current = state;
  });
  return state;
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
  const { content, isVisible } = usePillState(inspection);
  if (!content) return null;
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout="stack" isVisible={isVisible}>
      <PillBody
        content={content}
        palette={palette}
        nowMs={nowMs}
        onClose={onClose}
        report={report}
        moderation={moderation}
      />
    </Pill>
  );
};
