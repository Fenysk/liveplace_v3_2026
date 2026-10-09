// La page /design (JOURNAL 2026-09-24) : tout le design system, une entrée à la fois, chaque état sur sa ligne.
// Elle rend les composants du jeu eux-mêmes : on change un composant ici avant de s'en servir.

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Blocks,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Gamepad2,
  MessageSquareWarning,
  Palette,
} from "lucide-react";
import { useId, useState } from "react";
import { AppearancePicker } from "../design/appearance-controls";
import { blurAfterClick } from "../design/button";
import { classNames } from "../design/class-names";
import { Segmented } from "../design/segmented";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import {
  DESIGN_CHAPTERS,
  DESIGN_ENTRIES,
  type DesignChapter,
  type DesignChapterId,
  type DesignEntry,
  type EntrySlug,
} from "./design-entries";
import { EntryView } from "./entry-view";
import { useDesignEntry } from "./use-design-entry";

type Pointer = "mouse" | "touch";

const POINTER_OPTIONS = [
  { value: "mouse", label: "Souris" },
  { value: "touch", label: "Doigt" },
] as const;

const CHAPTER_ICONS: Record<DesignChapterId, LucideIcon> = {
  foundations: Palette,
  components: Blocks,
  game: Gamepad2,
  window: AppWindow,
  dialogs: MessageSquareWarning,
};

type ChapterNavProps = {
  chapter: DesignChapter;
  isOpen: boolean;
  currentSlug: EntrySlug;
  onToggle: () => void;
  onShow: (entry: DesignEntry<EntrySlug>) => void;
};

// Un chapitre repliable, et ses entrées dessous : la courante en pill blanche.
const ChapterNav = ({ chapter, isOpen, currentSlug, onToggle, onShow }: ChapterNavProps) => {
  const Icon = CHAPTER_ICONS[chapter.id];
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <li>
      <button
        type="button"
        className="lp-btn lp-type-body design-chapter"
        aria-expanded={isOpen}
        onClick={blurAfterClick(onToggle)}
      >
        <Icon aria-hidden="true" />
        {chapter.title}
        <Chevron className="design-chapter-chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <ul>
          {DESIGN_ENTRIES.filter(({ chapterId }) => chapterId === chapter.id).map((entry) => (
            <li key={entry.slug}>
              <button
                type="button"
                className="lp-btn lp-type-body design-nav-entry"
                aria-current={entry.slug === currentSlug ? "page" : undefined}
                onClick={blurAfterClick(() => onShow(entry))}
              >
                {entry.title}
                {entry.place && (
                  <span className="design-nav-place lp-type-caption lp-muted">{entry.place}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export const DesignPage = () => {
  const appearanceChoice = useAppearanceChoice();
  const [pointer, setPointer] = useState<Pointer>("mouse");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const treeId = useId();
  const { entry, openChapterIds, showEntry, toggleChapter } = useDesignEntry();
  const shownChapter = DESIGN_CHAPTERS.find(({ id }) => id === entry.chapterId);
  const ShownIcon = CHAPTER_ICONS[entry.chapterId];
  const MenuChevron = isMenuOpen ? ChevronUp : ChevronDown;
  return (
    // « Doigt » passe les contrôles à 44 px, comme sur un écran tactile ; la mise en page mobile, elle, se voit sous 640 px.
    <main className={classNames("design-page", pointer === "touch" && "is-touch-preview")}>
      <div className="design-shell">
        <nav className={classNames("design-nav", isMenuOpen && "is-open")} aria-label="Entrées">
          {/* Sous 640 px, le sommaire se replie dans cette barre : le chapitre et l'entrée affichés. */}
          <button
            type="button"
            className="lp-btn lp-type-body design-nav-bar"
            aria-expanded={isMenuOpen}
            aria-controls={treeId}
            onClick={blurAfterClick(() => setIsMenuOpen((isOpen) => !isOpen))}
          >
            <ShownIcon aria-hidden="true" />
            <span>
              {shownChapter?.title} · <strong>{entry.title}</strong>
            </span>
            <MenuChevron className="design-chapter-chevron" aria-hidden="true" />
          </button>
          <div id={treeId} className="design-nav-tree">
            <p className="design-nav-title lp-type-title">Design system LivePlace</p>
            <ul>
              {DESIGN_CHAPTERS.map((chapter) => (
                <ChapterNav
                  key={chapter.id}
                  chapter={chapter}
                  isOpen={openChapterIds.has(chapter.id)}
                  currentSlug={entry.slug}
                  onToggle={() => toggleChapter(chapter.id)}
                  onShow={(next) => {
                    setIsMenuOpen(false);
                    showEntry(next);
                  }}
                />
              ))}
            </ul>
            <div className="design-nav-controls">
              <AppearancePicker choice={appearanceChoice} onPick={pickAppearance} />
              <Segmented label="Pointeur" options={POINTER_OPTIONS} value={pointer} onSelect={setPointer} />
            </div>
          </div>
        </nav>
        <div className="design-main">
          <EntryView key={entry.slug} slug={entry.slug} />
        </div>
      </div>
    </main>
  );
};
