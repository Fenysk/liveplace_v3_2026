// Le chapitre Les pages : l'accueil, la vraie page, au PC, entre deux, à 375 px et à 320 px, puis sans mouvement.

import { type ReactNode, useState } from "react";
import { Button } from "../design/button";
import { HomeContent } from "../home/home-page";
import { Block, Entry, StateRow } from "./entry-layout";

// La page à la largeur d'une fenêtre, ses marges comprises : la mise en page suit la largeur de la page, pas celle de /design.
type HomeWidth = "pc" | "tablet" | "phone" | "narrow";

const InHome = ({ width, children }: { width: HomeWidth; children: ReactNode }) => (
  <div className={`design-in-home design-in-home--${width}`}>{children}</div>
);

export const HomeEntry = () => {
  const [round, setRound] = useState(0);
  return (
    <Entry
      slug="accueil"
      components={["HomeContent"]}
      file="ui/home/home-page.tsx"
      note="La page d'accueil `/` : « LivePlace » en lettres en haut à gauche, une phrase, « Lancer ma fresque », et une scène. Un écran montre un faux stream (des formes et des squelettes, un streamer en silhouette, aucun texte), et devant lui un téléphone montre la vraie interface mobile. Chaque pixel envoyé s'envole de sa case à SA case sur le stream. Tout reste dans la page : aucune connexion, aucune requête."
    >
      <Block title="Rejouer" hasCount={false}>
        <StateRow
          name="La démo seule"
          detail="Un doigt touche des cases puis le bouton, par lots (soleil, herbe), une seule fois. Le premier geste du visiteur l'arrête pour de bon."
          isDemo
        >
          <Button label="Rejouer" onPress={() => setRound((count) => count + 1)} />
        </StateRow>
      </Block>
      <Block title="Au PC">
        <StateRow
          name="Large"
          detail="À partir de 840 px de large : la phrase à gauche, la scène à droite. Le téléphone ne cache jamais la fresque du stream."
          isDemo
        >
          <InHome width="pc">
            <HomeContent key={round} />
          </InHome>
        </StateRow>
        <StateRow name="Entre deux" detail="De 641 à 839 px : la phrase au-dessus de la scène." isDemo>
          <InHome width="tablet">
            <HomeContent key={round} />
          </InHome>
        </StateRow>
      </Block>
      <Block
        title="Sur téléphone"
        note="Le cadre du téléphone disparaît : le vrai téléphone du visiteur en tient lieu. La phrase et le bouton, puis l'écran du stream, la fresque (21 px par case) et la feuille."
      >
        <StateRow name="375 px" isDemo>
          <InHome width="phone">
            <HomeContent key={round} />
          </InHome>
        </StateRow>
        <StateRow
          name="320 px"
          detail="Sans défilement horizontal : les six couleurs tiennent dans la feuille."
          isDemo
        >
          <InHome width="narrow">
            <HomeContent key={round} />
          </InHome>
        </StateRow>
      </Block>
      <Block
        title="Mouvement réduit"
        note="La démo ne joue pas seule, le tchat ne bouge pas, et les pixels envoyés paraissent sur la fresque du stream sans voler."
      >
        <StateRow name="Au PC" detail="Touche des cases, puis Dessiner." isDemo>
          <InHome width="pc">
            <HomeContent isMotionReduced />
          </InHome>
        </StateRow>
      </Block>
    </Entry>
  );
};
