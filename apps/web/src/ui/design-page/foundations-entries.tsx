// Le chapitre Fondations : les couleurs en clair et en sombre, la palette du canvas, la typographie, les mesures, le
// mouvement, les icônes.

import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import {
  Brush,
  Eraser,
  LocateFixed,
  LogOut,
  Minus,
  Moon,
  Plus,
  Settings,
  Sun,
  SunMoon,
  Trash,
  User,
  X,
} from "lucide-react";
import type { ButtonIcon } from "../design/button";
import { ColorChip } from "../design/palette";
import { TwitchGlyph } from "../design/twitch";
import { useThemeChoice } from "../design/use-theme";
import { type SpecimenKind, VariableSpecimen, VariableSwatch } from "../design/variable-specimen";
import { Block, Entry, Lines } from "./entry-layout";

// La clé est le nom de la variable en camelCase : `voidDot` pour `--void-dot`, `space1` pour `--space-1`.
type Usages = Readonly<Record<string, string>>;

const toVariableName = (key: string): string => key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();

// Les 39 couleurs de `tokens.css`, rangées par famille.
const COLOR_FAMILIES: readonly { title: string; usages: Usages }[] = [
  {
    title: "Le vide et le canvas",
    usages: {
      void: "Le vide, derrière le canvas. Jamais de texte dessus.",
      voidDot: "Les points du vide, fixes à l'écran et centrés.",
      canvasBorder: "La bordure du canvas.",
      canvasGrid: "La grille, dès qu'une case dépasse 8 px.",
      checkerA: "Le damier du pixel transparent, case claire.",
      checkerB: "Le damier du pixel transparent, case foncée.",
    },
  },
  {
    title: "Les surfaces",
    usages: {
      pillSurface: "Le fond de toutes les pills.",
      pillBorder: "Le contour d'une pill, visible en sombre seulement.",
      chip: "Le fond des boutons secondaires.",
      chipHover: "Le survol d'un bouton secondaire, et ma ligne teintée du classement.",
      scrim: "Le voile derrière la fenêtre.",
    },
  },
  {
    title: "Le texte",
    usages: { ink: "Le texte principal.", muted: "Le texte secondaire : dates, détails." },
  },
  {
    title: "Les actions",
    usages: {
      accent: "L'action principale : Dessiner, Valider.",
      accentHover: "Le survol de l'action principale.",
      onAccent: "Le texte sur l'action principale.",
      danger: "La modération : retirer, bannir. Un refus.",
      onDanger: "Le texte sur la modération.",
      focusRing: "L'anneau du focus clavier.",
    },
  },
  {
    title: "Les états de la capacité",
    usages: {
      success: "Un taux sous 50 % : large. Le vert de la jauge ; au-delà de 80 %, le rouge de la modération.",
      warning: "Un taux de 50 à 80 % : à surveiller. Et « sans nouvelles ».",
    },
  },
  {
    title: "La jauge et le +1",
    usages: {
      gaugeCharge: "Le fluide des charges restantes, l'anneau.",
      gaugeDraft: "Le fluide réservé par le brouillon.",
      gaugeEmpty: "Le tube vide, la piste de l'anneau.",
      claim: "Le +1 à réclamer et son halo : le même or dans les deux thèmes.",
      claimHover: "Le survol du +1.",
      onClaim: "Le texte sur le +1.",
      claimSheen: "Le reflet qui traverse le +1.",
    },
  },
  {
    title: "Le classement",
    usages: {
      rankGoldFrom: "L'anneau du 1er du classement : le départ du dégradé.",
      rankGoldTo: "L'anneau du 1er : l'arrivée du dégradé.",
      rankSilverFrom: "L'anneau du 2e : le départ du dégradé.",
      rankSilverTo: "L'anneau du 2e : l'arrivée du dégradé.",
      rankBronzeFrom: "L'anneau du 3e : le départ du dégradé.",
      rankBronzeTo: "L'anneau du 3e : l'arrivée du dégradé.",
    },
  },
  {
    title: "Le brouillon",
    usages: {
      draftOutlineIn: "Le contour du brouillon et le viseur, dedans.",
      draftOutlineOut: "Le contour du brouillon et le viseur, dehors.",
    },
  },
  {
    title: "Twitch",
    usages: {
      twitch: "Le violet de Twitch : Se connecter, seulement.",
      twitchHover: "Le survol de Se connecter.",
      onTwitch: "Le texte sur le violet de Twitch.",
    },
  },
];

const MEASURE_SETS: readonly { title: string; kind: SpecimenKind; usages: Usages }[] = [
  {
    title: "Espacements",
    kind: "space",
    usages: {
      space1: "Entre deux pastilles de la palette.",
      space2: "La marge intérieure d'une pill, entre deux boutons.",
      space3: "Entre l'anneau et le tube, entre l'avatar et le nom.",
      space4: "Entre une pill et le bord de l'écran.",
    },
  },
  {
    title: "Rayons",
    kind: "radius",
    usages: {
      radiusSm: "Les pastilles de la palette, à la souris.",
      radiusPill: "Boutons, tube, avatars. Le rayon d'une pill se calcule.",
    },
  },
  {
    title: "Tailles",
    kind: "size",
    usages: {
      controlSize: "Tout contrôle : bouton, avatar, anneau.",
      controlSizeTouch: "Au doigt, ou sous 640 px : 44 px au moins.",
    },
  },
  { title: "Ombre", kind: "shadow", usages: { pillShadow: "Une élévation courte, jamais de grande ombre." } },
];

const MOTION_USAGES: Usages = {
  lpEase: "La seule courbe : douce, sans rebond.",
  lpDur: "Morphing, feuilles, fenêtre, niveau de la jauge.",
  lpDurFade: "Apparitions, fondu des pills.",
  lpDurFast: "Survols, fondu du contenu.",
};

const TYPE_STYLES = [
  {
    className: "lp-type-display",
    sample: "62 %",
    usage: "Un seul grand chiffre : la saturation de la capacité. Chiffres tabulaires.",
  },
  { className: "lp-type-heading", sample: "Vue OBS", usage: "Le titre de la section ouverte d'une fenêtre." },
  { className: "lp-type-title", sample: "Kalyss", usage: "Un nom d'affichage, une initiale." },
  { className: "lp-type-body", sample: "Dessiner", usage: "Boutons, lignes de réglage, texte des pills." },
  {
    className: "lp-type-numeric",
    sample: "12",
    usage: "Le nombre de la jauge, le zoom : chiffres tabulaires.",
  },
  { className: "lp-type-caption", sample: "il y a 3 heures", usage: "Les informations secondaires." },
  { className: "lp-type-kbd", sample: "Échap", usage: "Un raccourci écrit dans un bouton." },
] as const;

const ICONS: readonly { icon: ButtonIcon; name: string }[] = [
  { icon: Plus, name: "plus" },
  { icon: Minus, name: "minus" },
  { icon: LocateFixed, name: "locate-fixed" },
  { icon: Eraser, name: "eraser" },
  { icon: Brush, name: "brush" },
  { icon: Trash, name: "trash" },
  { icon: X, name: "x" },
  { icon: LogOut, name: "log-out" },
  { icon: User, name: "user" },
  { icon: Settings, name: "settings" },
  { icon: SunMoon, name: "sun-moon" },
  { icon: Sun, name: "sun" },
  { icon: Moon, name: "moon" },
];

export const ColorTokensEntry = () => (
  <Entry
    slug="couleurs"
    file="ui/design/tokens.css"
    note="L'interface reste neutre : les couleurs vives sont celles des pixels."
  >
    <div>
      <p className="design-colors-legend lp-type-caption lp-muted">
        <span>Clair</span>
        <span>Sombre</span>
      </p>
      <div className="design-colors">
        {COLOR_FAMILIES.map(({ title, usages }) => (
          <section key={title} className="design-family">
            <h2 className="lp-type-title">{title}</h2>
            {Object.entries(usages).map(([key, usage]) => {
              const name = toVariableName(key);
              return (
                <div key={key} className="design-color-row">
                  <VariableSwatch name={name} theme="light" />
                  <VariableSwatch name={name} theme="dark" />
                  <span className="lp-specimen-text">
                    <code className="lp-type-caption">--{name}</code>
                    <span className="lp-type-caption lp-muted">{usage}</span>
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  </Entry>
);

export const CanvasPaletteEntry = () => (
  <Entry
    slug="palette-du-canvas"
    file="packages/domain/src/index.ts"
    note="Elle vit dans `domain` et arrive par le `welcome`, jamais dans le CSS. L'index est le `colorIndex` ; 0 est le transparent."
  >
    <div className="design-palette-grid">
      {PALETTE.map((color, index) => (
        <ColorChip key={color} {...(index === TRANSPARENT_COLOR_INDEX ? {} : { color })}>
          <span className="lp-type-caption">
            {index}{" "}
            <span className="lp-muted">{index === TRANSPARENT_COLOR_INDEX ? "transparent" : color}</span>
          </span>
        </ColorChip>
      ))}
    </div>
  </Entry>
);

export const TypographyEntry = () => (
  <Entry
    slug="typographie"
    file="ui/design/tokens.css"
    note="Nunito, graisses 700 à 900. Un composant porte une classe, il n'écrit jamais de taille."
  >
    <Lines>
      {TYPE_STYLES.map(({ className, sample, usage }) => (
        <div key={className} className="design-type-row">
          <span className={className}>{sample}</span>
          <code className="lp-type-caption">.{className}</code>
          <span className="lp-type-caption lp-muted">{usage}</span>
        </div>
      ))}
    </Lines>
  </Entry>
);

export const MeasuresEntry = () => {
  // Remontées quand le thème change : la valeur d'une ombre se relit dans le thème affiché.
  const themeChoice = useThemeChoice();
  return (
    <Entry slug="mesures" file="ui/design/tokens.css">
      {MEASURE_SETS.map(({ title, kind, usages }) => (
        <Block key={title} title={title} hasCount={false}>
          <Lines>
            {Object.entries(usages).map(([key, usage]) => (
              <VariableSpecimen
                key={`${key}-${themeChoice}`}
                name={toVariableName(key)}
                kind={kind}
                usage={usage}
              />
            ))}
          </Lines>
        </Block>
      ))}
    </Entry>
  );
};

export const MotionEntry = () => (
  <Entry slug="mouvement" file="ui/design/tokens.css">
    <Lines>
      {Object.entries(MOTION_USAGES).map(([key, usage]) => (
        <VariableSpecimen key={key} name={toVariableName(key)} kind="motion" usage={usage} />
      ))}
    </Lines>
  </Entry>
);

export const IconsEntry = () => (
  <Entry
    slug="icones"
    file="lucide-react"
    note="Lucide, trait de 2 px arrondi, à la couleur du texte. On en importe une par une."
  >
    <div className="design-icons">
      {ICONS.map(({ icon: Icon, name }) => (
        <span key={name} className="design-icon">
          <Icon aria-hidden="true" />
          <code className="lp-type-caption">{name}</code>
        </span>
      ))}
      <span className="design-icon">
        <TwitchGlyph />
        <code className="lp-type-caption">twitch</code>
      </span>
    </div>
  </Entry>
);
