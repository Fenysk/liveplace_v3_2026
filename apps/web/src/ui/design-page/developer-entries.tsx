// Le développeur (écart §10.3, JOURNAL 2026-10-06 et 2026-10-07) : sa fenêtre et ses deux sections, dans chacun de leurs
// états. Les vrais composants du jeu, avec des chiffres d'exemple, aucune connexion.

import type { ActivityPeriod } from "@liveplace/domain";
import type { ActivityHere } from "@liveplace/domain/ports";
import { useMemo, useState } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import { ActivitySection } from "../developer/activity-section";
import { CanvasSection } from "../developer/canvas-section";
import {
  type DeveloperSectionId,
  DeveloperWindow,
  FIRST_DEVELOPER_SECTION,
} from "../developer/developer-window";
import { quietHere, sampleCanvasPoints, sampleFrame, sampleHere, samplePoints } from "./activity-samples";
import { noop } from "./design-fixtures";
import { Block, Entry, InLargeWindow, InWindow, OpenWindow, StateRow, useNowMs } from "./entry-layout";

type SectionSceneProps = { nowMs: number; sectionId: DeveloperSectionId; here?: ActivityHere };

// La section telle que le développeur la voit, la période choisie redonnant ses courbes. `here` : le canvas de la socket.
const SectionScene = ({ nowMs, sectionId, here }: SectionSceneProps) => {
  const [period, setPeriod] = useState<ActivityPeriod>("day");
  const view = useMemo<ActivityWatchView>(
    () => ({
      activity: sampleFrame(nowMs, here),
      period,
      history: {
        status: "ready",
        points: samplePoints(period, nowMs),
        canvasPoints: sampleCanvasPoints(period, nowMs),
      },
    }),
    [period, nowMs, here],
  );
  const Section = sectionId === "here" ? CanvasSection : ActivitySection;
  return <Section view={view} nowMs={nowMs} onSelectPeriod={setPeriod} />;
};

// Elle s'ouvre sur Ce canvas, comme dans le jeu ; le choix d'une section ne la ferme pas.
const WindowScene = ({ nowMs, here }: { nowMs: number; here: ActivityHere }) => {
  const [sectionId, setSectionId] = useState<DeveloperSectionId>(FIRST_DEVELOPER_SECTION);
  return (
    <OpenWindow onOpen={() => setSectionId(FIRST_DEVELOPER_SECTION)}>
      {({ isOpen, close }) => (
        <DeveloperWindow isOpen={isOpen} sectionId={sectionId} onSelect={setSectionId} onClose={close}>
          <SectionScene nowMs={nowMs} sectionId={sectionId} here={here} />
        </DeveloperWindow>
      )}
    </OpenWindow>
  );
};

const WAITING: ActivityWatchView = { activity: null, period: "day", history: { status: "loading" } };

export const DeveloperEntry = () => {
  const nowMs = useNowMs();
  const [here] = useState(() => sampleHere(nowMs));
  const [quiet] = useState(() => quietHere(nowMs));
  // Sans `here`, la socket n'a pas de canvas prêt, ou le gateway est d'avant.
  const noCanvas: ActivityWatchView = {
    activity: sampleFrame(nowMs),
    period: "day",
    history: { status: "ready", points: samplePoints("day", nowMs) },
  };
  return (
    <Entry
      slug="developpeur"
      components={["DeveloperWindow", "CanvasSection", "ActivitySection"]}
      file="ui/developer/{developer-window,canvas-section,activity-section}.tsx"
      note="Ses deux sections à lui : Ce canvas, où elle s'ouvre, et Tout LivePlace. Les chiffres bougent toutes les 2 s dans le jeu."
    >
      <Block title="La fenêtre">
        <StateRow
          name="Ouverte par le bouton Développeur de la pill Compte, sur Ce canvas"
          detail="Sur PC, jusqu'à 1 100 px de large et 90 % de la hauteur ; sur mobile, une feuille et des onglets."
        >
          <WindowScene nowMs={nowMs} here={here} />
        </StateRow>
      </Block>
      <Block title="Ce canvas">
        <StateRow name="La section Ce canvas, hors de la fenêtre">
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Ce canvas, à la largeur de la grande fenêtre"
          detail="L'audience et qui est là côte à côte."
        >
          <InLargeWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} />
          </InLargeWindow>
        </StateRow>
        <StateRow
          name="Ce canvas sans streamer OBS ni personne dessus"
          detail="« Personne sur ce canvas en ce moment »."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={quiet} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Ce canvas quand la socket n'en a pas de prêt, ou que le gateway est d'avant"
          detail="La section le dit simplement."
        >
          <InWindow>
            <CanvasSection view={noCanvas} nowMs={nowMs} onSelectPeriod={noop} />
          </InWindow>
        </StateRow>
        <StateRow name="Ce canvas avant la première frame et le premier historique">
          <InWindow>
            <CanvasSection view={WAITING} nowMs={nowMs} onSelectPeriod={noop} />
          </InWindow>
        </StateRow>
      </Block>
      <Block title="Tout LivePlace">
        <StateRow name="La section Tout LivePlace, hors de la fenêtre">
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace, à la largeur de la grande fenêtre"
          detail="L'audience et les canvas côte à côte."
        >
          <InLargeWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} />
          </InLargeWindow>
        </StateRow>
        <StateRow name="Tout LivePlace avant la première frame et le premier historique">
          <InWindow>
            <ActivitySection view={WAITING} nowMs={nowMs} onSelectPeriod={noop} />
          </InWindow>
        </StateRow>
        <StateRow name="Personne nulle part, l'historique en échec">
          <InWindow>
            <ActivitySection
              view={{
                activity: { ...sampleFrame(nowMs), canvases: [] },
                period: "day",
                history: { status: "failed" },
              }}
              nowMs={nowMs}
              onSelectPeriod={noop}
            />
          </InWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};
