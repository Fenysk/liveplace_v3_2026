// La jauge (CDC 2026) : un anneau-minuteur du prochain pixel, puis un tube où les pixels sont un fluide, le nombre dedans
// (Écart §9.3, JOURNAL 2026-10-13). Aucune boucle à nous : l'anneau est une animation du navigateur, le niveau une transition
// CSS (JOURNAL 2026-09-24). Pas d'ondulation au repos : la seule boucle de l'interface est celle de « Reconnexion… » (design system).

import { useEffect, useRef, useState } from "react";
import { useTexts } from "../locale/use-locale";
import { blurAfterClick } from "./button";
import { type CssVariables, classNames } from "./class-names";
import { DESIGN_TEXTS } from "./design-texts";
import {
  type GaugeLevels,
  type GaugeRefill,
  gaugeLevels,
  refillProgress,
  tiltDirection,
  timerText,
} from "./gauge-levels";
import { motionEasing, motionMs } from "./motion";
import { RollingNumber } from "./rolling-number";

const RING_RADIUS = 16;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const SHAKE_MS = 360;
const SHAKE_KEYFRAMES = [0, -4, 4, -3, 2, 0].map((x) => ({ transform: `translateX(${x}px)` }));
const VIBRATION_MS = 12;
// La surface penche d'environ 1,8 px dans un tube de 20 px pendant un changement, puis se redresse (maquette).
const TILT_DEGREES = 10;
const SLOSH_DEGREES = [0, 12, -9, 6, -3, 0];
const SLOSH_STRETCH = 1.5; // l'agitation dure un peu plus qu'un changement de niveau
const GROW_KEYFRAMES = [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }];

export type GaugeProps = {
  charges: number; // les pixels qu'on a : le nombre du tube, « 8/20 », garde toujours ce sens
  max: number; // la capacité
  draft?: number; // les pixels réservés par le brouillon : la partie claire du fluide
  refill: GaugeRefill | null; // `null` : jauge pleine, l'anneau reste plein et immobile, sans chiffre
  label: string; // les chiffres, dans l'infobulle et pour les lecteurs d'écran
  shakeCount?: number; // +1 : la jauge vibre
  orientation?: "horizontal" | "vertical";
  isFill?: boolean; // le tube prend la place restante (barre du bas, sur mobile)
};

// L'anneau part de là où en est la recharge, et finit plein au prochain pixel.
const useRingAnimation = (refill: GaugeRefill | null) => {
  const ring = useRef<SVGCircleElement>(null);
  const endsAt = refill?.endsAt;
  const durationMs = refill?.durationMs;
  useEffect(() => {
    const element = ring.current;
    if (!element || endsAt === undefined || durationMs === undefined) return;
    const nowMs = Date.now();
    const progress = refillProgress({ endsAt, durationMs }, nowMs);
    const animation = element.animate(
      [{ strokeDashoffset: RING_LENGTH * (1 - progress) }, { strokeDashoffset: 0 }],
      { duration: Math.max(0, endsAt - nowMs), easing: "linear", fill: "forwards" },
    );
    return () => animation.cancel();
  }, [endsAt, durationMs]);
  return ring;
};

type Orientation = NonNullable<GaugeProps["orientation"]>;

const skew = (orientation: Orientation, degrees: number) =>
  orientation === "vertical" ? `skewY(${degrees}deg)` : `skewX(${degrees}deg)`;

// Le fluide penche pendant que son niveau glisse vers sa cible, et s'agite quand la jauge vibre (design system, Gauge).
const useFluidMotion = (level: number, orientation: Orientation, shakeCount: number) => {
  const fluid = useRef<HTMLSpanElement>(null);
  const previousLevel = useRef(level);

  useEffect(() => {
    const element = fluid.current;
    const direction = tiltDirection(previousLevel.current, level);
    previousLevel.current = level;
    if (!element || direction === 0) return;
    const duration = motionMs(element, "--lp-dur");
    if (duration === 0) return;
    const leaning = skew(orientation, -direction * TILT_DEGREES);
    element.animate(
      [
        { transform: skew(orientation, 0) },
        { transform: leaning, offset: 0.35 },
        { transform: skew(orientation, 0) },
      ],
      { duration, easing: motionEasing(element) },
    );
  }, [level, orientation]);

  useEffect(() => {
    const element = fluid.current;
    if (!element || shakeCount === 0) return;
    const duration = motionMs(element, "--lp-dur");
    if (duration === 0) return;
    element.animate(
      SLOSH_DEGREES.map((degrees) => ({ transform: skew(orientation, degrees) })),
      { duration: duration * SLOSH_STRETCH, easing: "ease-out" },
    );
  }, [shakeCount, orientation]);

  return fluid;
};

// Une récompense réclamée : le tube et son nombre grandissent un instant, pendant que le niveau glisse vers le nouveau max.
const useGrowth = (max: number) => {
  const tube = useRef<HTMLSpanElement>(null);
  const previousMax = useRef(max);
  useEffect(() => {
    const element = tube.current;
    const hasGrown = max > previousMax.current;
    previousMax.current = max;
    if (!element || !hasGrown) return;
    const duration = motionMs(element, "--lp-dur");
    if (duration > 0) element.animate(GROW_KEYFRAMES, { duration, easing: motionEasing(element) });
  }, [max]);
  return tube;
};

// Le chiffre de l'anneau reste le temps de son fondu de sortie, avec son dernier texte, puis part de la page.
const useTimerText = (text: string | null): { shown: string | null; isLeaving: boolean } => {
  const [last, setLast] = useState(text);
  if (text !== null && text !== last) setLast(text);
  const isFull = text === null;
  const [isGone, setIsGone] = useState(isFull);
  useEffect(() => {
    if (!isFull) {
      setIsGone(false);
      return;
    }
    const timer = setTimeout(() => setIsGone(true), motionMs(document.documentElement, "--lp-dur-fade"));
    return () => clearTimeout(timer);
  }, [isFull]);
  return { shown: isFull && isGone ? null : last, isLeaving: isFull };
};

// Le minuteur du prochain pixel : le chiffre paraît quand la jauge cesse d'être pleine, ses chiffres défilent à chaque seconde
// (seuls ceux qui changent), il s'efface quand elle se remplit.
const TimerNumber = ({ text }: { text: string | null }) => {
  const { shown, isLeaving } = useTimerText(text);
  if (shown === null) return null;
  return (
    <b
      className={classNames(
        "lp-gauge-timer-text lp-type-numeric",
        shown.length > 3 && "is-long",
        isLeaving && "is-leaving",
      )}
    >
      <RollingNumber value={shown} />
    </b>
  );
};

const percent = (level: number): CssVariables => ({ "--lp-level": `${level * 100}%` });

type TubeNumberProps = { text: string } & GaugeLevels;

// Les trois couches du nombre du tube : chacune a la couleur lisible sur ce qu'elle recouvre (le vide, le fluide réservé, le
// fluide restant), rognée au niveau de ce fluide : un chiffre à cheval sur deux change de couleur au bord, AA sur chacun.
const TubeNumber = ({ text, chargesLevel, remainingLevel }: TubeNumberProps) => (
  <>
    <span className="lp-gauge-text lp-gauge-text--empty lp-type-numeric" aria-hidden="true">
      {text}
    </span>
    <span
      className="lp-gauge-text lp-gauge-text--draft lp-type-numeric"
      style={percent(chargesLevel)}
      aria-hidden="true"
    >
      {text}
    </span>
    <span
      className="lp-gauge-text lp-gauge-text--charge lp-type-numeric"
      style={percent(remainingLevel)}
      aria-hidden="true"
    >
      {text}
    </span>
  </>
);

// JOURNAL 2026-09-30 : le +1 à réclamer, à la place de Dessiner en Vue. Un reflet le traverse à son arrivée.
export const ClaimButton = ({ max, onClaim }: { max: number; onClaim: () => void }) => {
  const t = useTexts(DESIGN_TEXTS);
  const effect = t.claimGauge(max);
  return (
    <button
      type="button"
      className="lp-btn lp-claim lp-type-body"
      aria-label={effect}
      title={effect}
      onClick={blurAfterClick(onClaim)}
    >
      <span className="lp-type-numeric">+1</span>
    </button>
  );
};

const useShake = (shakeCount: number) => {
  const meter = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (shakeCount === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    meter.current?.animate(SHAKE_KEYFRAMES, { duration: SHAKE_MS, easing: "ease" });
    navigator.vibrate?.(VIBRATION_MS);
  }, [shakeCount]);
  return meter;
};

export const Gauge = ({
  charges,
  max,
  draft = 0,
  refill,
  label,
  shakeCount = 0,
  orientation = "horizontal",
  isFill = false,
}: GaugeProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const ring = useRingAnimation(refill);
  const tube = useGrowth(max);
  const meter = useShake(shakeCount);
  const levels = gaugeLevels(charges, max, draft);
  const draftFluid = useFluidMotion(levels.chargesLevel, orientation, shakeCount);
  const chargeFluid = useFluidMotion(levels.remainingLevel, orientation, shakeCount);
  return (
    <span
      ref={meter}
      className={classNames(
        "lp-gauge",
        orientation === "vertical" && "lp-gauge--v",
        isFill && "lp-gauge--fill",
        !refill && "is-full",
      )}
      title={label}
    >
      {/* Le dessin est muet : un vrai `<meter>`, invisible, porte la valeur pour les lecteurs d'écran. */}
      <meter
        className="lp-visually-hidden"
        min={0}
        max={max}
        value={charges}
        aria-label={t.charges}
        aria-valuetext={label}
      />
      <span className="lp-gauge-timer" aria-hidden="true">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="lp-gauge-track" cx="18" cy="18" r={RING_RADIUS} />
          {/* Sans recharge en cours, l'anneau est plein : pas d'animation, `strokeDashoffset` à 0. */}
          <circle
            ref={ring}
            className="lp-gauge-ring"
            cx="18"
            cy="18"
            r={RING_RADIUS}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={refill ? RING_LENGTH : 0}
          />
        </svg>
        <TimerNumber text={refill ? timerText(refill.secondsLeft) : null} />
      </span>
      <span ref={tube} className="lp-gauge-tube">
        <span className="lp-fluid" aria-hidden="true">
          <span ref={draftFluid} className="lp-fluid-draft" style={percent(levels.chargesLevel)} />
          <span ref={chargeFluid} className="lp-fluid-charge" style={percent(levels.remainingLevel)} />
        </span>
        <TubeNumber text={`${charges}/${max}`} {...levels} />
      </span>
    </span>
  );
};
