// La jauge (CDC 2026) : un nombre dans un anneau-minuteur, puis un tube où les charges sont un fluide.
// Aucune boucle à nous : l'anneau est une animation du navigateur, le niveau une transition CSS (JOURNAL 2026-09-24).
// Pas d'ondulation au repos : la seule boucle de l'interface est celle de « Reconnexion… » (design system).

import { useEffect, useRef } from "react";
import { type CssVariables, classNames } from "./class-names";
import { type GaugeRefill, gaugeLevels, refillProgress, tiltDirection } from "./gauge-levels";
import { motionEasing, motionMs } from "./motion";

const RING_RADIUS = 16;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const SHAKE_MS = 360;
const SHAKE_KEYFRAMES = [0, -4, 4, -3, 2, 0].map((x) => ({ transform: `translateX(${x}px)` }));
const VIBRATION_MS = 12;
// La surface penche d'environ 1,2 px dans un tube de 14 px pendant un changement, puis se redresse (maquette).
const TILT_DEGREES = 10;
const SLOSH_DEGREES = [0, 12, -9, 6, -3, 0];
const SLOSH_STRETCH = 1.5; // l'agitation dure un peu plus qu'un changement de niveau

export type GaugeProps = {
  charges: number;
  max: number;
  draft?: number; // les charges réservées par le brouillon
  refill: GaugeRefill | null; // `null` : jauge pleine, l'anneau reste plein et immobile
  label: string; // les chiffres, dans l'infobulle et pour les lecteurs d'écran
  shakeCount?: number; // +1 : la jauge vibre
  orientation?: "horizontal" | "vertical";
  isFill?: boolean; // le tube prend la place restante (barre du bas, sur mobile)
};

// L'anneau part de là où en est la recharge, et finit plein à la prochaine charge.
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
  const ring = useRingAnimation(refill);
  const meter = useShake(shakeCount);
  const { count, remainingLevel, chargesLevel } = gaugeLevels(charges, max, draft);
  const draftFluid = useFluidMotion(chargesLevel, orientation, shakeCount);
  const chargeFluid = useFluidMotion(remainingLevel, orientation, shakeCount);
  const percent = (level: number): CssVariables => ({ "--lp-level": `${level * 100}%` });
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
        aria-label="Charges"
        aria-valuetext={label}
      />
      <span className="lp-gauge-count" aria-hidden="true">
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
        <b className="lp-type-numeric">{count}</b>
      </span>
      <span className="lp-fluid" aria-hidden="true">
        <span ref={draftFluid} className="lp-fluid-draft" style={percent(chargesLevel)} />
        <span ref={chargeFluid} className="lp-fluid-charge" style={percent(remainingLevel)} />
      </span>
    </span>
  );
};
