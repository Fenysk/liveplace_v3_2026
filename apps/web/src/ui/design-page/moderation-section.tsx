// La modération (JOURNAL 2026-09-25) : la pill Inspection de qui modère, la confirmation, la fenêtre du banni et
// l'onglet Modération. Les vrais composants du jeu, avec des props d'exemple.

import { PALETTE } from "@liveplace/domain";
import type { InspectEntry, Pixel } from "@liveplace/domain/ports";
import { useState } from "react";
import type { Inspection } from "../../state/canvas-store";
import { Button } from "../design/button";
import { InspectionPill } from "../inspection/inspection-pill";
import { BannedUsers, type BannedUsersProps, type BanPreview } from "../moderation/banned-users";
import { BannedWindow } from "../moderation/banned-window";
import {
  type ModerationRequest,
  type ModerationStatus,
  ModerationWindow,
} from "../moderation/moderation-window";
import { ModeratorUsers } from "../moderation/moderator-users";
import { TwitchSyncBlock, type TwitchSyncView } from "../moderation/twitch-sync";
import type { ModerationControls } from "../moderation/use-moderation";
import {
  noop,
  SAMPLE_BANNED_USERS,
  SAMPLE_CANVAS,
  SAMPLE_DRAWING,
  SAMPLE_MODERATORS,
  SAMPLE_OWNER,
  SAMPLE_VIEWER,
} from "./design-fixtures";
import { Specimen, SpecimenSection } from "./specimen-section";

const MINUTE = 60_000;
const LOCKED_MS = 1500; // la démonstration du verrou : l'action, puis la fermeture

const TROLL = {
  userId: "3",
  login: "troll42",
  displayName: "Troll42",
  colorIndex: 5,
  placementId: "pheart001",
};

const MODERATING: ModerationControls = { isProtected: () => false, onModerate: noop };
const PROTECTING: ModerationControls = { isProtected: () => true, onModerate: noop };
const OWNING: ModerationControls = { isProtected: () => false, onModerate: noop, onSetModerator: noop };

// L'auteur d'exemple : sa couleur par défaut, et `moderatorOrigin` quand le streamer inspecte un modérateur.
const inspectionOf = <Author extends Omit<InspectEntry, "colorIndex" | "placedAt">>(
  nowMs: number,
  author: Author,
) =>
  ({
    status: "found",
    x: 122,
    y: 82,
    entry: { colorIndex: 5, ...author, placedAt: nowMs - 3 * MINUTE },
  }) satisfies Inspection;

type WindowDemo = { caption: string; kind: ModerationRequest["kind"]; pixels: readonly Pixel[] | null };

const WINDOW_DEMOS: readonly WindowDemo[] = [
  { caption: "Retirer ses pixels", kind: "clearUser", pixels: SAMPLE_DRAWING },
  { caption: "Bannir", kind: "ban", pixels: SAMPLE_DRAWING },
  { caption: "L'aperçu se charge", kind: "clearUser", pixels: null },
];

// Confirmer montre le verrou, puis la fenêtre se ferme. « Échec » la garde ouverte avec son message.
const ModerationWindowSpecimen = ({ nowMs }: { nowMs: number }) => {
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const [pixels, setPixels] = useState<readonly Pixel[] | null>(null);
  const [status, setStatus] = useState<ModerationStatus>("idle");
  const show = (demo: WindowDemo, shownStatus: ModerationStatus = "idle") => {
    setRequest({ kind: demo.kind, author: inspectionOf(nowMs, TROLL).entry });
    setPixels(demo.pixels);
    setStatus(shownStatus);
  };
  const confirm = () => {
    setStatus("running");
    setTimeout(() => {
      setRequest(null);
      setStatus("idle");
    }, LOCKED_MS);
  };
  return (
    <Specimen caption="La confirmation, dans une petite fenêtre : l'aperçu, le nombre, puis l'action">
      <div className="design-demo-buttons">
        {WINDOW_DEMOS.map((demo) => (
          <Button key={demo.caption} label={demo.caption} onPress={() => show(demo)} />
        ))}
        <Button
          label="Échec"
          onPress={() => show({ caption: "", kind: "ban", pixels: SAMPLE_DRAWING }, "failed")}
        />
      </div>
      <ModerationWindow
        request={request}
        pixels={pixels}
        status={status}
        canvas={SAMPLE_CANVAS}
        onConfirm={confirm}
        onClose={() => setRequest(null)}
      />
    </Specimen>
  );
};

const BannedWindowSpecimen = () => {
  const [pixels, setPixels] = useState<readonly Pixel[] | null>(null);
  return (
    <Specimen caption="Au milieu de l'écran : banni, il ne peut plus que regarder. La preuve, s'il en a">
      <div className="design-demo-buttons">
        <Button label="Avec sa preuve" onPress={() => setPixels(SAMPLE_DRAWING)} />
        <Button label="Sans pixel" onPress={() => setPixels([])} />
      </div>
      <BannedWindow
        isOpen={pixels !== null}
        pixels={pixels}
        canvas={SAMPLE_CANVAS}
        onClose={() => setPixels(null)}
      />
    </Specimen>
  );
};

const TAB_BASE: Omit<BannedUsersProps, "list"> = {
  preview: null,
  unbanningUserId: null,
  canvas: SAMPLE_CANVAS,
  onPreview: noop,
  onUnban: noop,
};

// L'œil ouvre une vraie fenêtre (JOURNAL 2026-09-27) : figée « ouverte » avec `onPreview: noop`, elle capturerait le
// focus sans qu'on puisse la refermer. Cette illustration reste interactive, comme BannedWindowSpecimen.
const BannedUsersSpecimen = () => {
  const [preview, setPreview] = useState<BanPreview | null>(null);
  const onPreview = (userId: string) =>
    setPreview((shown) => (shown?.userId === userId ? null : { userId, pixels: SAMPLE_DRAWING }));
  return (
    <Specimen caption="Les bannis : l'œil ouvre l'aperçu de ses pixels, dans une fenêtre">
      <div className="design-window-box">
        <BannedUsers
          list={{ status: "ready", users: SAMPLE_BANNED_USERS }}
          preview={preview}
          unbanningUserId={null}
          canvas={SAMPLE_CANVAS}
          onPreview={onPreview}
          onUnban={noop}
        />
      </div>
    </Specimen>
  );
};

const TAB_STATES: readonly { caption: string; props: BannedUsersProps }[] = [
  {
    caption: "Débannir attend sa réponse",
    props: { ...TAB_BASE, list: { status: "ready", users: SAMPLE_BANNED_USERS }, unbanningUserId: "4" },
  },
  { caption: "Personne n'est banni", props: { ...TAB_BASE, list: { status: "ready", users: [] } } },
  { caption: "La liste se charge", props: { ...TAB_BASE, list: { status: "loading" } } },
  { caption: "Connexion perdue", props: { ...TAB_BASE, list: { status: "failed" } } },
];

const SYNC_STATES = (nowMs: number): readonly { caption: string; sync: TwitchSyncView }[] => [
  { caption: "Pour le streamer, jamais synchronisé", sync: { status: "never" } },
  { caption: "Pour le streamer, synchronisé", sync: { status: "ok", syncedAt: nowMs - 3 * MINUTE } },
  {
    caption: "Pour le streamer, accès retiré sur Twitch : à refaire",
    sync: { status: "revoked", syncedAt: nowMs - 90 * MINUTE },
  },
];

export const ModerationSection = () => {
  const [nowMs] = useState(() => Date.now());
  return (
    <section className="design-section" aria-labelledby="design-moderation">
      <h2 id="design-moderation" className="lp-type-heading">
        La modération
      </h2>

      <SpecimenSection
        title="Inspection, pour qui modère"
        note="Sous un filet : Retirer ses pixels et Bannir. Rien sur les pixels du streamer ni sur les siens."
      >
        <Specimen caption="Le pixel d'un autre">
          <InspectionPill
            inspection={inspectionOf(nowMs, TROLL)}
            palette={PALETTE}
            nowMs={nowMs}
            onClose={noop}
            moderation={MODERATING}
            isDocked={false}
          />
        </Specimen>
        <Specimen caption="Le pixel du streamer, ou le sien">
          <InspectionPill
            inspection={inspectionOf(nowMs, { userId: "1", ...SAMPLE_OWNER, placementId: "pdemo0001" })}
            palette={PALETTE}
            nowMs={nowMs}
            onClose={noop}
            moderation={PROTECTING}
            isDocked={false}
          />
        </Specimen>
        <Specimen caption="Pour le streamer : nommer modérateur">
          <InspectionPill
            inspection={inspectionOf(nowMs, TROLL)}
            palette={PALETTE}
            nowMs={nowMs}
            onClose={noop}
            moderation={OWNING}
            isDocked={false}
          />
        </Specimen>
        <Specimen caption="Pour le streamer : un modérateur venu de Twitch">
          <InspectionPill
            inspection={inspectionOf(nowMs, {
              ...TROLL,
              moderatorOrigin: { isFromTwitch: true, isNamedHere: false },
            })}
            palette={PALETTE}
            nowMs={nowMs}
            onClose={noop}
            moderation={OWNING}
            isDocked={false}
          />
        </Specimen>
        <Specimen caption="Sans photo">
          <InspectionPill
            inspection={inspectionOf(nowMs, { userId: "2", ...SAMPLE_VIEWER, placementId: "pdemo0002" })}
            palette={PALETTE}
            nowMs={nowMs}
            onClose={noop}
            moderation={MODERATING}
            isDocked={false}
          />
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="Les fenêtres"
        note="Échap ou Annuler les ferment ; verrouillées pendant l'action."
      >
        <ModerationWindowSpecimen nowMs={nowMs} />
        <BannedWindowSpecimen />
      </SpecimenSection>

      <SpecimenSection
        title="L'onglet Modération"
        note="Dans la fenêtre, pour le streamer et ses modérateurs."
      >
        {SYNC_STATES(nowMs).map(({ caption, sync }) => (
          <Specimen key={caption} caption={caption}>
            <div className="design-window-box">
              <TwitchSyncBlock sync={sync} syncHref="#" onSync={noop} />
            </div>
          </Specimen>
        ))}
        <Specimen caption="Les modérateurs : de Twitch, nommé ici, pas encore sur LivePlace">
          <div className="design-window-box">
            <ModeratorUsers list={{ status: "ready", users: SAMPLE_MODERATORS }} onRemove={noop} />
          </div>
        </Specimen>
        <BannedUsersSpecimen />
        {TAB_STATES.map(({ caption, props }) => (
          <Specimen key={caption} caption={caption}>
            <div className="design-window-box">
              <BannedUsers {...props} />
            </div>
          </Specimen>
        ))}
      </SpecimenSection>
    </section>
  );
};
