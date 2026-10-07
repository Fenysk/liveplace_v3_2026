// Plusieurs canvas (Écart §15, JOURNAL 2026-10-06) : la section Archives, ses lignes, ses fenêtres de
// confirmation, le bandeau d'une archive et sa page introuvable, dans chacun de leurs états. Les vrais composants.

import { MAX_ARCHIVES } from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { toBase64 } from "@liveplace/shared";
import { useState } from "react";
import type { ProgressChoice } from "../../usecase/canvas-switch";
import type { ListedArchive, ListedCanvas, ListedCanvases, Thumbnail } from "../../usecase/list-canvases";
import { ArchiveBanner } from "../archive/archive-banner";
import { ArchiveNotFound } from "../archive/archive-not-found";
import {
  bannerCaption,
  bannerTitle,
  NAME_PLACEHOLDER,
  ownerToast,
  PROGRESS_LABEL,
  progressOptions,
  type SwitchFailure,
  startingName,
} from "../archive/archive-texts";
import { type ArchivesList, ArchivesSection } from "../archive/canvas-cards";
import { DownloadWindow, PNG_BACKGROUND_OPTIONS } from "../archive/download-window";
import type { PngBackground } from "../archive/png-export";
import { DiscardWindow, type SwitchRequest, type SwitchStatus, SwitchWindow } from "../archive/switch-window";
import { switchToast } from "../canvas/switch-toast";
import { Button } from "../design/button";
import { ChoiceList } from "../design/choice-list";
import { SwatchChoice } from "../design/palette";
import { TextField } from "../design/text-field";
import { Toast } from "../design/toast";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { noop, SAMPLE_DRAWING, SAMPLE_OWNER } from "./design-fixtures";
import { Specimen, SpecimenSection } from "./specimen-section";

const DAY = 86_400_000;

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
  createdAt: nowMs - 2 * DAY,
  thumbnail: BLANK,
  ...more,
});

const sampleArchive = (nowMs: number, index: number, more: Partial<ListedArchive> = {}): ListedArchive => ({
  canvasId: `archive-${index}`,
  createdAt: nowMs - (30 - 6 * index) * DAY,
  archivedAt: nowMs - (24 - 6 * index) * DAY,
  linkCode: `code${index}xxxxx`,
  thumbnail: index % 2 === 0 ? HEART : BLANK,
  ...more,
});

const LONG_NAME = "Grande pixel war de la rentrée des lives";

const withArchives = (nowMs: number, count: number): ListedCanvases => ({
  active: sampleActive(nowMs, { thumbnail: HEART }),
  archives: Array.from({ length: count }, (_, index) =>
    sampleArchive(nowMs, index + 1, index === 0 ? { name: "Soirée de lancement" } : {}),
  ).reverse(),
});

const LISTS = (nowMs: number): readonly { caption: string; list: ArchivesList; isCompact?: boolean }[] => [
  {
    caption: "Sans archive : « Archives · 0 sur 5 », la ligne du canvas en cours, et une phrase",
    list: { status: "ready", canvases: withArchives(nowMs, 0) },
  },
  {
    caption: "Deux archives, de la plus récente à la plus ancienne ; un nom en titre, sinon les dates",
    list: { status: "ready", canvases: withArchives(nowMs, 2) },
  },
  {
    caption: `${MAX_ARCHIVES} archives : Archiver est inactif, et la phrase dessous dit de supprimer une archive d'abord`,
    list: { status: "ready", canvases: withArchives(nowMs, MAX_ARCHIVES) },
  },
  {
    caption: "Le canvas en cours nommé, rouvert d'une archive : le nom en titre, « depuis le … » en légende",
    list: {
      status: "ready",
      canvases: {
        active: sampleActive(nowMs, { name: "Printemps", linkCode: "kept123456", thumbnail: HEART }),
        archives: [sampleArchive(nowMs, 1)],
      },
    },
  },
  {
    caption: "Un nom de 40 caractères, le maximum : le titre passe à la ligne, l'icône d'ouverture le suit",
    list: {
      status: "ready",
      canvases: {
        active: sampleActive(nowMs, { name: LONG_NAME, thumbnail: HEART }),
        archives: [sampleArchive(nowMs, 1, { name: LONG_NAME })],
      },
    },
  },
  {
    caption: "Redis n'a plus l'image d'un canvas : le damier à la place de la miniature",
    list: {
      status: "ready",
      canvases: {
        active: sampleActive(nowMs, { thumbnail: null }),
        archives: [sampleArchive(nowMs, 1, { thumbnail: null })],
      },
    },
  },
  { caption: "En chargement", list: { status: "loading" } },
  { caption: "La lecture a échoué : réessayer", list: { status: "failed" } },
];

// `pendingReports` : zéro, la ligne des signalements n'apparaît pas. `refusal` : ce que « Simuler un refus » dit.
type WindowSpecimenProps = {
  caption: string;
  request: SwitchRequest;
  progress: ProgressChoice | null;
  pendingReports: number;
  refusal?: SwitchFailure;
};

// Une fenêtre qu'on ouvre pour de bon : le choix se fait, Archiver s'active, la confirmation verrouille la fenêtre un instant.
const SwitchWindowSpecimen = ({
  caption,
  request,
  progress: initial,
  pendingReports,
  refusal = "busy",
}: WindowSpecimenProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<ProgressChoice | null>(initial);
  const [status, setStatus] = useState<SwitchStatus>("idle");
  const [failure, setFailure] = useState<SwitchFailure | null>(null);
  const close = () => {
    if (status !== "running") setIsOpen(false);
  };
  const confirm = () => {
    setStatus("running");
    setTimeout(() => {
      setStatus("idle");
      setIsOpen(false);
    }, 1500);
  };
  return (
    <Specimen caption={caption}>
      <Button
        label="Ouvrir la fenêtre"
        onPress={() => {
          setName(startingName(request));
          setProgress(initial);
          setStatus("idle");
          setFailure(null);
          setIsOpen(true);
        }}
      />
      <SwitchWindow
        request={isOpen ? request : null}
        name={name}
        onName={setName}
        progress={progress}
        onProgress={setProgress}
        pendingReports={pendingReports}
        status={status}
        failure={failure}
        onConfirm={confirm}
        onClose={close}
      />
      {isOpen && (
        <Button
          label="Simuler un refus"
          onPress={() => {
            setStatus("failed");
            setFailure(refusal);
          }}
        />
      )}
    </Specimen>
  );
};

// Les vrais textes des toasts : celui du streamer qui agit, celui de ses viewers avec ou sans brouillon.
const LIVE = { status: "live", isArchived: false } as const;
const ARCHIVED = { status: "live", isArchived: true } as const;
const viewerToast = (draftSize: number): string =>
  switchToast(LIVE, ARCHIVED, { hasAskedHere: false, ownerName: SAMPLE_OWNER.displayName, draftSize }) ?? "";

const TOASTS = [
  { caption: "Le streamer archive", text: ownerToast("archive") },
  { caption: "Le streamer rouvre une archive", text: ownerToast("reopen") },
  { caption: "Le streamer supprime une archive", text: ownerToast("discard") },
  { caption: "Le lien d'une archive est copié", text: "Lien copié" },
  { caption: "Ses viewers, sans brouillon", text: viewerToast(0) },
  { caption: "Ses viewers, avec un brouillon non vide", text: viewerToast(3) },
] as const;

type BannerSpecimenProps = { archive: ListedArchive; isDownloading?: boolean; isCompact?: boolean };

// Le vrai bandeau, avec les vrais textes : le streamer de démonstration, et les dates d'une archive d'exemple.
const BannerSpecimen = ({ archive, isDownloading = false, isCompact = false }: BannerSpecimenProps) => {
  const text = {
    displayName: SAMPLE_OWNER.displayName,
    name: archive.name,
    createdAt: archive.createdAt,
    archivedAt: archive.archivedAt,
  };
  return (
    <ArchiveBanner
      owner={SAMPLE_OWNER}
      title={bannerTitle(text)}
      caption={bannerCaption(text)}
      isDownloading={isDownloading}
      onCopyLink={noop}
      onDownload={noop}
      isCompact={isCompact}
      isDocked={false}
    />
  );
};

type DownloadSpecimenProps = { caption: string; background: PngBackground | null };

// La fenêtre qu'on ouvre pour de bon : le fond se choisit, Télécharger s'active, et il ferme la fenêtre.
const DownloadWindowSpecimen = ({ caption, background: initial }: DownloadSpecimenProps) => {
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const [isOpen, setIsOpen] = useState(false);
  const [background, setBackground] = useState<PngBackground | null>(initial);
  return (
    <Specimen caption={caption}>
      <Button
        label="Ouvrir la fenêtre"
        onPress={() => {
          setBackground(initial);
          setIsOpen(true);
        }}
      />
      <DownloadWindow
        isOpen={isOpen}
        background={background}
        onBackground={setBackground}
        isCompact={isCompact}
        onConfirm={() => setIsOpen(false)}
        onClose={() => setIsOpen(false)}
      />
    </Specimen>
  );
};

const DiscardWindowSpecimen = ({ archive }: { archive: ListedArchive }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SwitchStatus>("idle");
  return (
    <Specimen caption="Supprimer : la confirmation nomme l'archive, et dit que c'est pour de bon">
      <Button label="Ouvrir la fenêtre" onPress={() => setIsOpen(true)} />
      <DiscardWindow
        archive={isOpen ? archive : null}
        status={status}
        failure={null}
        onConfirm={() => {
          setStatus("running");
          setTimeout(() => {
            setStatus("idle");
            setIsOpen(false);
          }, 1500);
        }}
        onClose={() => {
          if (status !== "running") setIsOpen(false);
        }}
      />
    </Specimen>
  );
};

const FieldSpecimens = () => {
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<ProgressChoice | null>(null);
  const [background, setBackground] = useState<PngBackground | null>(null);
  return (
    <>
      <Specimen caption="Champ de texte : le nom facultatif d'une archive">
        <div className="design-preview-box">
          <TextField
            label="Nom de l'archive (facultatif)"
            placeholder={NAME_PLACEHOLDER}
            value={name}
            maxLength={40}
            onInput={setName}
          />
        </div>
      </Specimen>
      <Specimen caption="Champ de texte désactivé">
        <div className="design-preview-box">
          <TextField label="Nom de l'archive (facultatif)" value="Printemps" onInput={noop} isDisabled />
        </div>
      </Specimen>
      <Specimen caption="Choix exclusif : aucune option présélectionnée">
        <div className="design-preview-box">
          <ChoiceList
            label={PROGRESS_LABEL}
            options={progressOptions("archive")}
            value={progress}
            onSelect={setProgress}
          />
        </div>
      </Specimen>
      <Specimen caption="Choix exclusif désactivé, une option choisie">
        <div className="design-preview-box">
          <ChoiceList
            label={PROGRESS_LABEL}
            options={progressOptions("archive")}
            value="keep"
            onSelect={noop}
            isDisabled
          />
        </div>
      </Specimen>
      <Specimen caption="Choix de couleur, au clavier de la palette : aucune pastille choisie d'avance">
        <div className="design-preview-box">
          <SwatchChoice
            label="Fond de l'image"
            options={PNG_BACKGROUND_OPTIONS}
            value={background}
            onSelect={setBackground}
          />
        </div>
      </Specimen>
      <Specimen caption="Choix de couleur au doigt : les pastilles rondes, une choisie">
        <div className="design-preview-box">
          <SwatchChoice
            label="Fond de l'image"
            options={PNG_BACKGROUND_OPTIONS}
            value="white"
            onSelect={noop}
            isTouch
          />
        </div>
      </Specimen>
    </>
  );
};

export const ArchivesSpecimens = () => {
  const [nowMs] = useState(() => Date.now());
  const archive = sampleArchive(nowMs, 2);
  return (
    <section className="design-section" aria-labelledby="design-archives">
      <h2 id="design-archives" className="lp-type-heading">
        Plusieurs canvas
      </h2>

      <SpecimenSection
        title="Champ et choix"
        note="Les contrôles des confirmations : un nom facultatif, un choix exclusif qui ne présélectionne rien, et un choix de couleur qui reprend les pastilles de la palette."
      >
        <FieldSpecimens />
      </SpecimenSection>

      <SpecimenSection
        title="Fenêtre, section Archives"
        note="Pour le streamer seul, à côté de Canvas : la ligne du canvas en cours, puis celles de ses archives, sans cadre, un filet fin entre deux. Sur mobile, un onglet de la rangée, et les actions passent sous le titre, à droite."
      >
        {LISTS(nowMs).map(({ caption, list }) => (
          <Specimen key={caption} caption={caption}>
            <div className="design-window-box">
              <ArchivesSection
                list={list}
                login="kalyss"
                onArchive={noop}
                onCopyLink={noop}
                onReopen={noop}
                onDiscard={noop}
                onRetry={noop}
              />
            </div>
          </Specimen>
        ))}
        <Specimen caption="Sur mobile : mêmes lignes, les actions passent sous le titre, à droite, en cibles de 44 px">
          <div className="design-phone-box design-phone-box--window">
            <div className="design-window-box">
              <ArchivesSection
                list={{
                  status: "ready",
                  canvases: {
                    ...withArchives(nowMs, 2),
                    active: sampleActive(nowMs, { name: "Printemps", thumbnail: HEART }),
                  },
                }}
                login="kalyss"
                onArchive={noop}
                onCopyLink={noop}
                onReopen={noop}
                onDiscard={noop}
                onRetry={noop}
              />
            </div>
          </div>
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="Confirmations"
        note="Archiver et Rouvrir ouvrent la même fenêtre : ce qui va se passer en une phrase, les signalements classés sans suite quand il y en a, et le choix des jauges des viewers, qu'aucune option ne devance. La confirmation reste inactive tant que rien n'est choisi. Télécharger en PNG ouvre la sienne, sur le même modèle : le fond se choisit, et aucun n'est présélectionné."
      >
        <SwitchWindowSpecimen
          caption="Archiver, rien de choisi : Archiver est inactif"
          request={{ kind: "archive", canvas: sampleActive(nowMs) }}
          progress={null}
          pendingReports={2}
        />
        <SwitchWindowSpecimen
          caption="Archiver, « Garder » choisi, deux signalements en attente"
          request={{ kind: "archive", canvas: sampleActive(nowMs) }}
          progress="keep"
          pendingReports={2}
        />
        <SwitchWindowSpecimen
          caption="Archiver, aucun signalement : la ligne n'apparaît pas"
          request={{ kind: "archive", canvas: sampleActive(nowMs) }}
          progress={null}
          pendingReports={0}
        />
        <SwitchWindowSpecimen
          caption="Archiver le canvas en cours nommé : le champ propose son nom"
          request={{ kind: "archive", canvas: sampleActive(nowMs, { name: "Printemps" }) }}
          progress={null}
          pendingReports={0}
        />
        <SwitchWindowSpecimen
          caption="Rouvrir, « Reprendre » choisi, un signalement en attente"
          request={{ kind: "reopen", archive }}
          progress="restart"
          pendingReports={1}
        />
        <SwitchWindowSpecimen
          caption="Rouvrir, la liste a changé : elle se recharge, la fenêtre le dit"
          request={{ kind: "reopen", archive }}
          progress="keep"
          pendingReports={0}
          refusal="not_archive"
        />
        <SwitchWindowSpecimen
          caption="Archiver, pas de réponse du serveur : la liste est rechargée, à vérifier"
          request={{ kind: "archive", canvas: sampleActive(nowMs) }}
          progress="keep"
          pendingReports={0}
          refusal="network"
        />
        <DiscardWindowSpecimen archive={archive} />
        <DownloadWindowSpecimen
          caption="Télécharger en PNG, rien de choisi : Télécharger est inactif"
          background={null}
        />
        <DownloadWindowSpecimen caption="Télécharger en PNG, « Noir » choisi" background="black" />
      </SpecimenSection>

      <SpecimenSection
        title="Bandeau d'une archive"
        note="En haut à gauche, à la place de la pill Canvas : à qui est l'archive (son avatar et son nom mènent à son canvas en cours), son titre et sa légende, le lien à copier, le PNG."
      >
        <Specimen caption="Sans nom : « Archive de … », la légende dit les dates">
          <BannerSpecimen archive={archive} />
        </Specimen>
        <Specimen caption="Avec un nom : le nom est le titre, la légende dit à qui est l'archive, puis les dates">
          <BannerSpecimen archive={{ ...archive, name: "Soirée de lancement" }} />
        </Specimen>
        <Specimen caption="Le PNG se prépare : Télécharger attend">
          <BannerSpecimen archive={archive} isDownloading />
        </Specimen>
        <Specimen caption="Sur mobile : les actions n'ont que leur icône, la pill Compte garde sa place">
          <div className="design-preview-box">
            <BannerSpecimen archive={{ ...archive, name: "Soirée de lancement" }} isCompact />
          </div>
        </Specimen>
        <Specimen caption="Une archive supprimée, ou un lien inconnu : le bouton dit le nom affiché">
          <div className="design-notice-box">
            <ArchiveNotFound login="kalyss" displayName={SAMPLE_OWNER.displayName} />
          </div>
        </Specimen>
        <Specimen caption="Le pseudo n'existe pas du tout : le bouton dit le pseudo">
          <div className="design-notice-box">
            <ArchiveNotFound login="nobody" />
          </div>
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="Toasts"
        note="Le streamer qui agit sait où sont ses viewers. Ses viewers lisent qu'il a changé de canvas, pour un archivage comme pour une réouverture, et où reste leur brouillon s'ils en avaient un."
      >
        {TOASTS.map(({ caption, text }) => (
          <Specimen key={caption} caption={caption}>
            <Toast message={{ id: 1, tone: "success", text }} isDocked={false} />
          </Specimen>
        ))}
      </SpecimenSection>
    </section>
  );
};
