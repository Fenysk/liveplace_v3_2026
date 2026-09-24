// Les fondations : les couleurs en clair et en sombre, la palette du canvas, la typographie, les mesures, les icônes.

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
import { type SpecimenKind, VariableSpecimen } from "../design/variable-specimen";
import { SpecimenSection } from "./specimen-section";

// La clé est le nom de la variable en camelCase : `voidDot` pour `--void-dot`, `space1` pour `--space-1`.
type Usages = Readonly<Record<string, string>>;

const toVariableName = (key: string): string => key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();

const COLOR_USAGES: Usages = {
  void: "Le vide, derrière le canvas. Jamais de texte dessus.",
  voidDot: "Les points du vide, fixes à l'écran et centrés.",
  canvasBorder: "La bordure du canvas.",
  canvasGrid: "La grille, dès qu'une case dépasse 8 px.",
  checkerA: "Le damier du pixel transparent, case claire.",
  checkerB: "Le damier du pixel transparent, case foncée.",
  pillSurface: "Le fond de toutes les pills.",
  pillBorder: "Le contour d'une pill, visible en sombre seulement.",
  chip: "Le fond des boutons secondaires.",
  chipHover: "Le survol d'un bouton secondaire.",
  ink: "Le texte principal.",
  muted: "Le texte secondaire : dates, détails.",
  accent: "L'action principale : Dessiner, Valider.",
  accentHover: "Le survol de l'action principale.",
  onAccent: "Le texte sur l'action principale.",
  danger: "La modération : retirer, bannir. Un refus.",
  onDanger: "Le texte sur la modération.",
  gaugeCharge: "Le fluide des charges restantes, l'anneau.",
  gaugeDraft: "Le fluide réservé par le brouillon.",
  gaugeEmpty: "Le tube vide, la piste de l'anneau.",
  draftOutlineIn: "Le contour du brouillon et le viseur, dedans.",
  draftOutlineOut: "Le contour du brouillon et le viseur, dehors.",
  scrim: "Le voile derrière la fenêtre.",
  focusRing: "L'anneau du focus clavier.",
  twitch: "Le violet de Twitch : Se connecter, seulement.",
  twitchHover: "Le survol de Se connecter.",
  onTwitch: "Le texte sur le violet de Twitch.",
};

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
  {
    title: "Mouvement",
    kind: "motion",
    usages: {
      lpEase: "La seule courbe : douce, sans rebond.",
      lpDur: "Morphing, feuilles, fenêtre, niveau de la jauge.",
      lpDurFade: "Apparitions, fondu des pills.",
      lpDurFast: "Survols, fondu du contenu.",
    },
  },
];

const TYPE_STYLES = [
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
  { icon: TwitchGlyph, name: "twitch (logo officiel)" },
];

const THEMES = [
  { theme: "light", title: "Clair" },
  { theme: "dark", title: "Sombre" },
] as const;

export const FoundationsSection = () => (
  <section className="design-section" aria-labelledby="design-foundations">
    <h2 id="design-foundations" className="lp-type-heading">
      Fondations
    </h2>

    <SpecimenSection
      title="Couleurs"
      note="Les deux thèmes côte à côte. L'interface reste neutre : les couleurs vives sont celles des pixels."
    >
      {THEMES.map(({ theme, title }) => (
        <div key={theme} className="design-theme-column" data-theme={theme}>
          <p className="lp-type-title">{title}</p>
          {Object.entries(COLOR_USAGES).map(([key, usage]) => (
            <VariableSpecimen key={key} name={toVariableName(key)} kind="color" usage={usage} />
          ))}
        </div>
      ))}
    </SpecimenSection>

    <SpecimenSection
      title="Palette du canvas"
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
    </SpecimenSection>

    <SpecimenSection
      title="Typographie"
      note="Nunito, graisses 700 à 900. Un composant porte une classe, il n'écrit jamais de taille."
    >
      <div className="design-list">
        {TYPE_STYLES.map(({ className, sample, usage }) => (
          <div key={className} className="design-type-row">
            <span className={className}>{sample}</span>
            <code className="lp-type-caption">.{className}</code>
            <span className="lp-type-caption lp-muted">{usage}</span>
          </div>
        ))}
      </div>
    </SpecimenSection>

    {MEASURE_SETS.map(({ title, kind, usages }) => (
      <SpecimenSection key={title} title={title}>
        <div className="design-list">
          {Object.entries(usages).map(([key, usage]) => (
            <VariableSpecimen key={key} name={toVariableName(key)} kind={kind} usage={usage} />
          ))}
        </div>
      </SpecimenSection>
    ))}

    <SpecimenSection
      title="Icônes"
      note="Lucide, trait de 2 px arrondi, à la couleur du texte. On en importe une par une."
    >
      {ICONS.map(({ icon: Icon, name }) => (
        <span key={name} className="design-icon">
          <Icon aria-hidden="true" />
          <code className="lp-type-caption">{name}</code>
        </span>
      ))}
    </SpecimenSection>
  </section>
);
