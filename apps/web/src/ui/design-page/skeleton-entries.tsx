// Le squelette de chargement : ses formes, les phases d'une attente, et le délai de 200 ms à toucher.

import { useEffect, useState } from "react";
import { Button } from "../design/button";
import { Pill } from "../design/pill";
import { Profile } from "../design/profile";
import {
  SkeletonBar,
  SkeletonBlock,
  SkeletonProfile,
  SkeletonRows,
  SkeletonSlot,
  SkeletonSwap,
  type SkeletonText,
  SkeletonTiles,
  type SkeletonWidth,
} from "../design/skeleton";
import type { SkeletonPhase } from "../design/use-skeleton-phase";
import { SAMPLE_OWNER } from "./design-fixtures";
import { Block, Entry, InSmallWindow, InWindow, StateRow } from "./entry-layout";

const BAR_WIDTHS: readonly { width: SkeletonWidth; name: string; detail?: string }[] = [
  { width: "short", name: "Courte" },
  { width: "medium", name: "Moyenne" },
  { width: "long", name: "Longue" },
  { width: "full", name: "Pleine largeur", detail: "Dans une fenêtre seulement : la pill suit son contenu." },
];

const BAR_TEXTS: readonly SkeletonText[] = ["display", "heading", "title", "body", "caption"];

const PHASES: readonly { phase: SkeletonPhase; name: string; detail: string }[] = [
  {
    phase: "pending",
    name: "Moins de 200 ms",
    detail: "Le squelette est là sans se voir : la place du contenu est déjà prise.",
  },
  { phase: "shown", name: "Plus de 200 ms", detail: "Il se voit." },
  { phase: "revealed", name: "Le contenu arrive", detail: "Il remplace le squelette en fondu." },
];

const SkeletonProfileSlot = ({ phase }: { phase: SkeletonPhase }) => (
  <Pill>
    <SkeletonSlot phase={phase} skeleton={<SkeletonProfile />}>
      <Profile user={SAMPLE_OWNER} variant="name" />
    </SkeletonSlot>
  </Pill>
);

// Touche : la réponse arrive après `replyMs`. En dessous de 200 ms, le squelette ne paraît pas.
const SkeletonDelayScene = ({ replyMs }: { replyMs: number }) => {
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setIsLoading(false), replyMs);
    return () => clearTimeout(timer);
  }, [isLoading, replyMs]);
  return (
    <div className="design-delay-scene">
      <Button label={`Réponse en ${replyMs} ms`} isDisabled={isLoading} onPress={() => setIsLoading(true)} />
      <Pill>
        <SkeletonSwap isLoading={isLoading} skeleton={<SkeletonProfile />}>
          <Profile user={SAMPLE_OWNER} variant="name" />
        </SkeletonSwap>
      </Pill>
    </div>
  );
};

export const SkeletonEntry = () => (
  <Entry
    slug="squelette"
    components={[
      "SkeletonBar",
      "SkeletonBlock",
      "SkeletonProfile",
      "SkeletonRows",
      "SkeletonTiles",
      "SkeletonSlot",
      "SkeletonSwap",
    ]}
    file="ui/design/skeleton.tsx"
    note="Quand un contenu charge, des blocs gris doux à sa forme et à sa taille : rien ne saute quand il arrive. Immobiles, sans aucune boucle. Ils ne paraissent qu'après 200 ms d'attente."
  >
    <Block title="Barres de texte" note="Leur largeur est une variante.">
      {BAR_WIDTHS.map(({ width, name, detail }) => (
        <StateRow key={width} name={name} detail={detail}>
          <InSmallWindow>
            <SkeletonBar width={width} />
          </InSmallWindow>
        </StateRow>
      ))}
      <StateRow
        name="Selon le texte"
        detail="Titre, corps, légende : la barre a la hauteur de ligne du texte qu'elle remplace."
      >
        <InSmallWindow>
          {BAR_TEXTS.map((text) => (
            <SkeletonBar key={text} text={text} />
          ))}
        </InSmallWindow>
      </StateRow>
    </Block>
    <Block title="Blocs">
      <StateRow name="Photo">
        <Pill>
          <SkeletonBlock shape="avatar" />
        </Pill>
      </StateRow>
      <StateRow name="Pastille de couleur">
        <Pill>
          <SkeletonBlock shape="swatch" />
        </Pill>
      </StateRow>
      <StateRow name="Champ de texte">
        <InSmallWindow>
          <SkeletonBlock shape="field" />
        </InSmallWindow>
      </StateRow>
      <StateRow name="Profil" detail="La photo et le nom, à leur écartement.">
        <Pill>
          <SkeletonProfile />
        </Pill>
      </StateRow>
      <StateRow name="Zone" detail="Des courbes, un tableau : la place qu'ils prendront.">
        <InSmallWindow>
          <SkeletonBlock shape="area" />
        </InSmallWindow>
      </StateRow>
    </Block>
    <Block
      title="Dans la fenêtre"
      note="Les listes arrivent par leurs propres lignes, en fondu (arrival.css) : le squelette ne leur ajoute rien."
    >
      <StateRow name="Tuiles de chiffres" detail="La section Activité du développeur.">
        <InWindow>
          <SkeletonTiles />
        </InWindow>
      </StateRow>
      <StateRow name="Lignes de profil" detail="Signalements, modérateurs, bannis : trois lignes.">
        <InWindow>
          <SkeletonRows kind="profile" />
        </InWindow>
      </StateRow>
      <StateRow name="Lignes de fresque" detail="Les archives : trois lignes.">
        <InWindow>
          <SkeletonRows kind="canvas" />
        </InWindow>
      </StateRow>
    </Block>
    <Block
      title="Les phases d'une attente"
      note="SkeletonSwap les enchaîne tout seul ; ici, chacune est figée. Le conteneur dit « Chargement… » aux lecteurs d'écran, les blocs sont muets."
    >
      {PHASES.map(({ phase, name, detail }) => (
        <StateRow key={phase} name={name} detail={detail}>
          <SkeletonProfileSlot phase={phase} />
        </StateRow>
      ))}
    </Block>
    <Block
      title="Le délai"
      note="Touche : sous 200 ms le contenu arrive seul, au-delà le squelette paraît puis s'efface."
    >
      <StateRow name="Réponse rapide" detail="Rien ne clignote." isDemo>
        <SkeletonDelayScene replyMs={100} />
      </StateRow>
      <StateRow name="Réponse lente" detail="Le squelette paraît à 200 ms." isDemo>
        <SkeletonDelayScene replyMs={2000} />
      </StateRow>
    </Block>
  </Entry>
);
