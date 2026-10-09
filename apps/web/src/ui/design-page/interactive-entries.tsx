// Le chapitre Composants (2/2) : ceux qui bougent ou qui ouvrent quelque chose. Les démos se manipulent pour de bon.

import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { LocateFixed, Minus, Plus, User } from "lucide-react";
import { useState } from "react";
import { INITIAL_RECENT_COLOR_INDEXES, rememberColorIndex } from "../../state/recent-color-indexes";
import { ownerToast } from "../archive/archive-texts";
import { switchToast } from "../canvas/switch-toast";
import { AppearancePicker } from "../design/appearance-controls";
import { Button } from "../design/button";
import { Grabber } from "../design/grabber";
import { ColorChip, CurrentColorButton, Palette, RecentSwatches } from "../design/palette";
import { Pill, PillSeparator, type PillState } from "../design/pill";
import { Profile } from "../design/profile";
import { Toast, ToastProvider, useToast } from "../design/toast";
import { ToastAnnouncement, ToastAnnouncementContext, type ToastMessage } from "../design/toast-announcement";
import { SignInButton, SignInNote } from "../design/twitch";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { SmallWindow, Window, WindowRow } from "../design/window";
import { noop, SAMPLE_OWNER } from "./design-fixtures";
import { Block, DIALOG_NOTE, Entry, InPhone, OpenWindow, StateRow, WithValue } from "./entry-layout";

const SAMPLE_ROW = (
  <>
    <Button label="Annuler" kbd="Échap" onPress={noop} />
    <Button label="Valider" kbd="⏎" variant="primary" onPress={noop} />
  </>
);

const PILL_STATES: readonly { name: string; detail: string; state: PillState }[] = [
  { name: "Verrouillée", detail: "L'envoi du brouillon.", state: { kind: "locked" } },
  {
    name: "Connexion",
    detail: "Floue, en noir et blanc, trois points en boucle.",
    state: { kind: "reconnecting", label: "Connexion" },
  },
];

export const PillEntry = () => (
  <Entry
    slug="pill"
    components={["Pill", "PillSeparator"]}
    file="ui/design/pill.tsx"
    note="La seule bulle d'interface. Rayon = contrôle / 2 + marge : ronde à toute taille."
  >
    <Block title="États">
      <StateRow name="Une ligne" detail="Ronde et concentrique.">
        <Pill>{SAMPLE_ROW}</Pill>
      </StateRow>
      <StateRow name="Rail" detail="La pill Pratique.">
        <Pill layout="rail">
          <Button icon={Plus} variant="ghost" title="Zoomer" onPress={noop} />
          <span className="lp-zoom lp-type-numeric">100 %</span>
          <Button icon={Minus} variant="ghost" title="Dézoomer" onPress={noop} />
          <PillSeparator />
          <Button icon={LocateFixed} variant="ghost" title="Recentrer la vue" onPress={noop} />
        </Pill>
      </StateRow>
      {PILL_STATES.map(({ name, detail, state }) => (
        <StateRow key={name} name={name} detail={detail}>
          <Pill state={state}>{SAMPLE_ROW}</Pill>
        </StateRow>
      ))}
      <StateRow name="Masquée, puis de retour" detail="Fondu et léger glissement." isDemo>
        <WithValue initial={true}>
          {(isVisible, setIsVisible) => (
            <div className="lp-row">
              <Button label={isVisible ? "Masquer" : "Montrer"} onPress={() => setIsVisible(!isVisible)} />
              <Pill isVisible={isVisible}>
                <Profile user={SAMPLE_OWNER} variant="full" />
              </Pill>
            </div>
          )}
        </WithValue>
      </StateRow>
    </Block>
  </Entry>
);

// La vraie règle de la rangée : toucher une récente l'échange avec la couleur actuelle, sur place.
const RecentRowScene = () => {
  const [row, setRow] = useState({ colorIndex: 1, recentColorIndexes: INITIAL_RECENT_COLOR_INDEXES });
  const pick = (colorIndex: number) =>
    setRow({
      colorIndex,
      recentColorIndexes: rememberColorIndex(row.recentColorIndexes, row.colorIndex, colorIndex),
    });
  return (
    <div className="lp-row">
      <CurrentColorButton color={PALETTE[row.colorIndex]} onPress={noop} />
      <RecentSwatches palette={PALETTE} recentColorIndexes={row.recentColorIndexes} onPick={pick} />
    </div>
  );
};

export const PaletteEntry = () => {
  const [colorIndex, setColorIndex] = useState(5);
  return (
    <Entry
      slug="palette"
      components={["Palette", "ColorChip", "CurrentColorButton", "RecentSwatches", "Grabber"]}
      file="ui/design/{palette,grabber}.tsx"
      note="Les couleurs arrivent par props : la palette de `domain`."
    >
      <Block title="États">
        <StateRow
          name="À la souris"
          detail="La gomme en tête. Au clavier : Tab arrive sur la couleur actuelle, les flèches la changent, Début et Fin vont aux bouts, Échap rend la main au canvas."
          isDemo
        >
          <Pill>
            <Palette palette={PALETTE} colorIndex={colorIndex} onPick={setColorIndex} />
          </Pill>
        </StateRow>
        <StateRow name="Au doigt" detail="Six pastilles par rangée, la gomme est dans les outils.">
          <Pill>
            <Palette
              palette={PALETTE}
              colorIndex={colorIndex}
              onPick={setColorIndex}
              isTouch
              hasEraser={false}
            />
          </Pill>
        </StateRow>
        <StateRow name="Gomme armée">
          <Pill>
            <Palette palette={PALETTE.slice(0, 7)} colorIndex={TRANSPARENT_COLOR_INDEX} onPick={noop} />
          </Pill>
        </StateRow>
        <StateRow name="Une couleur à côté d'un texte">
          <Pill>
            <ColorChip color={PALETTE[colorIndex] ?? ""}>
              <span className="lp-type-caption">(12, 40)</span>
            </ColorChip>
            <ColorChip>
              <span className="lp-type-caption">transparent</span>
            </ColorChip>
          </Pill>
        </StateRow>
      </Block>
      <Block title="Sur mobile">
        <StateRow name="La couleur actuelle" detail="Elle ouvre la palette complète.">
          <div className="lp-row">
            <CurrentColorButton color={PALETTE[colorIndex]} onPress={noop} />
            <CurrentColorButton onPress={noop} />
          </div>
        </StateRow>
        <StateRow
          name="Les récentes"
          detail="Toucher une récente l'échange avec la couleur actuelle, sur place. Au clavier, les touches 1 à 5 prennent la case de leur rang."
        >
          <RecentRowScene />
        </StateRow>
        <StateRow name="La poignée d'une feuille" detail="Glisser ou toucher.">
          <InPhone>
            <Grabber label="Déplier la palette" onUp={noop} onDown={noop} onTap={noop} />
          </InPhone>
        </StateRow>
      </Block>
    </Entry>
  );
};

// La fenêtre d'un viewer : Mon compte seul. Les sections du streamer et de qui modère suivent, dans leurs entrées.
const DEMO_SECTIONS = [{ id: "account", label: "Mon compte", icon: User }] as const;

export const WindowEntry = () => (
  <Entry slug="fenetre" components={["Window", "SmallWindow"]} file="ui/design/window.tsx">
    <Block title="Grande fenêtre">
      <StateRow
        name="Grande fenêtre"
        detail="Sur PC, jusqu'à 1 100 px de large et 90 % de la hauteur de l'écran ; sur mobile, la même feuille."
      >
        <OpenWindow>
          {({ isOpen, close }) => (
            <Window
              isOpen={isOpen}
              sections={DEMO_SECTIONS}
              sectionId="account"
              onSelect={noop}
              onClose={close}
              isLarge
            >
              <p className="lp-type-body lp-muted">Une section qui profite de la largeur.</p>
            </Window>
          )}
        </OpenWindow>
      </StateRow>
    </Block>
    <Block title="Petite fenêtre" note={DIALOG_NOTE}>
      <StateRow name="Petite fenêtre" detail="Une question ou un avis, sans barre latérale.">
        <OpenWindow>
          {({ isOpen, close }) => (
            <SmallWindow
              isOpen={isOpen}
              title="Une question"
              onClose={close}
              actions={
                <>
                  <Button label="Annuler" kbd="Échap" onPress={close} />
                  <Button label="Confirmer" variant="primary" onPress={close} />
                </>
              }
            >
              <p className="lp-type-body lp-prompt">Une phrase courte, puis la décision.</p>
            </SmallWindow>
          )}
        </OpenWindow>
      </StateRow>
    </Block>
  </Entry>
);

export const AccountWindowEntry = () => {
  const appearanceChoice = useAppearanceChoice();
  return (
    <Entry
      slug="mon-compte"
      components={["Window", "WindowRow"]}
      file="ui/design/window.tsx"
      note="Les sections dépendent du rôle ; seules celles qui servent aujourd'hui existent."
    >
      <Block title="États">
        <StateRow name="Modale sur un voile" detail="Échap ou Fermer, le focus revient au bouton.">
          <OpenWindow>
            {({ isOpen, close }) => (
              <Window
                isOpen={isOpen}
                sections={DEMO_SECTIONS}
                sectionId="account"
                onSelect={noop}
                onClose={close}
              >
                <WindowRow label={<Profile user={SAMPLE_OWNER} variant="full" />}>
                  <Button label="Se déconnecter" onPress={noop} />
                </WindowRow>
                <WindowRow label="Apparence">
                  <AppearancePicker choice={appearanceChoice} onPick={pickAppearance} />
                </WindowRow>
              </Window>
            )}
          </OpenWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};

export const SignInEntry = () => (
  <Entry
    slug="se-connecter"
    components={["SignInButton", "SignInNote"]}
    file="ui/design/twitch.tsx"
    note="Son logo officiel, et Se connecter à ses couleurs : texte blanc sur violet Twitch."
  >
    <Block title="États">
      <StateRow name="Se connecter">
        <SignInButton href="#" label="Se connecter" />
      </StateRow>
      <StateRow name="La ligne sous chaque bouton Se connecter">
        <Pill>
          <SignInNote />
        </Pill>
      </StateRow>
    </Block>
    <Block title="Sur mobile">
      <StateRow name="Logo seul">
        <SignInButton href="#" />
      </StateRow>
    </Block>
  </Entry>
);

// Les vrais toasts, ancrés comme dans le jeu : en bas à gauche, en haut au centre sur mobile.
const ToastButtons = () => {
  const toast = useToast();
  return (
    <div className="lp-row">
      <Button label="Succès" onPress={() => toast("success", "Délai enregistré : 10 s")} />
      <Button label="Erreur" onPress={() => toast("error", "Connexion perdue : la page se reconnecte.")} />
    </div>
  );
};

// Les vrais textes des toasts : celui du streamer qui agit, celui de ses viewers avec ou sans brouillon.
const LIVE = { status: "live", isArchived: false } as const;
const ARCHIVED = { status: "live", isArchived: true } as const;
const viewerToast = (draftSize: number): string =>
  switchToast(LIVE, ARCHIVED, { hasAskedHere: false, ownerName: SAMPLE_OWNER.displayName, draftSize }) ?? "";

const GAME_TOASTS = [
  { name: "Le streamer archive", text: ownerToast("archive") },
  { name: "Le streamer rouvre une archive", text: ownerToast("reopen") },
  { name: "Le streamer supprime une archive", text: ownerToast("discard") },
  { name: "Le lien d'une archive est copié", text: "Lien copié" },
  { name: "Ses viewers, sans brouillon", text: viewerToast(0) },
  { name: "Ses viewers, avec un brouillon non vide", text: viewerToast(3) },
] as const;

// Les deux régions d'un toast sont invisibles dans le jeu : ici elles se montrent, avec ce qu'elles diraient.
const AnnouncementScene = ({ message }: { message: ToastMessage }) => (
  <div className="design-announcement lp-type-body">
    <ToastAnnouncementContext.Provider value={message}>
      <ToastAnnouncement />
    </ToastAnnouncementContext.Provider>
  </div>
);

export const ToastEntry = () => (
  <Entry
    slug="toast"
    components={["Toast", "ToastProvider", "ToastAnnouncement"]}
    file="ui/design/{toast,toast-announcement}.tsx"
    note="Une icône et une phrase, 3 s, un seul à la fois. Il entre et sort comme les pills."
  >
    <Block title="États">
      <StateRow name="Succès">
        <Toast message={{ id: 1, tone: "success", text: "Signalement envoyé" }} isDocked={false} />
      </StateRow>
      <StateRow name="Erreur">
        <Toast
          message={{ id: 2, tone: "error", text: "3 pixels refusés : ils restent dans le brouillon." }}
          isDocked={false}
        />
      </StateRow>
      <StateRow name="En vrai" detail="Ancré au bord de l'écran." isDemo>
        <ToastProvider>
          <ToastButtons />
        </ToastProvider>
      </StateRow>
    </Block>
    <Block
      title="Lecteur d'écran"
      note="Deux régions invisibles, toujours là, que chaque toast remplit : un succès se dit poliment, une erreur tout de suite. Chaque fenêtre a les siennes, la page étant inerte sous elle. L'image du toast n'est pas lue."
    >
      <StateRow name="Succès" detail="La région d'état.">
        <AnnouncementScene message={{ id: 1, tone: "success", text: "Signalement envoyé" }} />
      </StateRow>
      <StateRow name="Erreur" detail="L'alerte.">
        <AnnouncementScene
          message={{ id: 2, tone: "error", text: "3 pixels refusés : ils restent dans le brouillon." }}
        />
      </StateRow>
    </Block>
    <Block
      title="Dans le jeu"
      note="Le streamer qui agit sait où sont ses viewers. Ses viewers lisent qu'il a changé de canvas, pour un archivage comme pour une réouverture, et où reste leur brouillon s'ils en avaient un."
    >
      {GAME_TOASTS.map(({ name, text }) => (
        <StateRow key={name} name={name}>
          <Toast message={{ id: 1, tone: "success", text }} isDocked={false} />
        </StateRow>
      ))}
    </Block>
  </Entry>
);
