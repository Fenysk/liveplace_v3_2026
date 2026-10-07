// Le développeur (écart §10.3, JOURNAL 2026-10-06) : sa fenêtre et la section Activité, avec les composants qu'elle
// seule utilise, dans chacun de leurs états. Les vrais composants du jeu, avec des chiffres d'exemple, aucune connexion.

import {
  type ActivityPeriod,
  DEVELOPER_USER_ID,
  HOUR_MS,
  MINUTE_MS,
  toActivityPointStarts,
} from "@liveplace/domain";
import type { ActivityCanvas, ActivityFrame, ActivityPoint } from "@liveplace/domain/ports";
import { useMemo, useState } from "react";
import type { ActivityWatchView } from "../../state/activity-watch";
import { Button } from "../design/button";
import { CanvasActivityCard } from "../design/canvas-activity-card";
import { StatTable } from "../design/stat-table";
import { StatTile, StatTiles } from "../design/stat-tile";
import { TimeCharts } from "../design/time-charts";
import { AUDIENCE_COLUMNS, toAudienceRows, toCanvasActivityCard } from "../developer/activity-labels";
import { ActivitySection } from "../developer/activity-section";
import { chartLinesFor, toActivitySlots } from "../developer/activity-slots";
import { DeveloperWindow } from "../developer/developer-window";
import { noop, SAMPLE_BROKEN_PHOTO, SAMPLE_OWNER, SAMPLE_VIEWER } from "./design-fixtures";
import { Specimen, SpecimenSection } from "./specimen-section";

const DAY_MS = 24 * HOUR_MS;

// Des courbes qui ondulent, et un trou : le serveur arrêté une quarantaine de minutes, ou quelques heures.
const PERIOD_SHAPES = {
  day: { count: 1440, stepMs: MINUTE_MS, gap: [600, 640] },
  month: { count: 720, stepMs: HOUR_MS, gap: [200, 206] },
  all: { count: 120, stepMs: DAY_MS, gap: [40, 42] },
} as const;

const samplePoints = (period: ActivityPeriod, nowMs: number): ActivityPoint[] => {
  const { count, stepMs, gap } = PERIOD_SHAPES[period];
  const starts = toActivityPointStarts(nowMs);
  const lastAt = period === "day" ? starts.minute - MINUTE_MS : period === "month" ? starts.hour : starts.day;
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => index < gap[0] || index >= gap[1])
    .map((index) => ({
      at: lastAt - (count - 1 - index) * stepMs,
      people: Math.round(7 + 5 * Math.sin(index / 90) + (index % 5)),
      streamed: index % 300 < 120 ? 2 : 1,
      pixels: Math.round(45 + 40 * Math.sin(index / 40) + (index % 11) * 3),
      signups: index % 97 === 0 ? 1 : 0,
      visits: Math.round(2 + 2 * Math.sin(index / 70) + (index % 3)),
      phoneVisits: index % 3,
      visitMinutes: Math.round(12 + 9 * Math.sin(index / 50) + (index % 7)),
      // Les distincts ne se gardent que par jour : Tout seulement
      ...(period === "all"
        ? {
            activeAccounts: Math.round(14 + 6 * Math.sin(index / 20) + (index % 4)),
            activePlayers: Math.round(8 + 4 * Math.sin(index / 25) + (index % 3)),
            activeStreamers: index % 30 < 12 ? 3 : 2,
          }
        : {}),
    }));
};

const sampleCanvases = (nowMs: number): ActivityCanvas[] => [
  {
    canvasId: "kalyss",
    owner: { userId: "1", ...SAMPLE_OWNER },
    obsViews: 2,
    people: 4,
    guests: 1,
    heat: 1240,
    signups: 2,
    accounts: [
      {
        userId: "1",
        ...SAMPLE_OWNER,
        role: "owner",
        connectedAt: nowMs - 2 * HOUR_MS - 5 * MINUTE_MS,
        devices: ["desktop"],
      },
      {
        userId: "2",
        ...SAMPLE_VIEWER,
        role: "moderator",
        connectedAt: nowMs - 12 * MINUTE_MS,
        devices: ["desktop", "phone"],
      },
      {
        userId: "3",
        ...SAMPLE_BROKEN_PHOTO,
        role: "viewer",
        connectedAt: nowMs - 40_000,
        devices: ["phone"],
      },
    ],
  },
  {
    canvasId: "fenysk",
    owner: { userId: DEVELOPER_USER_ID, login: "fenysk", displayName: "Fenysk" },
    obsViews: 0,
    people: 2,
    guests: 2,
    heat: 0,
    signups: 0,
    accounts: [],
  },
  {
    canvasId: "pixelmoth",
    owner: { userId: "2", ...SAMPLE_VIEWER },
    obsViews: 0,
    people: 0,
    guests: 0,
    heat: 35,
    signups: 1,
    accounts: [],
  },
];

const NO_AUDIENCE = {
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
  activeAccounts: 0,
  activePlayers: 0,
  activeStreamers: 0,
};

const sampleFrame = (nowMs: number): ActivityFrame => ({
  t: "activity",
  now: { people: 6, guests: 3, streamed: 1, pixels: 87, signups: 3 },
  audience: {
    today: {
      visits: 38,
      phoneVisits: 19,
      visitMinutes: 200,
      activeAccounts: 14,
      activePlayers: 9,
      activeStreamers: 3,
    },
    month: {
      visits: 1214,
      phoneVisits: 497,
      visitMinutes: 5461,
      activeAccounts: 212,
      activePlayers: 131,
      activeStreamers: 11,
    },
  },
  canvases: sampleCanvases(nowMs),
});

// La section telle que le développeur la voit, la période choisie redonnant ses courbes.
const SectionSpecimen = ({ nowMs }: { nowMs: number }) => {
  const [period, setPeriod] = useState<ActivityPeriod>("day");
  const view = useMemo<ActivityWatchView>(
    () => ({
      activity: sampleFrame(nowMs),
      period,
      history: { status: "ready", points: samplePoints(period, nowMs) },
    }),
    [period, nowMs],
  );
  return <ActivitySection view={view} nowMs={nowMs} onSelectPeriod={setPeriod} />;
};

const WindowSpecimen = ({ nowMs }: { nowMs: number }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Specimen caption="Ouverte par le bouton Développeur de la pill Compte : sur mobile, une feuille">
      <Button label="Ouvrir la fenêtre Développeur" onPress={() => setIsOpen(true)} />
      <DeveloperWindow isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <SectionSpecimen nowMs={nowMs} />
      </DeveloperWindow>
    </Specimen>
  );
};

const CardSpecimen = ({
  canvas,
  nowMs,
  isOpen,
}: {
  canvas: ActivityCanvas;
  nowMs: number;
  isOpen: boolean;
}) => {
  const [isShown, setIsShown] = useState(isOpen);
  return (
    <div className="design-window-box">
      <CanvasActivityCard
        {...toCanvasActivityCard(canvas, nowMs)}
        isOpen={isShown}
        onToggle={() => setIsShown((shown) => !shown)}
      />
    </div>
  );
};

const WAITING: ActivityWatchView = { activity: null, period: "day", history: { status: "loading" } };

export const DeveloperSection = () => {
  const [nowMs] = useState(() => Date.now());
  const [kalyss, guestsOnly, hotOnly] = sampleCanvases(nowMs);
  const daySlots = toActivitySlots(samplePoints("day", nowMs), "day", nowMs);
  const allSlots = toActivitySlots(samplePoints("all", nowMs), "all", nowMs);
  return (
    <section className="design-section" aria-labelledby="design-developer">
      <h2 id="design-developer" className="lp-type-heading">
        Le développeur
      </h2>

      <SpecimenSection
        title="La fenêtre Développeur"
        note="Ses sections à lui, Activité seule pour l'instant. Les chiffres bougent toutes les 2 s dans le jeu."
      >
        <WindowSpecimen nowMs={nowMs} />
        <Specimen caption="La section Activité, hors de la fenêtre">
          <div className="design-window-box">
            <SectionSpecimen nowMs={nowMs} />
          </div>
        </Specimen>
        <Specimen caption="Avant la première frame et le premier historique">
          <div className="design-window-box">
            <ActivitySection view={WAITING} nowMs={nowMs} onSelectPeriod={noop} />
          </div>
        </Specimen>
        <Specimen caption="Personne nulle part, l'historique en échec">
          <div className="design-window-box">
            <ActivitySection
              view={{
                activity: { ...sampleFrame(nowMs), canvases: [] },
                period: "day",
                history: { status: "failed" },
              }}
              nowMs={nowMs}
              onSelectPeriod={noop}
            />
          </div>
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="StatTile"
        note="Un chiffre de l'instant. Quatre sur une ligne, deux sur mobile."
      >
        <Specimen caption="Les quatre chiffres de Maintenant">
          <div className="design-window-box">
            <StatTiles>
              <StatTile label="Personnes connectées" value="6" note="dont 3 invités" />
              <StatTile label="Canvas streamés" value="1" />
              <StatTile label="Pixels de la dernière minute" value="87" />
              <StatTile label="Nouveaux comptes aujourd'hui" value="3" />
            </StatTiles>
          </div>
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="StatTable"
        note="Un tableau de chiffres : une ligne par chiffre, une colonne par période, une précision sous une valeur. Sur mobile, il garde ses colonnes."
      >
        <Specimen caption="L'audience : aujourd'hui et 30 jours">
          <div className="design-window-box">
            <StatTable
              caption="L'audience d'aujourd'hui et des 30 derniers jours"
              columns={AUDIENCE_COLUMNS}
              rows={toAudienceRows(sampleFrame(nowMs).audience)}
            />
          </div>
        </Specimen>
        <Specimen caption="Sans visite : la durée moyenne n'existe pas, un tiret">
          <div className="design-window-box">
            <StatTable
              caption="L'audience d'un jour sans visite"
              columns={AUDIENCE_COLUMNS}
              rows={toAudienceRows({ today: NO_AUDIENCE, month: NO_AUDIENCE })}
            />
          </div>
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="CanvasActivityCard"
        note="Une ligne par canvas, une carte sur mobile. Le chevron déplie qui est dessus."
      >
        {kalyss && (
          <Specimen caption="Streamé, déplié : rôles, depuis quand, PC ou téléphone, puis les invités">
            <CardSpecimen canvas={kalyss} nowMs={nowMs} isOpen />
          </Specimen>
        )}
        {kalyss && (
          <Specimen caption="Streamé, replié">
            <CardSpecimen canvas={kalyss} nowMs={nowMs} isOpen={false} />
          </Specimen>
        )}
        {guestsOnly && (
          <Specimen caption="Des invités seuls">
            <CardSpecimen canvas={guestsOnly} nowMs={nowMs} isOpen />
          </Specimen>
        )}
        {hotOnly && (
          <Specimen caption="Plus personne, mais des pixels dans l'heure">
            <CardSpecimen canvas={hotOnly} nowMs={nowMs} isOpen />
          </Specimen>
        )}
      </SpecimenSection>

      <SpecimenSection
        title="TimeCharts"
        note="Des courbes sur un même axe du temps. Survoler ou toucher un instant ; un trou là où le serveur était arrêté."
      >
        <Specimen caption="24 h, un point par minute, un trou de 40 min">
          <div className="design-window-box">
            <TimeCharts
              lines={chartLinesFor("day")}
              slots={daySlots}
              emptyText="Aucun point sur cette période."
            />
          </div>
        </Specimen>
        <Specimen caption="Tout, un point par jour : trois courbes de plus, les comptes, joueurs et streamers actifs">
          <div className="design-window-box">
            <TimeCharts
              lines={chartLinesFor("all")}
              slots={allSlots}
              emptyText="Aucun point sur cette période."
            />
          </div>
        </Specimen>
        <Specimen caption="Une autre période se charge : les courbes d'avant, grisées">
          <div className="design-window-box">
            <TimeCharts
              lines={chartLinesFor("day")}
              slots={daySlots}
              emptyText="Aucun point sur cette période."
              isLoading
            />
          </div>
        </Specimen>
        <Specimen caption="Aucun point sur la période">
          <div className="design-window-box">
            <TimeCharts
              lines={chartLinesFor("day")}
              slots={[null, null]}
              emptyText="Aucun point sur cette période."
            />
          </div>
        </Specimen>
      </SpecimenSection>
    </section>
  );
};
