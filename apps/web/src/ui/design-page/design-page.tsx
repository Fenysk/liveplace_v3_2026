// La page /design (JOURNAL 2026-09-24) : tout le design system, dans chacun de ses états.
// Elle rend les composants du jeu eux-mêmes : on change un composant ici avant de s'en servir.
// Navigation par barre latérale (JOURNAL 2026-09-27) : même motif que la fenêtre du jeu (design/window.tsx).

import type { LucideIcon } from "lucide-react";
import { Activity, Blocks, Gamepad2, Palette, Shield } from "lucide-react";
import { useState } from "react";
import { blurAfterClick } from "../design/button";
import { classNames } from "../design/class-names";
import { Segmented } from "../design/segmented";
import { ThemePicker } from "../design/theme-controls";
import { pickTheme, useThemeChoice } from "../design/use-theme";
import { ComponentsSection } from "./components-section";
import { DeveloperSection } from "./developer-section";
import { FoundationsSection } from "./foundations-section";
import { GamePillsSection } from "./game-pills-section";
import { ModerationSection } from "./moderation-section";

type Pointer = "mouse" | "touch";

const POINTER_OPTIONS = [
  { value: "mouse", label: "Souris" },
  { value: "touch", label: "Doigt" },
] as const;

type SectionId = "foundations" | "components" | "game-pills" | "moderation" | "developer";

// Le libellé reprend exactement le titre (h2) de la section visée : la navigation ne nomme rien à part.
const SECTIONS: readonly { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "foundations", label: "Fondations", icon: Palette },
  { id: "components", label: "Composants", icon: Blocks },
  { id: "game-pills", label: "Les pills du jeu", icon: Gamepad2 },
  { id: "moderation", label: "La modération", icon: Shield },
  { id: "developer", label: "Le développeur", icon: Activity },
];

export const DesignPage = () => {
  const themeChoice = useThemeChoice();
  const [pointer, setPointer] = useState<Pointer>("mouse");
  const [sectionId, setSectionId] = useState<SectionId>("foundations");
  return (
    // « Doigt » passe les contrôles à 44 px, comme sur un écran tactile ; la mise en page mobile, elle, se voit sous 640 px.
    <main className={classNames("design-page", pointer === "touch" && "is-touch-preview")}>
      <header className="design-head">
        <h1 className="lp-type-heading">Design system LivePlace</h1>
        <p className="lp-type-body lp-muted">
          Chaque composant du jeu, dans chacun de ses états. On le change ici avant de s'en servir.
        </p>
      </header>
      <div className="design-shell">
        <nav className="design-nav" aria-label="Sections">
          <ul>
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  className="lp-btn lp-type-body"
                  aria-current={id === sectionId ? "page" : undefined}
                  onClick={blurAfterClick(() => setSectionId(id))}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <div className="design-nav-controls">
            <ThemePicker choice={themeChoice} onPick={pickTheme} />
            <Segmented label="Pointeur" options={POINTER_OPTIONS} value={pointer} onSelect={setPointer} />
          </div>
        </nav>
        <div className="design-main">
          {sectionId === "foundations" && <FoundationsSection />}
          {sectionId === "components" && <ComponentsSection />}
          {sectionId === "game-pills" && <GamePillsSection />}
          {sectionId === "moderation" && <ModerationSection />}
          {sectionId === "developer" && <DeveloperSection />}
        </div>
      </div>
    </main>
  );
};
