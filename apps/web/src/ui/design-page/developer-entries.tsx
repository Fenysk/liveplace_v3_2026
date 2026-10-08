// Le développeur (écart §10.3, JOURNAL 2026-10-06 et 2026-10-07) : sa fenêtre et ses trois sections, dans chacun de leurs
// états. Les vrais composants du jeu, avec des chiffres d'exemple, aucune connexion.

import type { ActivityPeriod } from "@liveplace/domain";
import type { ActivityHere } from "@liveplace/domain/ports";
import { useMemo, useState } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import type { CapacityWatchView } from "../../state/capacity-watch";
import { ActivitySection } from "../developer/activity-section";
import { CanvasSection } from "../developer/canvas-section";
import { CapacitySection } from "../developer/capacity-section";
import {
  type DeveloperSectionId,
  DeveloperWindow,
  FIRST_DEVELOPER_SECTION,
} from "../developer/developer-window";
import { quietHere, sampleCanvasPoints, sampleFrame, sampleHere, samplePoints } from "./activity-samples";
import { type CapacityVariant, sampleCapacityFrame, sampleCapacityPoints } from "./capacity-samples";
import { noop } from "./design-fixtures";
import {
  Block,
  Entry,
  InLargeWindow,
  InPhone,
  InWindow,
  OpenWindow,
  StateRow,
  useNowMs,
} from "./entry-layout";

type SectionSceneProps = {
  nowMs: number;
  sectionId: Exclude<DeveloperSectionId, "capacity">;
  here?: ActivityHere;
};

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

type CapacitySceneProps = { nowMs: number; variant: CapacityVariant; initialPeriod?: ActivityPeriod };

// La capacité dans l'un de ses états. Les exemples d'états s'ouvrent sur Tout : un point par jour, des courbes légères.
const CapacityScene = ({ nowMs, variant, initialPeriod = "day" }: CapacitySceneProps) => {
  const [period, setPeriod] = useState<ActivityPeriod>(initialPeriod);
  const view = useMemo<CapacityWatchView>(
    () => ({
      capacity: sampleCapacityFrame(variant, nowMs),
      period,
      history: { status: "ready", points: sampleCapacityPoints(period, nowMs) },
    }),
    [variant, period, nowMs],
  );
  return <CapacitySection view={view} nowMs={nowMs} onSelectPeriod={setPeriod} />;
};

// Elle s'ouvre sur Ce canvas, comme dans le jeu ; le choix d'une section ne la ferme pas.
const WindowScene = ({ nowMs, here }: { nowMs: number; here: ActivityHere }) => {
  const [sectionId, setSectionId] = useState<DeveloperSectionId>(FIRST_DEVELOPER_SECTION);
  return (
    <OpenWindow onOpen={() => setSectionId(FIRST_DEVELOPER_SECTION)}>
      {({ isOpen, close }) => (
        <DeveloperWindow isOpen={isOpen} sectionId={sectionId} onSelect={setSectionId} onClose={close}>
          {sectionId === "capacity" ? (
            <CapacityScene nowMs={nowMs} variant="watch" />
          ) : (
            <SectionScene nowMs={nowMs} sectionId={sectionId} here={here} />
          )}
        </DeveloperWindow>
      )}
    </OpenWindow>
  );
};

const WAITING: ActivityWatchView = { activity: null, period: "day", history: { status: "loading" } };
const WAITING_CAPACITY: CapacityWatchView = { capacity: null, period: "day", history: { status: "loading" } };

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
      components={["DeveloperWindow", "CanvasSection", "ActivitySection", "CapacitySection"]}
      file="ui/developer/{developer-window,canvas-section,activity-section,capacity-section}.tsx"
      note="Ses trois sections à lui : Ce canvas, où elle s'ouvre, Tout LivePlace et Capacité. Les chiffres bougent toutes les 2 s dans le jeu."
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
          name="Ce canvas ni streamé ni personne dessus"
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
      <Block
        title="Capacité"
        note="Chaque ressource face à son plafond : la saturation en tête, puis les ressources rangées par maillon, puis l'historique. Vert sous 50 %, orange de 50 à 80 %, rouge à partir de 80 %."
      >
        <StateRow
          name="La section Capacité, hors de la fenêtre : à surveiller"
          detail="La saturation en orange, portée par Redis, mémoire."
        >
          <InWindow>
            <CapacityScene nowMs={nowMs} variant="watch" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Capacité, à la largeur de la grande fenêtre"
          detail="Nom, valeur et plafond, barre et taux sur une même ligne."
        >
          <InLargeWindow>
            <CapacityScene nowMs={nowMs} variant="watch" />
          </InLargeWindow>
        </StateRow>
        <StateRow name="Capacité sur mobile" detail="Le taux passe sous le nom, la barre à côté de lui.">
          <InPhone isWindow>
            <CapacityScene nowMs={nowMs} variant="watch" initialPeriod="month" />
          </InPhone>
        </StateRow>
        <StateRow name="Saturation large" detail="Verte : tout est loin de son plafond.">
          <InWindow>
            <CapacityScene nowMs={nowMs} variant="wide" initialPeriod="all" />
          </InWindow>
        </StateRow>
        <StateRow name="Saturation proche" detail="Rouge : une ressource approche son plafond.">
          <InWindow>
            <CapacityScene nowMs={nowMs} variant="close" initialPeriod="all" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Saturation incomplète"
          detail="Jamais verte : neutre, elle dit « incomplète » et ce qui est sans nouvelles."
        >
          <InWindow>
            <CapacityScene nowMs={nowMs} variant="incomplete" initialPeriod="all" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Des ressources sans nouvelles"
          detail="« sans nouvelles » à la place de la valeur, sans barre ni taux."
        >
          <InWindow>
            <CapacityScene nowMs={nowMs} variant="withoutNews" initialPeriod="all" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Convex non configuré"
          detail="« non mesuré » : le plan et aucun déploiement ; la saturation n'est pas incomplète pour autant."
        >
          <InWindow>
            <CapacityScene nowMs={nowMs} variant="unconfigured" initialPeriod="all" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Un quota plein avant la fin du mois"
          detail="Sa projection dépasse son plafond : le jour où il serait plein, sous son nom."
        >
          <InWindow>
            <CapacityScene nowMs={nowMs} variant="quota" initialPeriod="all" />
          </InWindow>
        </StateRow>
        <StateRow name="Capacité avant la première frame, l'historique en échec">
          <InWindow>
            <CapacitySection
              view={{ ...WAITING_CAPACITY, history: { status: "failed" } }}
              nowMs={nowMs}
              onSelectPeriod={noop}
            />
          </InWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};
