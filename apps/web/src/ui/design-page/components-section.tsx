// Les composants du design system, chacun dans chacun de ses états.

import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import {
  Brush,
  Eraser,
  LocateFixed,
  LogIn,
  Minus,
  Plus,
  Radio,
  Settings,
  Trash,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button, type ButtonProps } from "../design/button";
import { Grabber } from "../design/grabber";
import { ColorChip, CurrentColorButton, Palette, RecentSwatches } from "../design/palette";
import { Pill, PillSeparator, type PillState } from "../design/pill";
import { Avatar, AvatarButton, Profile, type ProfileVariant } from "../design/profile";
import { ThemeButton, ThemePicker } from "../design/theme-controls";
import { pickTheme, useThemeChoice } from "../design/use-theme";
import { Window, WindowRow } from "../design/window";
import { noop, SAMPLE_BROKEN_PHOTO, SAMPLE_OWNER, SAMPLE_VIEWER } from "./design-fixtures";
import { GaugeSpecimens } from "./gauge-specimens";
import { Specimen, SpecimenSection } from "./specimen-section";

const BUTTONS: readonly { caption: string; props: ButtonProps }[] = [
  {
    caption: "Décision principale, raccourci écrit dedans",
    props: { label: "Dessiner", kbd: "D", variant: "primary", onPress: noop },
  },
  { caption: "Valider", props: { label: "Valider", kbd: "⏎", variant: "primary", onPress: noop } },
  {
    caption: "Désactivé",
    props: { label: "Valider", kbd: "⏎", variant: "primary", isDisabled: true, onPress: noop },
  },
  { caption: "Secondaire", props: { label: "Annuler", kbd: "Échap", onPress: noop } },
  {
    caption: "Avec une icône",
    props: { label: "Se connecter", icon: LogIn, variant: "primary", onPress: noop },
  },
  { caption: "Modération", props: { label: "Retirer ses pixels", onPress: noop } },
  { caption: "Modération, danger", props: { label: "Bannir", variant: "danger", onPress: noop } },
  {
    caption: "Icône seule, discrète",
    props: { icon: Trash, variant: "ghost", title: "Vider le brouillon", onPress: noop },
  },
  {
    caption: "Outil armé",
    props: { icon: Eraser, variant: "ghost", title: "Gomme", isPressed: true, onPress: noop },
  },
  {
    caption: "Outil au repos",
    props: { icon: Brush, variant: "ghost", title: "Tracé", isPressed: false, onPress: noop },
  },
  {
    caption: "Lien, nouvel onglet",
    props: {
      icon: Radio,
      variant: "ghost",
      title: "Chaîne Twitch",
      href: "https://www.twitch.tv",
      isNewTab: true,
    },
  },
];

const PILL_STATES: readonly { caption: string; state: PillState }[] = [
  { caption: "Verrouillée : l'envoi du brouillon", state: { kind: "locked" } },
  {
    caption: "Connexion : floue, en noir et blanc, trois points en boucle",
    state: { kind: "reconnecting", label: "Connexion" },
  },
];

const PROFILE_USERS = [
  { caption: "Avec sa photo", user: SAMPLE_OWNER },
  { caption: "Sans photo : son initiale", user: SAMPLE_VIEWER },
  { caption: "Photo introuvable : son initiale", user: SAMPLE_BROKEN_PHOTO },
];
const PROFILE_VARIANTS: readonly ProfileVariant[] = ["avatar", "name", "full"];

const SAMPLE_ROW = (
  <>
    <Button label="Annuler" kbd="Échap" onPress={noop} />
    <Button label="Valider" kbd="⏎" variant="primary" onPress={noop} />
  </>
);

const PillSpecimens = () => {
  const [isVisible, setIsVisible] = useState(true);
  return (
    <>
      <Specimen caption="Une ligne : ronde et concentrique">
        <Pill>{SAMPLE_ROW}</Pill>
      </Specimen>
      <Specimen caption="Rail : la pill Pratique">
        <Pill layout="rail">
          <Button icon={Plus} variant="ghost" title="Zoomer" onPress={noop} />
          <span className="lp-zoom lp-type-numeric">100 %</span>
          <Button icon={Minus} variant="ghost" title="Dézoomer" onPress={noop} />
          <PillSeparator />
          <Button icon={LocateFixed} variant="ghost" title="Recentrer la vue" onPress={noop} />
        </Pill>
      </Specimen>
      {PILL_STATES.map(({ caption, state }) => (
        <Specimen key={caption} caption={caption}>
          <Pill state={state}>{SAMPLE_ROW}</Pill>
        </Specimen>
      ))}
      <Specimen caption="Masquée, puis de retour : fondu et léger glissement">
        <div className="lp-row">
          <Button
            label={isVisible ? "Masquer" : "Montrer"}
            onPress={() => setIsVisible((visible) => !visible)}
          />
          <Pill isVisible={isVisible}>
            <Profile user={SAMPLE_OWNER} variant="full" />
          </Pill>
        </div>
      </Specimen>
    </>
  );
};

const PaletteSpecimens = () => {
  const [colorIndex, setColorIndex] = useState(5);
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <>
      <Specimen caption="À la souris : la gomme en tête">
        <Pill>
          <Palette palette={PALETTE} colorIndex={colorIndex} onPick={setColorIndex} />
        </Pill>
      </Specimen>
      <Specimen caption="Au doigt : six pastilles par rangée, la gomme est dans les outils">
        <Pill>
          <Palette
            palette={PALETTE}
            colorIndex={colorIndex}
            onPick={setColorIndex}
            isTouch
            hasEraser={false}
          />
        </Pill>
      </Specimen>
      <Specimen caption="Une couleur à côté d'un texte">
        <div className="lp-row">
          <ColorChip color={PALETTE[colorIndex] ?? ""}>
            <span className="lp-type-caption">(12, 40)</span>
          </ColorChip>
          <ColorChip>
            <span className="lp-type-caption">transparent</span>
          </ColorChip>
        </div>
      </Specimen>
      <Specimen caption="Mobile : la couleur actuelle ouvre la palette complète">
        <CurrentColorButton
          color={PALETTE[colorIndex]}
          isExpanded={isExpanded}
          onPress={() => setIsExpanded((expanded) => !expanded)}
        />
      </Specimen>
      <Specimen caption="Mobile : les couleurs récentes, dans un ordre stable">
        <div className="lp-row">
          <RecentSwatches
            palette={PALETTE}
            recentColorIndexes={[5, 28, 19, 9]}
            colorIndex={colorIndex}
            onPick={setColorIndex}
          />
        </div>
      </Specimen>
      <Specimen caption="Mobile : la poignée d'une feuille (glisser ou toucher)">
        <div className="design-phone-box">
          <Grabber
            label="Déplier la palette"
            onUp={() => setIsExpanded(true)}
            onDown={() => setIsExpanded(false)}
            onTap={() => setIsExpanded((expanded) => !expanded)}
          />
        </div>
      </Specimen>
      <Specimen caption="Gomme armée">
        <Pill>
          <Palette palette={PALETTE.slice(0, 7)} colorIndex={TRANSPARENT_COLOR_INDEX} onPick={noop} />
        </Pill>
      </Specimen>
    </>
  );
};

type DemoSection = "account" | "preferences";
const DEMO_SECTIONS = [
  { id: "account", label: "Mon compte", icon: User },
  { id: "preferences", label: "Préférences", icon: Settings },
] as const;

const WindowSpecimen = () => {
  const themeChoice = useThemeChoice();
  const [isOpen, setIsOpen] = useState(false);
  const [sectionId, setSectionId] = useState<DemoSection>("account");
  return (
    <Specimen caption="Modale sur un voile : Échap ou Fermer, le focus revient au bouton">
      <Button label="Ouvrir la fenêtre" onPress={() => setIsOpen(true)} />
      <Window
        isOpen={isOpen}
        sections={DEMO_SECTIONS}
        sectionId={sectionId}
        onSelect={setSectionId}
        onClose={() => setIsOpen(false)}
      >
        {sectionId === "account" ? (
          <WindowRow label={<Profile user={SAMPLE_OWNER} variant="full" />}>
            <Button label="Se déconnecter" onPress={noop} />
          </WindowRow>
        ) : (
          <WindowRow label="Thème">
            <ThemePicker choice={themeChoice} onPick={pickTheme} />
          </WindowRow>
        )}
      </Window>
    </Specimen>
  );
};

export const ComponentsSection = () => {
  const themeChoice = useThemeChoice();
  return (
    <section className="design-section" aria-labelledby="design-components">
      <h2 id="design-components" className="lp-type-heading">
        Composants
      </h2>

      <SpecimenSection
        title="Button"
        note="Un texte pour une décision, une icône seule pour une action secondaire."
      >
        {BUTTONS.map(({ caption, props }) => (
          <Specimen key={caption} caption={caption}>
            <Button {...props} />
          </Specimen>
        ))}
      </SpecimenSection>

      <SpecimenSection
        title="Pill"
        note="La seule bulle d'interface. Rayon = contrôle / 2 + marge : ronde à toute taille."
      >
        <PillSpecimens />
      </SpecimenSection>

      <SpecimenSection
        title="Avatar et Profile"
        note="L'avatar et le nom mènent au canvas ; seule l'icône Twitch mène à la chaîne."
      >
        {PROFILE_USERS.map(({ caption, user }) => (
          <Specimen key={caption} caption={caption}>
            <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} />
          </Specimen>
        ))}
        {PROFILE_VARIANTS.map((variant) => (
          <Specimen key={variant} caption={`Profile ${variant}`}>
            <Profile user={SAMPLE_OWNER} variant={variant} />
          </Specimen>
        ))}
        <Specimen caption="Sa propre photo : le bouton Mon compte">
          <AvatarButton user={SAMPLE_OWNER} title="Mon compte" onPress={noop} />
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="Gauge"
        note="Le nombre dans l'anneau, les charges en fluide. Les chiffres sont dans l'infobulle."
      >
        <GaugeSpecimens />
      </SpecimenSection>

      <SpecimenSection title="Palette" note="Les couleurs arrivent par props : la palette de `domain`.">
        <PaletteSpecimens />
      </SpecimenSection>

      <SpecimenSection
        title="Segmented et thème"
        note="Un choix exclusif. Le bouton de thème fait le cycle auto, clair, sombre."
      >
        <Specimen caption="Thème, comme dans Préférences">
          <ThemePicker choice={themeChoice} onPick={pickTheme} />
        </Specimen>
        <Specimen caption="Thème, comme dans la pill Compte">
          <ThemeButton choice={themeChoice} onPick={pickTheme} />
        </Specimen>
      </SpecimenSection>

      <SpecimenSection
        title="Window"
        note="Les sections dépendent du rôle ; seules celles qui servent aujourd'hui existent."
      >
        <WindowSpecimen />
        <Specimen caption="Fermer">
          <Button icon={X} variant="ghost" title="Fermer (Échap)" onPress={noop} />
        </Specimen>
      </SpecimenSection>
    </section>
  );
};
