// Des courbes empilées sur un même axe du temps (écart §4.3, JOURNAL 2026-10-06) : une par chiffre, chacune sa propre
// échelle, jamais deux axes sur une courbe. Survoler ou toucher un instant pose un repère vertical sur toutes, et une
// infobulle dit l'instant et chaque valeur. Un créneau sans point laisse un trou.

import { type KeyboardEvent, type PointerEvent, useMemo, useState } from "react";
import { classNames } from "./class-names";
import { CHART_HEIGHT, chartMax, nearestSlot, stepSlot, toChartPaths } from "./time-chart-scale";

// Un créneau de l'axe du temps : son instant en toutes lettres, et une valeur par courbe. `null` : aucun point.
export type ChartSlot = { title: string; values: readonly number[] } | null;

// Une courbe : son titre, et sa valeur telle que l'infobulle la dit, accordée (« 2 personnes connectées »).
export type TimeChartLine = { title: string; countLabel: (count: number) => string };

type TimeChartsProps = {
  lines: readonly TimeChartLine[]; // de haut en bas
  slots: readonly ChartSlot[]; // le temps, du plus ancien au plus récent
  emptyText: string; // aucun point sur toute la période
  isLoading?: boolean; // une autre période se charge : les courbes d'avant restent, grisées
};

const formatValue = (value: number): string => value.toLocaleString("fr-FR");

export const TimeCharts = ({ lines, slots, emptyText, isLoading = false }: TimeChartsProps) => {
  const [shownIndex, setShownIndex] = useState<number | null>(null);
  const charts = useMemo(
    () =>
      lines.map(({ title }, chartIndex) => {
        const values = slots.map((slot) => slot?.values[chartIndex] ?? null);
        const max = chartMax(values);
        return { title, max, ...toChartPaths(values, max) };
      }),
    [lines, slots],
  );
  if (slots.every((slot) => slot === null))
    return <span className="lp-type-caption lp-muted">{emptyText}</span>;

  const lastIndex = Math.max(1, slots.length - 1);
  const shown = shownIndex === null ? null : (slots[shownIndex] ?? null);
  const shownAt = ((shownIndex ?? 0) / lastIndex) * 100;

  // Le doigt comme la souris : le créneau le plus proche qui a un point. Au doigt, l'infobulle reste après le toucher.
  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setShownIndex(nearestSlot(Math.round(((event.clientX - box.left) / box.width) * lastIndex), slots));
  };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    setShownIndex((index) => stepSlot(index ?? slots.length - 1, direction, slots));
  };

  return (
    <div
      className={classNames("lp-time-charts", isLoading && "is-loading")}
      // Un curseur sur le temps : les flèches passent d'un point au suivant, le lecteur d'écran dit l'instant.
      role="slider"
      aria-label={lines.map(({ title }) => title).join(", ")}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={lastIndex}
      aria-valuenow={shownIndex ?? lastIndex}
      aria-valuetext={shown?.title}
      tabIndex={0}
      onPointerDown={pointAt}
      onPointerMove={pointAt}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setShownIndex(null);
      }}
      onFocus={() => setShownIndex((index) => index ?? nearestSlot(slots.length - 1, slots))}
      onBlur={() => setShownIndex(null)}
      onKeyDown={step}
    >
      {charts.map(({ title, max, line, area }) => (
        <figure key={title} className="lp-time-chart">
          <figcaption className="lp-time-chart-head lp-type-caption">
            <span>{title}</span>
            <span className="lp-muted">max {formatValue(max)}</span>
          </figcaption>
          <svg viewBox={`0 0 ${lastIndex} ${CHART_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
            <path className="lp-time-chart-area" d={area} />
            <path className="lp-time-chart-line" d={line} vectorEffect="non-scaling-stroke" />
          </svg>
        </figure>
      ))}
      {shown && (
        <>
          <span className="lp-time-charts-crosshair" style={{ left: `${shownAt}%` }} aria-hidden="true" />
          <div
            className={classNames("lp-time-charts-tooltip", shownAt > 55 && "is-flipped")}
            style={{ left: `${shownAt}%` }}
            role="status"
          >
            <span className="lp-type-caption lp-muted">{shown.title}</span>
            {lines.map(({ title, countLabel }, chartIndex) => (
              <span key={title} className="lp-type-caption">
                {countLabel(shown.values[chartIndex] ?? 0)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
