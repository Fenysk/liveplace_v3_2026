// Plusieurs canvas (Écart §15, JOURNAL 2026-10-06) : le bandeau d'une archive, la section Archives de la fenêtre et ses
// confirmations, dans chacun de leurs états. Les vrais composants.

import { HOUR_MS, MAX_ARCHIVES } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { toBase64 } from "@liveplace/shared";
import { useState } from "react";
import type { ProgressChoice } from "../../usecase/canvas-switch";
import type { ListedArchive, ListedCanvas, ListedCanvases, Thumbnail } from "../../usecase/list-canvases";
import { ArchiveBanner } from "../archive/archive-banner";
import { bannerCaption, bannerTitle, type SwitchFailure, startingTheme } from "../archive/archive-texts";
import { type ArchivesList, ArchivesSection } from "../archive/canvas-cards";
import { DownloadWindow } from "../archive/download-window";
import type { PngBackground } from "../archive/png-export";
import { DiscardWindow, type SwitchRequest, type SwitchStatus, SwitchWindow } from "../archive/switch-window";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { noop, SAMPLE_DRAWING, SAMPLE_OWNER } from "./design-fixtures";
import { Block, DIALOG_NOTE, Entry, InPhone, InWindow, OpenWindow, StateRow, useNowMs } from "./entry-layout";

const DAY_MS = 24 * HOUR_MS;
const LOCKED_MS = 1500; // la démonstration du verrou : l'action, puis la fermeture

// Un canvas de 50 × 50 cases : le petit cœur des exemples, posé au milieu.
const SIZE = 50;
const thumbnailOf = (pixels: readonly Pixel[]): Thumbnail => {
  const state = new Uint8Array(SIZE * SIZE);
  for (const { x, y, colorIndex } of pixels) state[(y - 70) * SIZE + (x - 108)] = colorIndex;
  return { width: SIZE, height: SIZE, state: toBase64(state) };
};

const HEART = thumbnailOf(SAMPLE_DRAWING);
const BLANK = { width: SIZE, height: SIZE, state: toBase64(new Uint8Array(SIZE * SIZE)) };

const sampleActive = (nowMs: number, more: Partial<ListedCanvas> = {}): ListedCanvas => ({
  canvasId: "canvas-actif",
  createdAt: nowMs - 2 * DAY_MS,
  thumbnail: BLANK,
  ...more,
});

const sampleArchive = (nowMs: number, index: number, more: Partial<ListedArchive> = {}): ListedArchive => ({
  canvasId: `archive-${index}`,
  createdAt: nowMs - (30 - 6 * index) * DAY_MS,
  archivedAt: nowMs - (24 - 6 * index) * DAY_MS,
  linkCode: `code${index}xxxxx`,
  thumbnail: index % 2 === 0 ? HEART : BLANK,
  ...more,
});

const LONG_THEME = "Grande pixel war de la rentrée des lives";

const withArchives = (nowMs: number, count: number): ListedCanvases => ({
  active: sampleActive(nowMs, { thumbnail: HEART }),
  archives: Array.from({ length: count }, (_, index) =>
    sampleArchive(nowMs, index + 1, index === 0 ? { theme: "Soirée de lancement" } : {}),
  ).reverse(),
});

type BannerSceneProps = { archive: ListedArchive; isDownloading?: boolean; isCompact?: boolean };

// Le vrai bandeau, avec les vrais textes : le streamer de démonstration, et les dates d'une archive d'exemple.
const BannerScene = ({ archive, isDownloading = false, isCompact = false }: BannerSceneProps) => {
  const text = {
    displayName: SAMPLE_OWNER.displayName,
    theme: archive.theme,
    createdAt: archive.createdAt,
    archivedAt: archive.archivedAt,
  };
  return (
    <ArchiveBanner
      owner={SAMPLE_OWNER}
      title={bannerTitle(text, "fr")}
      caption={bannerCaption(text, "fr")}
      isDownloading={isDownloading}
      onCopyLink={noop}
      onDownload={noop}
      isCompact={isCompact}
      isDocked={false}
    />
  );
};

export const ArchiveBannerEntry = () => {
  const nowMs = useNowMs();
  const archive = sampleArchive(nowMs, 2);
  const themed = { ...archive, theme: "Soirée de lancement" };
  return (
    <Entry
      slug="bandeau-d-archive"
      components={["ArchiveBanner"]}
      file="ui/archive/archive-banner.tsx"
      note="À la place de la pill Fresque : à qui est l'archive (son avatar et son nom mènent à sa fresque en cours), son titre et sa légende, le lien à copier, le PNG."
      where="En haut à gauche"
    >
      <Block title="États">
        <StateRow name="Sans thème" detail="« Archive de … », la légende dit les dates.">
          <BannerScene archive={archive} />
        </StateRow>
        <StateRow
          name="Avec un thème"
          detail="Le thème est le titre, la légende dit à qui est l'archive, puis les dates."
        >
          <BannerScene archive={themed} />
        </StateRow>
        <StateRow name="Le PNG se prépare" detail="Télécharger attend.">
          <BannerScene archive={archive} isDownloading />
        </StateRow>
      </Block>
      <Block title="Sur mobile">
        <StateRow
          name="Version compacte"
          detail="Les actions n'ont que leur icône, la pill Compte garde sa place."
        >
          <InPhone>
            <BannerScene archive={themed} isCompact />
          </InPhone>
        </StateRow>
      </Block>
    </Entry>
  );
};

type ListScene = { name: string; detail?: string; list: ArchivesList };

const LISTS = (nowMs: number): readonly ListScene[] => [
  {
    name: "Sans archive",
    detail: "« Archives · 0 sur 5 », la ligne de la fresque en cours, et une phrase.",
    list: { status: "ready", canvases: withArchives(nowMs, 0) },
  },
  {
    name: "Deux archives, de la plus récente à la plus ancienne",
    detail: "Un thème en titre, sinon les dates.",
    list: { status: "ready", canvases: withArchives(nowMs, 2) },
  },
  {
    name: `${MAX_ARCHIVES} archives`,
    detail: "Archiver est inactif, et la phrase dessous dit de supprimer une archive d'abord.",
    list: { status: "ready", canvases: withArchives(nowMs, MAX_ARCHIVES) },
  },
  {
    name: "La fresque en cours avec un thème, rouverte d'une archive",
    detail: "Le thème en titre, « depuis le … » en légende.",
    list: {
      status: "ready",
      canvases: {
        active: sampleActive(nowMs, { theme: "Printemps", linkCode: "kept123456", thumbnail: HEART }),
        archives: [sampleArchive(nowMs, 1)],
      },
    },
  },
  {
    name: "Un thème de 40 caractères, le maximum",
    detail: "Le titre passe à la ligne, l'icône d'ouverture le suit.",
    list: {
      status: "ready",
      canvases: {
        active: sampleActive(nowMs, { theme: LONG_THEME, thumbnail: HEART }),
        archives: [sampleArchive(nowMs, 1, { theme: LONG_THEME })],
      },
    },
  },
  {
    name: "Redis n'a plus l'image d'une fresque",
    detail: "Le damier à la place de la miniature.",
    list: {
      status: "ready",
      canvases: {
        active: sampleActive(nowMs, { thumbnail: null }),
        archives: [sampleArchive(nowMs, 1, { thumbnail: null })],
      },
    },
  },
  { name: "En chargement", list: { status: "loading" } },
  { name: "La lecture a échoué", detail: "Réessayer.", list: { status: "failed" } },
];

const ArchivesScene = ({ list }: { list: ArchivesList }) => (
  <ArchivesSection
    list={list}
    login="kalyss"
    onArchive={noop}
    onCopyLink={noop}
    onReopen={noop}
    onDiscard={noop}
    onRetry={noop}
  />
);

export const ArchivesEntry = () => {
  const nowMs = useNowMs();
  return (
    <Entry
      slug="archives"
      components={["ArchivesSection"]}
      file="ui/archive/canvas-cards.tsx"
      note="Pour le streamer seul, à côté de Fresque : la ligne de la fresque en cours, puis celles de ses archives, sans cadre, un filet fin entre deux. Sur mobile, un onglet de la rangée, et les actions passent sous le titre, à droite."
    >
      <Block title="États">
        {LISTS(nowMs).map(({ name, detail, list }) => (
          <StateRow key={name} name={name} detail={detail}>
            <InWindow>
              <ArchivesScene list={list} />
            </InWindow>
          </StateRow>
        ))}
      </Block>
      <Block title="Sur mobile">
        <StateRow
          name="Mêmes lignes"
          detail="Les actions passent sous le titre, à droite, en cibles de 44 px."
        >
          <InPhone isWindow>
            <ArchivesScene
              list={{
                status: "ready",
                canvases: {
                  ...withArchives(nowMs, 2),
                  active: sampleActive(nowMs, { theme: "Printemps", thumbnail: HEART }),
                },
              }}
            />
          </InPhone>
        </StateRow>
      </Block>
    </Entry>
  );
};

type SwitchRowProps = {
  name: string;
  detail?: string;
  request: SwitchRequest;
  progress: ProgressChoice | null;
  pendingReports: number;
  refusal?: SwitchFailure; // le serveur refuse : la fenêtre reste ouverte et le dit
};

// Une fenêtre qu'on ouvre pour de bon : le choix se fait, Archiver s'active, la confirmation verrouille la fenêtre un
// instant, puis elle se ferme, ou garde la raison du refus.
const SwitchRow = ({ name, detail, request, progress: initial, pendingReports, refusal }: SwitchRowProps) => {
  const [startTheme, setStartTheme] = useState("");
  const [progress, setProgress] = useState<ProgressChoice | null>(initial);
  const [status, setStatus] = useState<SwitchStatus>("idle");
  const [failure, setFailure] = useState<SwitchFailure | null>(null);
  const open = () => {
    setStartTheme(startingTheme(request));
    setProgress(initial);
    setStatus("idle");
    setFailure(null);
  };
  return (
    <StateRow name={name} detail={detail}>
      <OpenWindow onOpen={open}>
        {({ isOpen, close }) => (
          <SwitchWindow
            request={isOpen ? request : null}
            theme={startTheme}
            onTheme={setStartTheme}
            progress={progress}
            onProgress={setProgress}
            pendingReports={pendingReports}
            status={status}
            failure={failure}
            onConfirm={() => {
              setStatus("running");
              setTimeout(() => {
                setStatus(refusal ? "failed" : "idle");
                setFailure(refusal ?? null);
                if (!refusal) close();
              }, LOCKED_MS);
            }}
            onClose={() => {
              if (status !== "running") close();
            }}
          />
        )}
      </OpenWindow>
    </StateRow>
  );
};

export const SwitchWindowEntry = () => {
  const nowMs = useNowMs();
  const archive = sampleArchive(nowMs, 2);
  const archiving = { kind: "archive", canvas: sampleActive(nowMs) } as const;
  return (
    <Entry
      slug="archiver-ou-rouvrir"
      components={["SwitchWindow"]}
      file="ui/archive/switch-window.tsx"
      note={`Archiver et Rouvrir ouvrent la même fenêtre : ce qui va se passer en une phrase, les signalements classés sans suite quand il y en a, et le choix des jauges des viewers, qu'aucune option ne devance. La confirmation reste inactive tant que rien n'est choisi. ${DIALOG_NOTE}`}
    >
      <Block title="États">
        <SwitchRow
          name="Archiver, rien de choisi"
          detail="Archiver est inactif."
          request={archiving}
          progress={null}
          pendingReports={2}
        />
        <SwitchRow
          name="Archiver, « Garder » choisi, deux signalements en attente"
          request={archiving}
          progress="keep"
          pendingReports={2}
        />
        <SwitchRow
          name="Archiver, aucun signalement"
          detail="La ligne n'apparaît pas."
          request={archiving}
          progress={null}
          pendingReports={0}
        />
        <SwitchRow
          name="Archiver la fresque en cours avec un thème"
          detail="Le champ propose son thème."
          request={{ kind: "archive", canvas: sampleActive(nowMs, { theme: "Printemps" }) }}
          progress={null}
          pendingReports={0}
        />
        <SwitchRow
          name="Rouvrir, « Reprendre » choisi, un signalement en attente"
          request={{ kind: "reopen", archive }}
          progress="restart"
          pendingReports={1}
        />
        <SwitchRow
          name="Rouvrir, la liste a changé"
          detail="Elle se recharge, la fenêtre le dit."
          request={{ kind: "reopen", archive }}
          progress="keep"
          pendingReports={0}
          refusal="not_archive"
        />
        <SwitchRow
          name="Archiver, pas de réponse du serveur"
          detail="La liste est rechargée, à vérifier."
          request={archiving}
          progress="keep"
          pendingReports={0}
          refusal="network"
        />
      </Block>
    </Entry>
  );
};

export const DiscardWindowEntry = () => {
  const nowMs = useNowMs();
  const archive = sampleArchive(nowMs, 2);
  const [status, setStatus] = useState<SwitchStatus>("idle");
  return (
    <Entry
      slug="supprimer-une-archive"
      components={["DiscardWindow"]}
      file="ui/archive/switch-window.tsx"
      note={DIALOG_NOTE}
    >
      <Block title="États">
        <StateRow name="Supprimer" detail="La confirmation nomme l'archive, et dit que c'est pour de bon.">
          <OpenWindow>
            {({ isOpen, close }) => (
              <DiscardWindow
                archive={isOpen ? archive : null}
                status={status}
                failure={null}
                onConfirm={() => {
                  setStatus("running");
                  setTimeout(() => {
                    setStatus("idle");
                    close();
                  }, LOCKED_MS);
                }}
                onClose={() => {
                  if (status !== "running") close();
                }}
              />
            )}
          </OpenWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};

// Le fond se choisit, Télécharger s'active, et il ferme la fenêtre.
const DownloadRow = ({ name, background: initial }: { name: string; background: PngBackground | null }) => {
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const [background, setBackground] = useState<PngBackground | null>(initial);
  return (
    <StateRow name={name} detail={initial ? undefined : "Télécharger est inactif."}>
      <OpenWindow onOpen={() => setBackground(initial)}>
        {({ isOpen, close }) => (
          <DownloadWindow
            isOpen={isOpen}
            background={background}
            onBackground={setBackground}
            isCompact={isCompact}
            onConfirm={close}
            onClose={close}
          />
        )}
      </OpenWindow>
    </StateRow>
  );
};

export const DownloadWindowEntry = () => (
  <Entry
    slug="telecharger-en-png"
    components={["DownloadWindow"]}
    file="ui/archive/download-window.tsx"
    note={`Télécharger en PNG ouvre la sienne, sur le même modèle : le fond se choisit, et aucun n'est présélectionné. ${DIALOG_NOTE}`}
  >
    <Block title="États">
      <DownloadRow name="Télécharger en PNG, rien de choisi" background={null} />
      <DownloadRow name="Télécharger en PNG, « Noir » choisi" background="black" />
    </Block>
  </Entry>
);
