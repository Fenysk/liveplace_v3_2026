// La page /design (JOURNAL 2026-09-24) : tout le design system, dans chacun de ses états.
// Elle rend les composants du jeu eux-mêmes : on change un composant ici avant de s'en servir.

import { useState } from "react";
import { classNames } from "../design/class-names";
import { Segmented } from "../design/segmented";
import { ThemePicker } from "../design/theme-controls";
import { pickTheme, useThemeChoice } from "../design/use-theme";
import { ComponentsSection } from "./components-section";
import { FoundationsSection } from "./foundations-section";

type Pointer = "mouse" | "touch";

const POINTER_OPTIONS = [
  { value: "mouse", label: "Souris" },
  { value: "touch", label: "Doigt" },
] as const;

export const DesignPage = () => {
  const themeChoice = useThemeChoice();
  const [pointer, setPointer] = useState<Pointer>("mouse");
  return (
    // « Doigt » passe les contrôles à 44 px, comme sur un écran tactile ; la mise en page mobile, elle, se voit sous 640 px.
    <main className={classNames("design-page", pointer === "touch" && "is-touch-preview")}>
      <header className="design-head">
        <h1 className="lp-type-heading">Design system LivePlace</h1>
        <p className="lp-type-body lp-muted">
          Chaque composant du jeu, dans chacun de ses états. On le change ici avant de s'en servir.
        </p>
        <div className="lp-row design-controls">
          <ThemePicker choice={themeChoice} onPick={pickTheme} />
          <Segmented label="Pointeur" options={POINTER_OPTIONS} value={pointer} onSelect={setPointer} />
        </div>
      </header>
      <FoundationsSection />
      <ComponentsSection />
    </main>
  );
};
