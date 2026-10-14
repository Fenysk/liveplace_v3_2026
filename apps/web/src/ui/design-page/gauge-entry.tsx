// L'entrée Jauge : la jauge dans chacun de ses états, le +1, et une jauge qu'on manipule pour voir ses animations.

import { useEffect, useState } from "react";
import { Button } from "../design/button";
import { ClaimButton, Gauge, type GaugeProps } from "../design/gauge";
import type { GaugeRefill } from "../design/gauge-levels";
import { Pill } from "../design/pill";
import { waitSecondsOf } from "../draft/draft-labels";
import { useCountdownTick } from "../draft/use-draft-pill";
import { noop } from "./design-fixtures";
import { Block, Entry, InPhone, StateRow } from "./entry-layout";

const MAX = 10;
const REFILL_MS = 10_000;
const MS_PER_SECOND = 1000;
const DEMO_PLACEMENT = 3;
const DEMO_REWARDS = 3;

// `refillSeconds` : la recharge d'exemple, en secondes ; `null`, la jauge est pleine.
type GaugeSpecimen = {
  name: string;
  detail?: string;
  props: Omit<GaugeProps, "refill">;
  refillSeconds: number | null;
};

const SPECIMENS: readonly GaugeSpecimen[] = [
  {
    name: "Pleine",
    detail: "L'anneau est plein et immobile, sans chiffre : il n'y a rien à attendre.",
    props: { charges: 10, max: MAX, label: "10 / 10 pixels, jauge pleine" },
    refillSeconds: null,
  },
  {
    name: "En recharge",
    detail:
      "Le nombre dit ce que tu as sur ta capacité. L'anneau avance et son chiffre compte les secondes jusqu'au prochain pixel. Le niveau traverse le nombre : chaque chiffre prend la couleur qui se lit sur ce qu'il recouvre.",
    props: { charges: 5, max: MAX, label: "5 / 10 pixels, +1 pixel dans 12 s" },
    refillSeconds: 12,
  },
  {
    name: "Plus d'une minute",
    detail: "Dès la minute, le minuteur passe en minutes et secondes : « 3:05 ».",
    props: { charges: 4, max: MAX, label: "4 / 10 pixels, +1 pixel dans 3 min 05 s" },
    refillSeconds: 185,
  },
  {
    name: "Brouillon de 3",
    detail: "Le nombre garde son sens ; la partie claire du fluide, ce que le brouillon réserve.",
    props: { charges: 8, max: MAX, draft: 3, label: "8 / 10 pixels, 5 après ce dessin, +1 pixel dans 12 s" },
    refillSeconds: 12,
  },
  { name: "Vide", props: { charges: 0, max: MAX, label: "0 / 10 pixels" }, refillSeconds: 12 },
  {
    name: "À trois chiffres",
    detail: "Le plafond par défaut : « 150/150 » tient dans le tube.",
    props: { charges: 150, max: 150, label: "150 / 150 pixels, jauge pleine" },
    refillSeconds: null,
  },
  {
    name: "Verticale",
    detail: "En colonne, le nombre se pose au-dessus du tube, sur la pill.",
    props: {
      charges: 6,
      max: MAX,
      draft: 2,
      label: "6 / 10 pixels, 4 après ce dessin, +1 pixel dans 12 s",
      orientation: "vertical",
    },
    refillSeconds: 12,
  },
];

// Une recharge qui avance pour de bon : l'anneau et son chiffre, qui repart quand le pixel est rendu.
const useLiveRefill = (seconds: number | null): GaugeRefill | null => {
  const durationMs = (seconds ?? 0) * MS_PER_SECOND;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [endsAt, setEndsAt] = useState(() => nowMs + durationMs);
  useCountdownTick(seconds === null ? undefined : endsAt, setNowMs);
  useEffect(() => {
    if (seconds !== null && nowMs >= endsAt) setEndsAt(nowMs + durationMs);
  }, [seconds, nowMs, endsAt, durationMs]);
  return seconds === null ? null : { endsAt, durationMs, secondsLeft: waitSecondsOf(endsAt - nowMs) };
};

const LiveGauge = ({
  refillSeconds,
  ...props
}: GaugeSpecimen["props"] & Pick<GaugeSpecimen, "refillSeconds">) => {
  const refill = useLiveRefill(refillSeconds);
  return <Gauge {...props} refill={refill} />;
};

// Un pixel revient toutes les dix secondes, tant que la jauge n'est pas pleine. Trois +1 à réclamer.
const useDemoGauge = () => {
  const [max, setMax] = useState(MAX);
  const [rewards, setRewards] = useState(DEMO_REWARDS);
  const [charges, setCharges] = useState(MAX);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [shakeCount, setShakeCount] = useState(0);
  useCountdownTick(endsAt ?? undefined, setNowMs);

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setTimeout(() => {
      const next = Math.min(max, charges + 1);
      setCharges(next);
      setEndsAt(next < max ? Date.now() + REFILL_MS : null);
    }, endsAt - Date.now());
    return () => clearTimeout(timer);
  }, [charges, endsAt, max]);

  const claim = () => {
    setRewards((current) => current - 1);
    setMax((current) => current + 1);
    setCharges((current) => current + 1);
  };

  const place = () => {
    setCharges((current) => Math.max(0, current - DEMO_PLACEMENT));
    setEndsAt((current) => current ?? Date.now() + REFILL_MS);
  };
  const shake = () => setShakeCount((count) => count + 1);
  const restart = () => {
    setRewards(DEMO_REWARDS);
    setMax(MAX);
    setCharges(MAX);
    setEndsAt(null);
  };
  const refill =
    endsAt === null ? null : { endsAt, durationMs: REFILL_MS, secondsLeft: waitSecondsOf(endsAt - nowMs) };
  return { charges, max, rewards, refill, shakeCount, place, shake, claim, restart };
};

export const GaugeEntry = () => {
  const demo = useDemoGauge();
  return (
    <Entry
      slug="jauge"
      components={["Gauge", "ClaimButton"]}
      file="ui/design/gauge.tsx"
      note="Un anneau-minuteur du prochain pixel, puis un tube où les pixels sont un fluide, avec le nombre dedans : ce que tu as sur ta capacité. L'infobulle dit tout, en une phrase."
    >
      <Block title="États">
        {SPECIMENS.map(({ name, detail, props, refillSeconds }) => (
          <StateRow key={name} name={name} detail={detail}>
            <Pill>
              <LiveGauge {...props} refillSeconds={refillSeconds} />
            </Pill>
          </StateRow>
        ))}
      </Block>
      <Block title="Le +1">
        <StateRow
          name="Le +1 à réclamer"
          detail="Un halo doré, un reflet à son arrivée et au survol, jamais en boucle. Son infobulle dit où la jauge passe."
        >
          <ClaimButton max={MAX} onClaim={noop} />
        </StateRow>
      </Block>
      <Block title="À manipuler">
        <StateRow
          name="La jauge"
          detail="Le niveau glisse, l'anneau repart et son chiffre paraît, défile chaque seconde puis s'efface quand la jauge est pleine, la jauge vibre, le +1 la fait grandir."
          isDemo
        >
          <div className="lp-row">
            <Pill>
              <Gauge
                charges={demo.charges}
                max={demo.max}
                label={`${demo.charges} / ${demo.max} pixels`}
                refill={demo.refill}
                shakeCount={demo.shakeCount}
              />
            </Pill>
            {demo.rewards > 0 && <ClaimButton max={demo.max} onClaim={demo.claim} />}
            <Button label={`Poser ${DEMO_PLACEMENT}`} onPress={demo.place} />
            <Button label="Vibrer" onPress={demo.shake} />
            <Button label="Remettre" onPress={demo.restart} />
          </div>
        </StateRow>
      </Block>
      <Block title="Sur mobile">
        <StateRow name="Pleine largeur" detail="La barre du bas.">
          <InPhone>
            <Pill>
              <LiveGauge charges={7} max={MAX} label="7 / 10 pixels" refillSeconds={12} isFill />
            </Pill>
          </InPhone>
        </StateRow>
      </Block>
    </Entry>
  );
};
