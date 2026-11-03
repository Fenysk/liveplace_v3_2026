// Le développeur (§10.3) : sa fenêtre et ses quatre sections, dans chacun de leurs
// états. Les vrais composants du jeu, avec des chiffres d'exemple, aucune connexion.

import type { ActivityPeriod } from "@liveplace/domain";
import type { ActivityHere } from "@liveplace/domain/ports";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import type { CapacityWatchView } from "../../state/capacity-watch";
import { ActivitySection } from "../developer/activity-section";
import { BadgesSection, type BadgesView } from "../developer/badges-section";
import { CanvasSection } from "../developer/canvas-section";
import { CapacitySection } from "../developer/capacity-section";
import {
  type DeveloperSectionId,
  DeveloperWindow,
  FIRST_DEVELOPER_SECTION,
} from "../developer/developer-window";
import { dayStartAgo, type SampleDayVariant, sampleDay } from "./activity-day-samples";
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

// Le plus ancien jour gardé des exemples : les flèches ne s'arrêtent qu'à lui.
const FIRST_DAY_AGO = 400;
const DAY_MS = 24 * 3600 * 1000;
const DAY_LOAD_MS = 900; // le temps que prend un jour à se charger dans l'exemple

// Un jour passé choisi dans l'exemple, et s'il est encore en lecture.
type DaySelection = { dayAt: number; isLoading: boolean } | undefined;

// `daysAgo` : la scène s'ouvre sur ce jour passé, absent sur aujourd'hui. `pending` : `first`, le premier jour ne finit jamais de
// charger ; `next`, un autre jour qu'il remplace ne finit jamais de charger, le premier reste grisé. Sinon, chaque jour choisi
// charge un instant, puis se montre.
type SectionSceneProps = {
  nowMs: number;
  sectionId: Exclude<DeveloperSectionId, "capacity" | "badges">;
  here?: ActivityHere;
  daysAgo?: number;
  dayVariant?: SampleDayVariant;
  pending?: "first" | "next";
};

// La section telle que le développeur la voit, la période choisie redonnant ses courbes, et les flèches un autre jour.
// `here` : le canvas de la socket.
const SectionScene = ({
  nowMs,
  sectionId,
  here,
  daysAgo,
  dayVariant = "busy",
  pending,
}: SectionSceneProps) => {
  const [period, setPeriod] = useState<ActivityPeriod>("day");
  const [selection, setSelection] = useState<DaySelection>(() =>
    daysAgo === undefined
      ? undefined
      : { dayAt: dayStartAgo(nowMs, daysAgo), isLoading: pending === "first" },
  );
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectDay = (dayAt: number | undefined) => {
    clearTimeout(timer.current);
    setSelection(dayAt === undefined ? undefined : { dayAt, isLoading: true });
    if (dayAt !== undefined && !pending)
      timer.current = setTimeout(() => setSelection({ dayAt, isLoading: false }), DAY_LOAD_MS);
  };
  // `next` : dès l'ouverture, on choisit le jour d'avant, qui ne se charge pas.
  useEffect(() => {
    if (pending === "next") setSelection({ dayAt: dayStartAgo(nowMs, (daysAgo ?? 0) + 1), isLoading: true });
  }, [pending, nowMs, daysAgo]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const view = useMemo<ActivityWatchView>(
    () => ({
      activity: sampleFrame(nowMs, here),
      period,
      history: {
        status: "ready",
        points: samplePoints(period, nowMs),
        canvasPoints: sampleCanvasPoints(period, nowMs),
      },
      firstDayAt: dayStartAgo(nowMs, FIRST_DAY_AGO),
      past: selection && {
        dayAt: selection.dayAt,
        day: selection.isLoading
          ? { status: "loading" }
          : { status: "ready", ...sampleDay(selection.dayAt, nowMs, dayVariant) },
      },
    }),
    [period, nowMs, here, selection, dayVariant],
  );
  const Section = sectionId === "here" ? CanvasSection : ActivitySection;
  return <Section view={view} nowMs={nowMs} onSelectPeriod={setPeriod} onSelectDay={selectDay} />;
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

// Des dons d'exemple : un nom Ko-fi avec son e-mail, un don anonyme sans e-mail. Jamais un montant.
const sampleWaiting = (nowMs: number): BadgesView => ({
  status: "ready",
  report: {
    holders: 7,
    waiting: [
      {
        donationId: "d1",
        donatedAt: nowMs - 1 * DAY_MS,
        kofiName: "Camille R.",
        email: "camille.r@example.com",
      },
      { donationId: "d2", donatedAt: nowMs - 4 * DAY_MS, kofiName: "jeanmi_83", email: "jeanmi@example.com" },
      { donationId: "d3", donatedAt: nowMs - 6 * DAY_MS },
    ],
  },
});

// Ici, aucun compte ne porte jamais le pseudo : la ligne montre le message d'un pseudo inconnu, et le don reste.
const linkNobody = async (): Promise<"unknown_account"> => "unknown_account";

const BadgesScene = ({ view }: { view: BadgesView }) => <BadgesSection view={view} onLink={linkNobody} />;

// Elle s'ouvre sur Ce canvas, comme dans le jeu ; le choix d'une section ne la ferme pas.
const WindowScene = ({ nowMs, here }: { nowMs: number; here: ActivityHere }) => {
  const [sectionId, setSectionId] = useState<DeveloperSectionId>(FIRST_DEVELOPER_SECTION);
  return (
    <OpenWindow onOpen={() => setSectionId(FIRST_DEVELOPER_SECTION)}>
      {({ isOpen, close }) => (
        <DeveloperWindow isOpen={isOpen} sectionId={sectionId} onSelect={setSectionId} onClose={close}>
          {sectionId === "capacity" ? (
            <CapacityScene nowMs={nowMs} variant="watch" />
          ) : sectionId === "badges" ? (
            <BadgesScene view={sampleWaiting(nowMs)} />
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
      components={[
        "DeveloperWindow",
        "CanvasSection",
        "ActivitySection",
        "CapacitySection",
        "BadgesSection",
        "DaySwitch",
      ]}
      file="ui/developer/{developer-window,canvas-section,activity-section,capacity-section,badges-section,day-switch,past-day}.tsx"
      note="Ses quatre sections à lui : Cette fresque, où elle s'ouvre, Tout LivePlace, Capacité et Badges. Les chiffres bougent toutes les 2 s dans le jeu ; les flèches de la date, en tête de Cette fresque et de Tout LivePlace, relisent un jour passé."
    >
      <Block title="La fenêtre">
        <StateRow
          name="Ouverte par le bouton Développeur de la pill Compte, sur Cette fresque"
          detail="Sur PC, jusqu'à 1 100 px de large et 90 % de la hauteur ; sur mobile, une feuille et des onglets."
        >
          <WindowScene nowMs={nowMs} here={here} />
        </StateRow>
      </Block>
      <Block title="Cette fresque">
        <StateRow name="La section Cette fresque, hors de la fenêtre">
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Cette fresque, à la largeur de la grande fenêtre"
          detail="L'audience et qui est là côte à côte."
        >
          <InLargeWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} />
          </InLargeWindow>
        </StateRow>
        <StateRow
          name="Cette fresque ni streamée ni personne dessus"
          detail="« Personne sur cette fresque en ce moment »."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={quiet} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Cette fresque quand la socket n'en a pas de prête, ou que le gateway est d'avant"
          detail="La section le dit simplement."
        >
          <InWindow>
            <CanvasSection view={noCanvas} nowMs={nowMs} onSelectPeriod={noop} onSelectDay={noop} />
          </InWindow>
        </StateRow>
        <StateRow name="Cette fresque avant la première frame et le premier historique">
          <InWindow>
            <CanvasSection view={WAITING} nowMs={nowMs} onSelectPeriod={noop} onSelectDay={noop} />
          </InWindow>
        </StateRow>
      </Block>
      <Block
        title="Cette fresque, un jour passé"
        note="Les flèches de part et d'autre de la date, en tête des deux sections : le même jour pour Cette fresque et Tout LivePlace, remis à aujourd'hui à la fermeture de la fenêtre. Un jour passé se lit une fois à son choix. Pas de Qui est là : la liste des connectés n'est jamais gardée."
      >
        <StateRow
          name="Cette fresque hier"
          detail="Son streamer en tête, les chiffres du jour, l'audience en une colonne, les courbes de minuit à minuit. Les flèches choisissent un autre jour : il charge un instant, l'ancien reste grisé."
          isDemo
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={1} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Cette fresque hier, à la largeur de la grande fenêtre"
          detail="L'audience au même endroit qu'aujourd'hui."
        >
          <InLargeWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={1} />
          </InLargeWindow>
        </StateRow>
        <StateRow
          name="Cette fresque hier sur mobile"
          detail="Les tuiles par deux, la date entre ses flèches."
        >
          <InPhone isWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={1} />
          </InPhone>
        </StateRow>
        <StateRow
          name="Cette fresque il y a 20 jours"
          detail="Hors des 2 jours de minutes d'une fresque : les courbes sont à l'heure."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={20} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Cette fresque le plus ancien jour gardé"
          detail="La flèche précédente est grisée. Les courbes ne sont plus gardées, seulement les totaux."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={FIRST_DAY_AGO} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Cette fresque un jour sans activité"
          detail="« Aucune activité sur cette fresque ce jour-là »."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={3} dayVariant="quiet" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Cette fresque, premier chargement d'un jour"
          detail="Les tuiles et la zone, en gris, après 200 ms."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={1} pending="first" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Cette fresque, un autre jour se charge"
          detail="Le jour d'avant reste, grisé : rien ne saute."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="here" here={here} daysAgo={1} pending="next" />
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
          detail="L'audience et les fresques côte à côte."
        >
          <InLargeWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} />
          </InLargeWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace avant la première frame et le premier historique"
          detail="Les tuiles de chiffres et les zones, en gris, après 200 ms."
        >
          <InWindow>
            <ActivitySection view={WAITING} nowMs={nowMs} onSelectPeriod={noop} onSelectDay={noop} />
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
              onSelectDay={noop}
            />
          </InWindow>
        </StateRow>
      </Block>
      <Block
        title="Tout LivePlace, un jour passé"
        note="Les chiffres du jour à la place de Maintenant, l'audience en une colonne titrée par la date, les fresques actives ce jour-là avec leur streamer (sans son live de l'instant), puis les courbes de minuit à minuit. Pas de choix de période."
      >
        <StateRow
          name="Tout LivePlace hier"
          detail="Les fresques par minutes streamées, puis personnes, puis pixels. Une fresque archivée depuis y figure aussi ; si elle n'existe plus, la ligne dit « Fresque supprimée »."
          isDemo
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={1} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace hier, à la largeur de la grande fenêtre"
          detail="L'audience et les fresques côte à côte."
        >
          <InLargeWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={1} />
          </InLargeWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace hier sur mobile"
          detail="Les fresques en cartes, leurs chiffres sous le streamer."
        >
          <InPhone isWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={1} />
          </InPhone>
        </StateRow>
        <StateRow
          name="Tout LivePlace il y a 20 jours"
          detail="Hors des 7 jours de minutes : les courbes sont à l'heure."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={20} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace le plus ancien jour gardé"
          detail="La flèche précédente est grisée. Les courbes ne sont plus gardées, seulement les totaux."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={FIRST_DAY_AGO} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace un jour sans fresque active"
          detail="« Aucune fresque active ce jour-là »."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={3} dayVariant="quiet" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace, premier chargement d'un jour"
          detail="Les tuiles et les zones, en gris, après 200 ms."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={1} pending="first" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Tout LivePlace, un autre jour se charge"
          detail="Le jour d'avant reste, grisé : rien ne saute."
        >
          <InWindow>
            <SectionScene nowMs={nowMs} sectionId="all" here={here} daysAgo={1} pending="next" />
          </InWindow>
        </StateRow>
      </Block>
      <Block
        title="Capacité"
        note="Chaque ressource face à son plafond : la saturation en tête, puis les ressources rangées par maillon, puis l'historique. Vert sous 50 %, orange de 50 à 80 %, rouge à partir de 80 %. Au pied du gateway, une ligne Protections : ce qu'il a refusé ou fermé, sans plafond ni part dans la saturation."
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
        <StateRow
          name="Capacité avant la première frame et le premier historique"
          detail="Le grand pourcentage et la place des ressources, en gris, après 200 ms."
        >
          <InWindow>
            <CapacitySection view={WAITING_CAPACITY} nowMs={nowMs} onSelectPeriod={noop} />
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
      <Block
        title="Badges"
        note="Après Capacité. Le nombre de titulaires du badge Soutien, avec son cœur, puis les dons non reliés : le nom Ko-fi, l'e-mail Ko-fi dessous (pour choisir le compte), le jour du don, jamais un montant. Des lignes simples, comme Modération."
      >
        <StateRow
          name="Trois dons non reliés"
          detail="Relier à un compte ouvre, dans la ligne, le champ Pseudo Twitch et le bouton Relier (le seul bouton plein, une ligne à la fois). Dans cet exemple, aucun compte ne porte le pseudo : le message d'un pseudo inconnu s'affiche sur la ligne, rien ne change."
          isDemo
        >
          <InWindow>
            <BadgesScene view={sampleWaiting(nowMs)} />
          </InWindow>
        </StateRow>
        <StateRow name="Aucun don en attente">
          <InWindow>
            <BadgesScene view={{ status: "ready", report: { holders: 7, waiting: [] } }} />
          </InWindow>
        </StateRow>
        <StateRow name="Trois dons non reliés, à la largeur de la grande fenêtre">
          <InLargeWindow>
            <BadgesScene view={sampleWaiting(nowMs)} />
          </InLargeWindow>
        </StateRow>
        <StateRow name="Trois dons non reliés sur mobile" detail="Un onglet de la feuille.">
          <InPhone isWindow>
            <BadgesScene view={sampleWaiting(nowMs)} />
          </InPhone>
        </StateRow>
        <StateRow name="Avant la première lecture" detail="Un squelette, après 200 ms.">
          <InWindow>
            <BadgesScene view={{ status: "loading" }} />
          </InWindow>
        </StateRow>
        <StateRow name="Lecture en échec">
          <InWindow>
            <BadgesScene view={{ status: "failed" }} />
          </InWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};
