// La modération (JOURNAL 2026-09-25) : la pill Inspection, la section Modération de la fenêtre (signalements compris,
// JOURNAL 2026-09-28), la confirmation et la fenêtre du banni. Les vrais composants, avec des props d'exemple.

import { HOUR_MS, MINUTE_MS, PALETTE } from "@liveplace/domain";
import type { AuthoredPixel, InspectEntry } from "@liveplace/domain/ports";
import { useEffect, useState } from "react";
import type { Inspection } from "../../state/canvas-store";
import { Button } from "../design/button";
import { InspectionPill, type ReportControl } from "../inspection/inspection-pill";
import { BannedUsers, type BannedUsersProps, type BanPreview } from "../moderation/banned-users";
import { BannedWindow } from "../moderation/banned-window";
import { type ClearScope, listClearedPixels, PLACEMENT_ONLY } from "../moderation/cleared-pixels";
import {
  type ModerationRequest,
  type ModerationStatus,
  ModerationWindow,
} from "../moderation/moderation-window";
import { ModeratorUsers } from "../moderation/moderator-users";
import { pendingReportKey } from "../moderation/pending-reports";
import { ReportedPlacements, type ReportedPlacementsProps } from "../moderation/reported-placements";
import { TwitchSyncBlock, type TwitchSyncView } from "../moderation/twitch-sync";
import type { ModerationControls } from "../moderation/use-moderation";
import {
  noop,
  SAMPLE_BANNED_USERS,
  SAMPLE_CANVAS,
  SAMPLE_DRAWING,
  SAMPLE_MODERATORS,
  SAMPLE_OWNER,
  SAMPLE_PLACEMENT_ID,
  SAMPLE_VIEWER,
  samplePlacements,
  sampleReports,
} from "./design-fixtures";
import { Block, DIALOG_NOTE, Entry, InWindow, OpenWindow, StateRow, useNowMs } from "./entry-layout";

const LOCKED_MS = 1500; // la démonstration du verrou : l'action, puis la fermeture

const TROLL = {
  userId: "3",
  login: "troll42",
  displayName: "Troll42",
  colorIndex: 5,
  placementId: SAMPLE_PLACEMENT_ID,
};

// Écart §5.4 (JOURNAL 2026-10-08) : un modérateur nommé ici ne se bannit pas.
const NAMED_HERE = { isFromTwitch: false, isNamedHere: true };

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
    entry: { colorIndex: 5, ...author, placedAt: nowMs - 3 * MINUTE_MS },
  }) satisfies Inspection;

type InspectionScene = {
  name: string;
  detail?: string;
  inspection: Inspection;
  report?: ReportControl;
  moderation?: ModerationControls;
};

const FOR_ALL = (nowMs: number): readonly InspectionScene[] => [
  {
    name: "En attente de la réponse",
    detail: "La pill s'ouvre sur un squelette si la réponse tarde plus de 200 ms.",
    inspection: { status: "loading", x: 122, y: 82 },
  },
  {
    name: "Un pixel et son auteur",
    inspection: {
      status: "found",
      x: 12,
      y: 40,
      entry: {
        userId: "1",
        ...SAMPLE_OWNER,
        colorIndex: 28,
        placedAt: nowMs - 3 * HOUR_MS,
        placementId: "pdemo0001",
      },
    },
  },
  {
    name: "Un auteur sans photo, une case gommée",
    inspection: {
      status: "found",
      x: 3,
      y: 7,
      entry: {
        userId: "2",
        ...SAMPLE_VIEWER,
        colorIndex: 0,
        placedAt: nowMs - 90_000,
        placementId: "pdemo0002",
      },
    },
  },
  {
    name: "La pose d'un autre",
    detail: "Signaler.",
    inspection: {
      status: "found",
      x: 122,
      y: 82,
      entry: {
        ...SAMPLE_VIEWER,
        colorIndex: 5,
        placedAt: nowMs - 90_000,
        placementId: "pdemo0003",
        canReport: true,
      },
    },
    report: { status: "available", onReport: noop },
  },
  {
    name: "Une fois signalée",
    inspection: {
      status: "found",
      x: 122,
      y: 82,
      entry: { ...SAMPLE_VIEWER, colorIndex: 5, placedAt: nowMs - 90_000, placementId: "pdemo0003" },
    },
    report: { status: "reported", onReport: noop },
  },
  { name: "Une case jamais posée", inspection: { status: "empty", x: 200, y: 180 } },
];

const FOR_MODERATORS = (nowMs: number): readonly InspectionScene[] => [
  { name: "Le pixel d'un autre", inspection: inspectionOf(nowMs, TROLL), moderation: MODERATING },
  {
    name: "Inspection d'un modérateur LivePlace : sans Bannir",
    detail: "Nommé ici, il ne se bannit pas : le streamer lui retire d'abord son rôle.",
    inspection: inspectionOf(nowMs, { ...TROLL, moderatorOrigin: NAMED_HERE }),
    moderation: MODERATING,
  },
  {
    name: "Le pixel du streamer, ou le sien",
    inspection: inspectionOf(nowMs, { userId: "1", ...SAMPLE_OWNER, placementId: "pdemo0001" }),
    moderation: PROTECTING,
  },
  {
    name: "Sans photo",
    inspection: inspectionOf(nowMs, { userId: "2", ...SAMPLE_VIEWER, placementId: "pdemo0002" }),
    moderation: MODERATING,
  },
];

const FOR_OWNER = (nowMs: number): readonly InspectionScene[] => [
  { name: "Nommer modérateur", inspection: inspectionOf(nowMs, TROLL), moderation: OWNING },
  {
    name: "Un modérateur venu de Twitch",
    inspection: inspectionOf(nowMs, {
      ...TROLL,
      moderatorOrigin: { isFromTwitch: true, isNamedHere: false },
    }),
    moderation: OWNING,
  },
  {
    name: "Un modérateur nommé ici",
    detail: "Retirer modérateur, et pas de Bannir.",
    inspection: inspectionOf(nowMs, { ...TROLL, moderatorOrigin: NAMED_HERE }),
    moderation: OWNING,
  },
];

const InspectionBlock = ({
  title,
  note,
  nowMs,
  scenes,
}: {
  title: string;
  note?: string;
  nowMs: number;
  scenes: readonly InspectionScene[];
}) => (
  <Block title={title} note={note}>
    {scenes.map(({ name, detail, inspection, report, moderation }) => (
      <StateRow key={name} name={name} detail={detail}>
        <InspectionPill
          inspection={inspection}
          palette={PALETTE}
          nowMs={nowMs}
          onClose={noop}
          report={report}
          moderation={moderation}
          isDocked={false}
        />
      </StateRow>
    ))}
  </Block>
);

// Toucher une case : la réponse arrive après `replyMs`. Sous 200 ms, la pill s'ouvre directement sur la case ; au-delà, sur un
// squelette que la case remplace.
const InspectionReplyScene = ({ replyMs, nowMs }: { replyMs: number; nowMs: number }) => {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  useEffect(() => {
    if (inspection?.status !== "loading") return;
    const timer = setTimeout(() => setInspection(inspectionOf(nowMs, TROLL)), replyMs);
    return () => clearTimeout(timer);
  }, [inspection, replyMs, nowMs]);
  return (
    <div className="design-delay-scene">
      <Button
        label={`Réponse en ${replyMs} ms`}
        onPress={() => setInspection({ status: "loading", x: 122, y: 82 })}
      />
      <InspectionPill
        inspection={inspection}
        palette={PALETTE}
        nowMs={nowMs}
        onClose={() => setInspection(null)}
        isDocked={false}
      />
    </div>
  );
};

export const InspectionEntry = () => {
  const nowMs = useNowMs();
  return (
    <Entry
      slug="inspection"
      components={["InspectionPill"]}
      file="ui/inspection/inspection-pill.tsx"
      note="Seulement pendant une inspection, en mode Vue."
      where="Au centre à droite · sur mobile, au-dessus de la barre du bas · en paysage, en bas à gauche"
    >
      <Block
        title="Au toucher"
        note="Touche : la pill s'ouvre sans attendre le serveur, sur un squelette si la réponse dépasse 200 ms."
      >
        <StateRow name="Réponse rapide" detail="Elle s'ouvre directement sur la case." isDemo>
          <InspectionReplyScene replyMs={100} nowMs={nowMs} />
        </StateRow>
        <StateRow name="Réponse lente" detail="Le squelette paraît à 200 ms, la case le remplace." isDemo>
          <InspectionReplyScene replyMs={2000} nowMs={nowMs} />
        </StateRow>
      </Block>
      <InspectionBlock title="Pour tous" nowMs={nowMs} scenes={FOR_ALL(nowMs)} />
      <InspectionBlock
        title="Pour qui modère"
        note="Sous un filet : Retirer ses pixels et Bannir, sauf sur un modérateur nommé ici. Rien sur les pixels du streamer ni sur les siens."
        nowMs={nowMs}
        scenes={FOR_MODERATORS(nowMs)}
      />
      <InspectionBlock title="Pour le streamer" nowMs={nowMs} scenes={FOR_OWNER(nowMs)} />
    </Entry>
  );
};

const BANNED_USERS_BASE: Omit<BannedUsersProps, "list"> = {
  preview: null,
  unbanningUserId: null,
  canvas: SAMPLE_CANVAS,
  onPreview: noop,
  onUnban: noop,
};

// L'œil ouvre une vraie fenêtre (JOURNAL 2026-09-27) : figée « ouverte » avec `onPreview: noop`, elle capturerait le
// focus sans qu'on puisse la refermer. Cette illustration reste interactive.
const BannedUsersScene = () => {
  const [preview, setPreview] = useState<BanPreview | null>(null);
  const onPreview = (userId: string) =>
    setPreview((shown) => (shown?.userId === userId ? null : { userId, pixels: SAMPLE_DRAWING }));
  return (
    <InWindow>
      <BannedUsers
        list={{ status: "ready", users: SAMPLE_BANNED_USERS }}
        preview={preview}
        unbanningUserId={null}
        canvas={SAMPLE_CANVAS}
        onPreview={onPreview}
        onUnban={noop}
      />
    </InWindow>
  );
};

const BANNED_STATES: readonly { name: string; props: BannedUsersProps }[] = [
  {
    name: "Débannir attend sa réponse",
    props: {
      ...BANNED_USERS_BASE,
      list: { status: "ready", users: SAMPLE_BANNED_USERS },
      unbanningUserId: "4",
    },
  },
  { name: "Personne n'est banni", props: { ...BANNED_USERS_BASE, list: { status: "ready", users: [] } } },
  { name: "La liste se charge", props: { ...BANNED_USERS_BASE, list: { status: "loading" } } },
  { name: "Connexion perdue", props: { ...BANNED_USERS_BASE, list: { status: "failed" } } },
];

const REPORTS_BASE = (nowMs: number): Omit<ReportedPlacementsProps, "list"> => ({
  approvingReportKey: null,
  canvas: SAMPLE_CANVAS,
  nowMs,
  onClear: noop,
  onBan: noop,
  onApprove: noop,
});

const REPORT_STATES = (
  nowMs: number,
): readonly { name: string; detail?: string; props: ReportedPlacementsProps }[] => {
  const reports = sampleReports(nowMs);
  const [approving] = reports;
  return [
    {
      name: "Trois signalements",
      detail: "Une pose cachée du stream, une pose en attente du seuil, un dessin de plusieurs poses.",
      props: { ...REPORTS_BASE(nowMs), list: { status: "ready", reports } },
    },
    {
      name: "Un modérateur LivePlace signalé : sans Bannir",
      detail: "Nommé ici, il ne se bannit pas.",
      props: {
        ...REPORTS_BASE(nowMs),
        list: {
          status: "ready",
          reports: reports.slice(1, 2).map((report) => ({ ...report, moderatorOrigin: NAMED_HERE })),
        },
      },
    },
    {
      name: "Rétablir attend sa réponse",
      props: {
        ...REPORTS_BASE(nowMs),
        list: { status: "ready", reports: reports.slice(0, 1) },
        approvingReportKey: approving ? pendingReportKey(approving) : null,
      },
    },
    { name: "Aucun signalement", props: { ...REPORTS_BASE(nowMs), list: { status: "ready", reports: [] } } },
  ];
};

const SYNC_STATES = (nowMs: number): readonly { name: string; detail?: string; sync: TwitchSyncView }[] => [
  { name: "Pour le streamer, jamais synchronisé", sync: { status: "never" } },
  { name: "Pour le streamer, synchronisé", sync: { status: "ok", syncedAt: nowMs - 3 * MINUTE_MS } },
  {
    name: "Pour le streamer, accès retiré sur Twitch",
    detail: "À refaire.",
    sync: { status: "revoked", syncedAt: nowMs - 90 * MINUTE_MS },
  },
];

export const ModerationEntry = () => {
  const nowMs = useNowMs();
  return (
    <Entry
      slug="moderation"
      components={["ReportedPlacements", "TwitchSyncBlock", "ModeratorUsers", "BannedUsers"]}
      file="ui/moderation/{reported-placements,twitch-sync,moderator-users,banned-users}.tsx"
      note="Dans la fenêtre, pour le streamer et ses modérateurs. Une connexion coupée est lue tout de suite par un lecteur d'écran. Les lignes de chaque liste arrivent en fondu, toutes ensemble (hors mouvement réduit)."
    >
      <Block title="Signalements">
        {REPORT_STATES(nowMs).map(({ name, detail, props }) => (
          <StateRow key={name} name={name} detail={detail}>
            <InWindow>
              <ReportedPlacements {...props} />
            </InWindow>
          </StateRow>
        ))}
      </Block>
      <Block title="Synchronisation Twitch">
        {SYNC_STATES(nowMs).map(({ name, detail, sync }) => (
          <StateRow key={name} name={name} detail={detail}>
            <InWindow>
              <TwitchSyncBlock sync={sync} syncHref="#" onSync={noop} />
            </InWindow>
          </StateRow>
        ))}
      </Block>
      <Block title="Modérateurs">
        <StateRow name="Les modérateurs" detail="De Twitch, nommé ici, pas encore sur LivePlace.">
          <InWindow>
            <ModeratorUsers list={{ status: "ready", users: SAMPLE_MODERATORS }} onRemove={noop} />
          </InWindow>
        </StateRow>
      </Block>
      <Block title="Bannis">
        <StateRow name="Les bannis" detail="L'œil ouvre l'aperçu de ses pixels, dans une fenêtre." isDemo>
          <BannedUsersScene />
        </StateRow>
        {BANNED_STATES.map(({ name, props }) => (
          <StateRow key={name} name={name}>
            <InWindow>
              <BannedUsers {...props} />
            </InWindow>
          </StateRow>
        ))}
      </Block>
    </Entry>
  );
};

type WindowDemo = {
  name: string;
  kind: ModerationRequest["kind"];
  isLoading?: boolean;
  isFailing?: boolean;
  scope?: ClearScope;
};

// Retirer ses pixels : décochée, cette pose seule, puis le curseur à 15 min ; cochée, tous ses pixels. Puis la
// question qui suit un retrait, et Signaler, avec la même plage mais sans la case (JOURNAL 2026-09-29).
const WINDOW_DEMOS: readonly WindowDemo[] = [
  { name: "Retirer ses pixels", kind: "clear" },
  { name: "Plage de 15 min", kind: "clear", scope: { isAll: false, spanMs: 15 * MINUTE_MS } },
  { name: "Tous ses pixels", kind: "clear", scope: { isAll: true, spanMs: 0 } },
  { name: "Bannir", kind: "ban" },
  { name: "Bannir, après un retrait", kind: "banAfterClear" },
  { name: "Signaler", kind: "report" },
  { name: "Signaler, plage de 5 min", kind: "report", scope: { isAll: false, spanMs: 5 * MINUTE_MS } },
  { name: "L'aperçu se charge", kind: "clear", isLoading: true },
  { name: "Échec", kind: "ban", isFailing: true },
];

const REPORTED_CELL = { x: 122, y: 82, displayName: TROLL.displayName, placementId: TROLL.placementId };

const requestOf = (kind: ModerationRequest["kind"]): ModerationRequest =>
  kind === "report" ? { kind, author: REPORTED_CELL } : { kind, author: TROLL };

// Confirmer montre le verrou, puis la fenêtre se ferme ; après Retirer, elle propose de bannir. « Échec » la garde
// ouverte avec son message. La case et le curseur marchent : l'aperçu les suit, comme dans le jeu.
const ModerationRow = ({ demo, nowMs }: { demo: WindowDemo; nowMs: number }) => {
  const [request, setRequest] = useState<ModerationRequest>(requestOf(demo.kind));
  const [pixels, setPixels] = useState<readonly AuthoredPixel[] | null>(null);
  const [scope, setScope] = useState<ClearScope>(PLACEMENT_ONLY);
  const [status, setStatus] = useState<ModerationStatus>("idle");
  const hasScope = request.kind === "clear" || request.kind === "report";
  const shown = pixels && hasScope ? listClearedPixels(pixels, TROLL, scope) : pixels;
  const show = () => {
    setRequest(requestOf(demo.kind));
    setPixels(demo.isLoading ? null : samplePlacements(nowMs));
    setScope(demo.scope ?? PLACEMENT_ONLY);
    setStatus(demo.isFailing ? "failed" : "idle");
  };
  return (
    <StateRow name={demo.name}>
      <OpenWindow onOpen={show}>
        {({ isOpen, close }) => (
          <ModerationWindow
            request={isOpen ? request : null}
            pixels={shown}
            scope={scope}
            status={status}
            canvas={SAMPLE_CANVAS}
            onScope={setScope}
            onConfirm={() => {
              setStatus("running");
              setTimeout(() => {
                setStatus("idle");
                if (request.kind === "clear") setRequest(requestOf("banAfterClear"));
                else close();
              }, LOCKED_MS);
            }}
            onClose={close}
          />
        )}
      </OpenWindow>
    </StateRow>
  );
};

export const ModerationWindowEntry = () => {
  const nowMs = useNowMs();
  return (
    <Entry
      slug="retirer-bannir-signaler"
      components={["ModerationWindow"]}
      file="ui/moderation/moderation-window.tsx"
      note={`${DIALOG_NOTE} Un lecteur d'écran entend le décompte quand l'aperçu arrive, la question qui suit un retrait, et l'échec.`}
    >
      <Block title="États">
        {WINDOW_DEMOS.map((demo) => (
          <ModerationRow key={demo.name} demo={demo} nowMs={nowMs} />
        ))}
      </Block>
    </Entry>
  );
};

export const BannedWindowEntry = () => (
  <Entry
    slug="banni"
    components={["BannedWindow"]}
    file="ui/moderation/banned-window.tsx"
    note="Banni, il ne peut plus que regarder. La preuve, s'il en a."
    where="Au milieu de l'écran"
  >
    <Block title="États">
      {[
        { name: "Avec sa preuve", pixels: SAMPLE_DRAWING },
        { name: "Sans pixel", pixels: [] },
      ].map(({ name, pixels }) => (
        <StateRow key={name} name={name}>
          <OpenWindow>
            {({ isOpen, close }) => (
              <BannedWindow isOpen={isOpen} pixels={pixels} canvas={SAMPLE_CANVAS} onClose={close} />
            )}
          </OpenWindow>
        </StateRow>
      ))}
    </Block>
  </Entry>
);
