// L'entrée Jauge : la jauge dans chacun de ses états, le +1, et une jauge qu'on manipule pour voir ses animations.

import { useEffect, useState } from "react";
import { Button } from "../design/button";
import { ClaimButton, Gauge, type GaugeProps } from "../design/gauge";
import { Pill } from "../design/pill";
import { noop } from "./design-fixtures";
import { Block, Entry, InPhone, StateRow, useNowMs } from "./entry-layout";

const MAX = 10;
const REFILL_MS = 10_000;
const DEMO_PLACEMENT = 3;
const DEMO_REWARDS = 3;

type GaugeSpecimen = {
  name: string;
  detail?: string;
  props: Omit<GaugeProps, "refill">;
  isRefilling: boolean;
};

const SPECIMENS: readonly GaugeSpecimen[] = [
  {
    name: "Pleine",
    detail: "L'anneau est plein et immobile.",
    props: { charges: 10, max: MAX, label: "10 / 10 charges, jauge pleine" },
    isRefilling: false,
  },
  {
    name: "En recharge",
    detail: "L'anneau avance.",
    props: { charges: 4, max: MAX, label: "4 / 10 charges" },
    isRefilling: true,
  },
  {
    name: "Brouillon de 3",
    detail: "Le nombre dit ce qui restera.",
    props: { charges: 8, max: MAX, draft: 3, label: "5 après la pose, 8 / 10 charges" },
    isRefilling: true,
  },
  { name: "Vide", props: { charges: 0, max: MAX, label: "0 / 10 charges" }, isRefilling: true },
  {
    name: "À trois chiffres",
    detail: "Le plafond par défaut.",
    props: { charges: 150, max: 150, label: "150 / 150 charges, jauge pleine" },
    isRefilling: false,
  },
  {
    name: "Verticale",
    props: {
      charges: 6,
      max: MAX,
      draft: 2,
      label: "4 après la pose, 6 / 10 charges",
      orientation: "vertical",
    },
    isRefilling: true,
  },
];

// Une charge revient toutes les dix secondes, tant que la jauge n'est pas pleine. Trois +1 à réclamer.
const useDemoGauge = () => {
  const [max, setMax] = useState(MAX);
  const [rewards, setRewards] = useState(DEMO_REWARDS);
  const [charges, setCharges] = useState(MAX);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [shakeCount, setShakeCount] = useState(0);

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
  return { charges, max, rewards, endsAt, shakeCount, place, shake, claim, restart };
};

export const GaugeEntry = () => {
  const nowMs = useNowMs();
  const demo = useDemoGauge();
  return (
    <Entry
      slug="jauge"
      components={["Gauge", "ClaimButton"]}
      file="ui/design/gauge.tsx"
      note="Le nombre dans l'anneau, les charges en fluide. Les chiffres sont dans l'infobulle."
    >
      <Block title="États">
        {SPECIMENS.map(({ name, detail, props, isRefilling }) => (
          <StateRow key={name} name={name} detail={detail}>
            <Pill>
              <Gauge
                {...props}
                refill={isRefilling ? { endsAt: nowMs + REFILL_MS / 2, durationMs: REFILL_MS } : null}
              />
            </Pill>
          </StateRow>
        ))}
      </Block>
      <Block title="Le +1">
        <StateRow
          name="Le +1 à réclamer"
          detail="Un halo doré, un reflet à son arrivée et au survol, jamais en boucle."
        >
          <ClaimButton onClaim={noop} />
        </StateRow>
      </Block>
      <Block title="À manipuler">
        <StateRow
          name="La jauge"
          detail="Le niveau glisse, l'anneau repart, la jauge vibre, le +1 la fait grandir."
          isDemo
        >
          <div className="lp-row">
            <Pill>
              <Gauge
                charges={demo.charges}
                max={demo.max}
                label={`${demo.charges} / ${demo.max} charges`}
                refill={demo.endsAt === null ? null : { endsAt: demo.endsAt, durationMs: REFILL_MS }}
                shakeCount={demo.shakeCount}
              />
            </Pill>
            {demo.rewards > 0 && <ClaimButton onClaim={demo.claim} />}
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
              <Gauge charges={7} max={MAX} label="7 / 10 charges" refill={null} isFill />
            </Pill>
          </InPhone>
        </StateRow>
      </Block>
    </Entry>
  );
};
