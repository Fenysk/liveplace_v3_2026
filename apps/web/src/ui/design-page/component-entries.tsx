// Le chapitre Composants (1/2) : ce qui se montre sans état de jeu autour. Chacun dans chacun de ses états.

import { toRatio } from "@liveplace/domain/capacity";
import type { ActivityCanvas } from "@liveplace/domain/ports";
import { Brush, Eraser, LogOut, Shield, Trash, X } from "lucide-react";
import type { ProgressChoice } from "../../usecase/canvas-switch";
import { PROGRESS_LABEL, progressOptions, THEME_LABEL, THEME_PLACEHOLDER } from "../archive/archive-texts";
import { PNG_BACKGROUND_OPTIONS } from "../archive/download-window";
import type { PngBackground } from "../archive/png-export";
import { AppearanceButton, AppearancePicker } from "../design/appearance-controls";
import { Badge } from "../design/badge";
import { Button, type ButtonProps } from "../design/button";
import { CanvasActivityCard, CanvasActivityOwner, ConnectedAccounts } from "../design/canvas-activity-card";
import { CapacityLinkRows, CapacityRow } from "../design/capacity-row";
import { Checkbox } from "../design/checkbox";
import { ChoiceList } from "../design/choice-list";
import { CopyButton } from "../design/copy-button";
import { SwatchChoice } from "../design/palette";
import { Pill } from "../design/pill";
import { PixelPreview } from "../design/pixel-preview";
import { Avatar, AvatarButton, Profile, type ProfileVariant } from "../design/profile";
import { SaturationFigure } from "../design/saturation-figure";
import { Slider } from "../design/slider";
import { StatTable } from "../design/stat-table";
import { StatTile, StatTiles } from "../design/stat-tile";
import { TextField } from "../design/text-field";
import { TimeCharts } from "../design/time-charts";
import { TwitchGlyph } from "../design/twitch";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import {
  AUDIENCE_COLUMNS,
  toActivityAccounts,
  toAudienceRows,
  toCanvasActivityCard,
  toCanvasAudienceRows,
  toGuestsLine,
  toObsTitle,
} from "../developer/activity-labels";
import {
  canvasChartLinesFor,
  chartLinesFor,
  toActivitySlots,
  toCanvasSlots,
} from "../developer/activity-slots";
import { formatRate, toRowState } from "../developer/capacity-labels";
import { CAPACITY_LINES, toCapacitySlots } from "../developer/capacity-slots";
import {
  NO_AUDIENCE,
  sampleCanvases,
  sampleCanvasPoints,
  sampleFrame,
  sampleHere,
  samplePoints,
} from "./activity-samples";
import { sampleCapacityPoints } from "./capacity-samples";
import {
  noop,
  SAMPLE_BROKEN_PHOTO,
  SAMPLE_CANVAS,
  SAMPLE_DRAWING,
  SAMPLE_OWNER,
  SAMPLE_SPREAD,
  SAMPLE_VIEWER,
} from "./design-fixtures";
import {
  Block,
  Entry,
  InPhone,
  InSmallWindow,
  InWindow,
  StateRow,
  useNowMs,
  WithValue,
} from "./entry-layout";

const PREVIEWS = [
  { name: "Un petit dessin", detail: "Cadré de près, la gomme en croix.", pixels: SAMPLE_DRAWING },
  { name: "Des pixels dispersés", detail: "Tout le canvas.", pixels: SAMPLE_SPREAD },
];

export const PixelPreviewEntry = () => (
  <Entry
    slug="apercu-de-pixels"
    components={["PixelPreview"]}
    file="ui/design/pixel-preview.tsx"
    note="Des pixels seuls, sur le damier du canvas et dans sa bordure. Immobile."
  >
    <Block title="États">
      {PREVIEWS.map(({ name, detail, pixels }) => (
        <StateRow key={name} name={name} detail={detail}>
          <InSmallWindow>
            <PixelPreview {...SAMPLE_CANVAS} pixels={pixels} label={name} />
          </InSmallWindow>
        </StateRow>
      ))}
    </Block>
  </Entry>
);

const PROFILE_USERS = [
  { name: "Avec sa photo", detail: undefined, user: SAMPLE_OWNER },
  { name: "Sans photo", detail: "Son initiale.", user: SAMPLE_VIEWER },
  { name: "Photo introuvable", detail: "Son initiale.", user: SAMPLE_BROKEN_PHOTO },
];
const PROFILE_VARIANTS: readonly ProfileVariant[] = ["avatar", "name", "full"];

export const ProfileEntry = () => (
  <Entry
    slug="avatar-et-profil"
    components={["Avatar", "Profile", "AvatarButton"]}
    file="ui/design/profile.tsx"
    note="L'avatar et le nom mènent au canvas ; seule l'icône Twitch mène à la chaîne."
  >
    <Block title="Avatar">
      {PROFILE_USERS.map(({ name, detail, user }) => (
        <StateRow key={name} name={name} detail={detail}>
          <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} />
        </StateRow>
      ))}
    </Block>
    <Block title="Profile">
      {PROFILE_VARIANTS.map((variant) => (
        <StateRow key={variant} name={variant}>
          <Pill>
            <Profile user={SAMPLE_OWNER} variant={variant} />
          </Pill>
        </StateRow>
      ))}
    </Block>
    <Block title="Mon compte">
      <StateRow name="Sa propre photo" detail="Le bouton Mon compte.">
        <AvatarButton user={SAMPLE_OWNER} title="Mon compte" onPress={noop} />
      </StateRow>
    </Block>
  </Entry>
);

export const BadgeEntry = () => (
  <Entry slug="badge" components={["Badge"]} file="ui/design/badge.tsx">
    <Block title="États">
      <StateRow name="Les badges" detail="D'où vient un modérateur ou un ban.">
        <div className="lp-row">
          <Badge label="Twitch" icon={TwitchGlyph} />
          <Badge label="Nommé ici" />
        </div>
      </StateRow>
    </Block>
  </Entry>
);

const TEXT_BUTTONS: readonly { name: string; props: ButtonProps }[] = [
  {
    name: "Décision principale, raccourci écrit dedans",
    props: { label: "Dessiner", kbd: "D", variant: "primary", onPress: noop },
  },
  { name: "Valider", props: { label: "Valider", kbd: "⏎", variant: "primary", onPress: noop } },
  {
    name: "Désactivé",
    props: { label: "Valider", kbd: "⏎", variant: "primary", isDisabled: true, onPress: noop },
  },
  { name: "Secondaire", props: { label: "Annuler", kbd: "Échap", onPress: noop } },
  { name: "Avec une icône", props: { label: "Se déconnecter", icon: LogOut, onPress: noop } },
  { name: "Modération", props: { label: "Retirer ses pixels", onPress: noop } },
  { name: "Modération, danger", props: { label: "Bannir", variant: "danger", onPress: noop } },
];

const ICON_BUTTONS: readonly { name: string; props: ButtonProps }[] = [
  { name: "Discrète", props: { icon: Trash, variant: "ghost", title: "Vider le brouillon", onPress: noop } },
  {
    name: "Outil armé",
    props: { icon: Eraser, variant: "ghost", title: "Gomme", isPressed: true, onPress: noop },
  },
  {
    name: "Outil au repos",
    props: { icon: Brush, variant: "ghost", title: "Tracé", isPressed: false, onPress: noop },
  },
  {
    name: "Lien, nouvel onglet",
    props: {
      icon: TwitchGlyph,
      variant: "ghost",
      title: "Chaîne Twitch",
      href: "https://www.twitch.tv",
      isNewTab: true,
    },
  },
  { name: "Fermer", props: { icon: X, variant: "ghost", title: "Fermer (Échap)", onPress: noop } },
  {
    name: "Quelque chose attend",
    props: { icon: Shield, variant: "ghost", title: "Modération", hasDot: true, onPress: noop },
  },
];

export const ButtonEntry = () => (
  <Entry
    slug="bouton"
    components={["Button"]}
    file="ui/design/button.tsx"
    note="Un texte pour une décision, une icône seule pour une action secondaire."
  >
    <Block title="Avec un texte">
      {TEXT_BUTTONS.map(({ name, props }) => (
        <StateRow key={name} name={name}>
          <Button {...props} />
        </StateRow>
      ))}
    </Block>
    <Block title="Icône seule">
      {ICON_BUTTONS.map(({ name, props }) => (
        <StateRow key={name} name={name}>
          <Button {...props} />
        </StateRow>
      ))}
    </Block>
  </Entry>
);

// Une carte qu'on déplie et replie : le chevron est le vrai.
const ActivityCardScene = ({
  canvas,
  nowMs,
  isOpen,
}: {
  canvas: ActivityCanvas;
  nowMs: number;
  isOpen: boolean;
}) => (
  <WithValue initial={isOpen}>
    {(isShown, setIsShown) => (
      <InWindow>
        <CanvasActivityCard
          {...toCanvasActivityCard(canvas, nowMs)}
          isOpen={isShown}
          onToggle={() => setIsShown(!isShown)}
        />
      </InWindow>
    )}
  </WithValue>
);

const NO_ONE_HERE = "Personne sur ce canvas en ce moment.";

export const ActivityCardEntry = () => {
  const nowMs = useNowMs();
  const [kalyss, guestsOnly, hotOnly] = sampleCanvases(nowMs);
  const here = sampleHere(nowMs);
  const accounts = toActivityAccounts(here.accounts, nowMs);
  return (
    <Entry
      slug="carte-d-activite"
      components={["CanvasActivityCard", "CanvasActivityOwner", "ConnectedAccounts"]}
      file="ui/design/canvas-activity-card.tsx"
      note="Une ligne par canvas, une carte sur mobile. Le chevron déplie qui est dessus."
    >
      <Block title="Carte">
        {kalyss && (
          <StateRow name="Streamé, déplié" detail="Rôles, depuis quand, PC ou téléphone, puis les invités.">
            <ActivityCardScene canvas={kalyss} nowMs={nowMs} isOpen />
          </StateRow>
        )}
        {kalyss && (
          <StateRow name="Streamé, replié">
            <ActivityCardScene canvas={kalyss} nowMs={nowMs} isOpen={false} />
          </StateRow>
        )}
        {guestsOnly && (
          <StateRow name="Des invités seuls">
            <ActivityCardScene canvas={guestsOnly} nowMs={nowMs} isOpen />
          </StateRow>
        )}
        {hotOnly && (
          <StateRow name="Plus personne, mais des pixels dans l'heure">
            <ActivityCardScene canvas={hotOnly} nowMs={nowMs} isOpen />
          </StateRow>
        )}
      </Block>
      <Block
        title="Streamer"
        note="Le streamer d'un canvas, et sa pastille OBS quand il est streamé : en tête de Ce canvas, et dans chaque carte."
      >
        <StateRow name="Streamé" detail="La pastille, ses vues OBS en infobulle.">
          <Pill>
            <CanvasActivityOwner owner={here.owner} obsTitle={toObsTitle(here.obsViews)} />
          </Pill>
        </StateRow>
        <StateRow name="Pas streamé" detail="Aucune pastille.">
          <Pill>
            <CanvasActivityOwner owner={here.owner} obsTitle={toObsTitle(0)} />
          </Pill>
        </StateRow>
      </Block>
      <Block
        title="Comptes connectés"
        note="Les comptes connectés d'un canvas, puis ses invités : « Qui est là » de Ce canvas, et le chevron d'une carte."
      >
        <StateRow name="Rôle, depuis quand, PC ou téléphone, puis les invités">
          <InWindow>
            <ConnectedAccounts
              accounts={accounts}
              guestsLine={toGuestsLine(here.guests)}
              emptyText={NO_ONE_HERE}
            />
          </InWindow>
        </StateRow>
        <StateRow name="Des invités seuls">
          <InWindow>
            <ConnectedAccounts accounts={[]} guestsLine={toGuestsLine(2)} emptyText={NO_ONE_HERE} />
          </InWindow>
        </StateRow>
        <StateRow name="Personne" detail="Une phrase le dit.">
          <InWindow>
            <ConnectedAccounts accounts={[]} guestsLine={toGuestsLine(0)} emptyText={NO_ONE_HERE} />
          </InWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};

const SLIDER_STEPS = [
  { value: 0, label: "Aucun" },
  { value: 1, label: "Peu" },
  { value: 2, label: "Moyen" },
  { value: 3, label: "Beaucoup" },
] as const;

export const FieldsEntry = () => (
  <Entry
    slug="champs"
    components={["TextField", "Checkbox", "Slider", "CopyButton"]}
    file="ui/design/{text-field,checkbox,slider,copy-button}.tsx"
    note="Un curseur à crans fixes, une case à cocher, et une valeur à copier : tout le champ est le bouton."
  >
    <Block title="Champ de texte">
      <StateRow name="Champ de texte" detail="Le thème facultatif d'un canvas.">
        <InSmallWindow>
          <WithValue initial="">
            {(theme, setTheme) => (
              <TextField
                label={THEME_LABEL}
                placeholder={THEME_PLACEHOLDER}
                value={theme}
                maxLength={40}
                onInput={setTheme}
              />
            )}
          </WithValue>
        </InSmallWindow>
      </StateRow>
      <StateRow name="Champ de texte désactivé">
        <InSmallWindow>
          <TextField label={THEME_LABEL} value="Printemps" onInput={noop} isDisabled />
        </InSmallWindow>
      </StateRow>
    </Block>
    <Block title="Case à cocher">
      <StateRow name="Une case à cocher" detail="Le libellé la coche aussi.">
        <InSmallWindow>
          <WithValue initial={false}>
            {(isChecked, setIsChecked) => (
              <Checkbox label="Retirer tous ses pixels" isChecked={isChecked} onToggle={setIsChecked} />
            )}
          </WithValue>
        </InSmallWindow>
      </StateRow>
      <StateRow name="Case désactivée, cochée">
        <InSmallWindow>
          <Checkbox label="Retirer tous ses pixels" isChecked onToggle={noop} isDisabled />
        </InSmallWindow>
      </StateRow>
    </Block>
    <Block title="Curseur">
      <StateRow name="Des crans fixes" detail="La valeur choisie, les deux bouts.">
        <InWindow>
          <WithValue initial={1}>
            {(value, setValue) => (
              <Slider label="Réglage" steps={SLIDER_STEPS} value={value} onPick={setValue} />
            )}
          </WithValue>
        </InWindow>
      </StateRow>
      <StateRow name="Désactivé">
        <InWindow>
          <Slider label="Réglage" steps={SLIDER_STEPS} value={2} onPick={noop} isDisabled />
        </InWindow>
      </StateRow>
    </Block>
    <Block title="Valeur à copier">
      <StateRow name="Copier, puis « Copié » un instant">
        <InWindow>
          <CopyButton value="liveplace.tv/kalyss" copyText="https://liveplace.tv/kalyss" />
        </InWindow>
      </StateRow>
    </Block>
  </Entry>
);

// Une ligne de capacité sur un nombre de connexions : les mêmes mots et les mêmes teintes que le jeu, qui les tire de `domain`.
const ratioRow = (name: string, value: number, ceiling: number, note?: string) => (
  <CapacityRow
    name={name}
    note={note}
    state={toRowState({
      link: "gateway",
      id: "gatewayConnections",
      unit: "connections",
      state: "measured",
      value,
      ceiling,
      ratio: toRatio(value, ceiling),
    })}
  />
);

export const StatTilesEntry = () => {
  const nowMs = useNowMs();
  const { audience } = sampleFrame(nowMs);
  return (
    <Entry
      slug="chiffres"
      components={[
        "StatTiles",
        "StatTile",
        "StatTable",
        "SaturationFigure",
        "CapacityLinkRows",
        "CapacityRow",
      ]}
      file="ui/design/{stat-tile,stat-table,saturation-figure,capacity-row}.tsx"
      note="Un chiffre de l'instant. Quatre sur une ligne, deux sur mobile. La capacité a les siens : la saturation en grand, et les ressources en lignes."
    >
      <Block title="Tuiles">
        <StateRow name="Les quatre chiffres de Maintenant">
          <InWindow>
            <StatTiles>
              <StatTile label="Personnes connectées" value="6" note="dont 3 invités" />
              <StatTile label="Canvas streamés" value="1" />
              <StatTile label="Pixels de la dernière minute" value="87" />
              <StatTile label="Nouveaux comptes aujourd'hui" value="3" />
            </StatTiles>
          </InWindow>
        </StateRow>
      </Block>
      <Block
        title="Tableau"
        note="Un tableau de chiffres : une ligne par chiffre, une colonne par période, une précision sous une valeur. Sur mobile, il garde ses colonnes."
      >
        <StateRow name="L'audience" detail="Aujourd'hui et 30 jours.">
          <InWindow>
            <StatTable
              caption="L'audience d'aujourd'hui et des 30 derniers jours"
              columns={AUDIENCE_COLUMNS}
              rows={toAudienceRows(audience)}
            />
          </InWindow>
        </StateRow>
        <StateRow name="Sans visite" detail="La durée moyenne n'existe pas, un tiret.">
          <InWindow>
            <StatTable
              caption="L'audience d'un jour sans visite"
              columns={AUDIENCE_COLUMNS}
              rows={toAudienceRows({ today: NO_AUDIENCE, month: NO_AUDIENCE })}
            />
          </InWindow>
        </StateRow>
        <StateRow
          name="L'audience d'un canvas"
          detail="Ses joueurs actifs et les nouveaux comptes venus de sa page."
        >
          <InWindow>
            <StatTable
              caption="L'audience de ce canvas, aujourd'hui et sur les 30 derniers jours"
              columns={AUDIENCE_COLUMNS}
              rows={toCanvasAudienceRows(sampleHere(nowMs).audience)}
            />
          </InWindow>
        </StateRow>
      </Block>
      <Block
        title="La saturation"
        note="Le plus haut des taux, en grand, et la ressource qui le porte. Vert sous 50 %, orange de 50 à 80 %, rouge à partir de 80 %."
      >
        <StateRow name="Large" detail="Sous 50 %.">
          <InWindow>
            <SaturationFigure percent={formatRate(31)} tone="ok" caption="VPS, disque · large" />
          </InWindow>
        </StateRow>
        <StateRow name="À surveiller" detail="De 50 à 80 %.">
          <InWindow>
            <SaturationFigure
              percent={formatRate(62)}
              tone="warning"
              caption="Redis, mémoire · à surveiller"
            />
          </InWindow>
        </StateRow>
        <StateRow name="Proche" detail="À partir de 80 %.">
          <InWindow>
            <SaturationFigure percent={formatRate(87)} tone="danger" caption="Redis, mémoire · proche" />
          </InWindow>
        </StateRow>
        <StateRow
          name="Incomplète"
          detail="Une ressource est sans nouvelles : jamais verte, neutre, et elle le dit."
        >
          <InWindow>
            <SaturationFigure
              percent={formatRate(31)}
              tone="neutral"
              caption="VPS, disque"
              note="Incomplète : Web, occupation sans nouvelles"
            />
          </InWindow>
        </StateRow>
      </Block>
      <Block
        title="Les ressources"
        note="Des lignes simples sous un intitulé de maillon : le nom, la valeur sur son plafond, une fine barre, le taux. Sur mobile, le taux passe sous le nom."
      >
        <StateRow name="Les trois teintes" detail="Un taux sous 50 %, de 50 à 80 %, à partir de 80 %.">
          <InWindow>
            <div className="lp-window-layout">
              <CapacityLinkRows title="Gateway">
                {ratioRow("Connexions en tout", 410, 1750)}
                {ratioRow("Connexions au plus gros canvas", 640, 1000)}
                {ratioRow("Connexions de la vue OBS", 910, 1000)}
              </CapacityLinkRows>
            </div>
          </InWindow>
        </StateRow>
        <StateRow
          name="Sans nouvelles, non mesurée"
          detail="Le texte tient la place de la valeur, de la barre et du taux."
        >
          <InWindow>
            <div className="lp-window-layout">
              <CapacityLinkRows title="Convex" detail="plan Free">
                <CapacityRow name="Appels de fonctions" state={{ kind: "withoutNews" }} />
                <CapacityRow name="Calcul des actions" state={{ kind: "unmeasured" }} />
              </CapacityLinkRows>
            </div>
          </InWindow>
        </StateRow>
        <StateRow
          name="Avec une légende, au-delà du plafond"
          detail="Une projection de 155 % : la barre est pleine, le taux le dit."
        >
          <InWindow>
            <div className="lp-window-layout">
              <CapacityLinkRows title="Convex" detail="valiant-panther-436, watchful-spider-409 · plan Free">
                {ratioRow(
                  "Appels de fonctions",
                  1_550_000,
                  1_000_000,
                  "projection fin octobre · plein le 15/10",
                )}
              </CapacityLinkRows>
            </div>
          </InWindow>
        </StateRow>
        <StateRow name="Sur mobile" detail="Le nom et la valeur en haut ; dessous, le taux et la barre.">
          <InPhone isWindow>
            <div className="lp-window-layout">
              <CapacityLinkRows title="Gateway">
                {ratioRow("Connexions en tout", 410, 1750)}
                {ratioRow("Connexions au plus gros canvas", 910, 1000)}
                <CapacityRow name="Occupation" state={{ kind: "withoutNews" }} />
              </CapacityLinkRows>
            </div>
          </InPhone>
        </StateRow>
      </Block>
    </Entry>
  );
};

export const ChoicesEntry = () => {
  const appearanceChoice = useAppearanceChoice();
  return (
    <Entry
      slug="choix"
      components={["ChoiceList", "AppearancePicker", "AppearanceButton", "SwatchChoice"]}
      file="ui/design/{choice-list,appearance-controls,palette}.tsx"
      note="Un choix exclusif. Le bouton d'apparence fait le cycle auto, clair, sombre."
    >
      <Block title="Choix exclusif">
        <StateRow name="Choix exclusif" detail="Aucune option présélectionnée.">
          <InSmallWindow>
            <WithValue<ProgressChoice | null> initial={null}>
              {(progress, setProgress) => (
                <ChoiceList
                  label={PROGRESS_LABEL}
                  options={progressOptions("archive")}
                  value={progress}
                  onSelect={setProgress}
                />
              )}
            </WithValue>
          </InSmallWindow>
        </StateRow>
        <StateRow name="Choix exclusif désactivé, une option choisie">
          <InSmallWindow>
            <ChoiceList
              label={PROGRESS_LABEL}
              options={progressOptions("archive")}
              value="keep"
              onSelect={noop}
              isDisabled
            />
          </InSmallWindow>
        </StateRow>
      </Block>
      <Block title="Apparence">
        <StateRow name="Apparence, comme dans Mon compte">
          <AppearancePicker choice={appearanceChoice} onPick={pickAppearance} />
        </StateRow>
        <StateRow name="Apparence, comme dans la pill Compte">
          <AppearanceButton choice={appearanceChoice} onPick={pickAppearance} />
        </StateRow>
      </Block>
      <Block title="Choix de couleur">
        <StateRow
          name="Choix de couleur, au clavier de la palette"
          detail="Aucune pastille choisie d'avance."
        >
          <InSmallWindow>
            <WithValue<PngBackground | null> initial={null}>
              {(background, setBackground) => (
                <SwatchChoice
                  label="Fond de l'image"
                  options={PNG_BACKGROUND_OPTIONS}
                  value={background}
                  onSelect={setBackground}
                />
              )}
            </WithValue>
          </InSmallWindow>
        </StateRow>
        <StateRow name="Choix de couleur au doigt" detail="Les pastilles rondes, une choisie.">
          <InSmallWindow>
            <SwatchChoice
              label="Fond de l'image"
              options={PNG_BACKGROUND_OPTIONS}
              value="white"
              onSelect={noop}
              isTouch
            />
          </InSmallWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};

const NO_POINT = "Aucun point sur cette période.";
const NO_CANVAS_POINT = "Aucune activité sur ce canvas sur cette période.";

export const TimeChartsEntry = () => {
  const nowMs = useNowMs();
  const daySlots = toActivitySlots(samplePoints("day", nowMs), "day", nowMs);
  const allSlots = toActivitySlots(samplePoints("all", nowMs), "all", nowMs);
  const dayLines = chartLinesFor("day");
  return (
    <Entry
      slug="courbes"
      components={["TimeCharts"]}
      file="ui/design/time-charts.tsx"
      note="Des courbes sur un même axe du temps. Survoler ou toucher un instant ; un trou là où le serveur était arrêté."
    >
      <Block title="États">
        <StateRow name="24 h" detail="Un point par minute, un trou de 40 min.">
          <InWindow>
            <TimeCharts lines={dayLines} slots={daySlots} emptyText={NO_POINT} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Tout, un point par jour"
          detail="Trois courbes de plus, les comptes, joueurs et streamers actifs."
        >
          <InWindow>
            <TimeCharts lines={chartLinesFor("all")} slots={allSlots} emptyText={NO_POINT} />
          </InWindow>
        </StateRow>
        <StateRow
          name="Un canvas, 24 h"
          detail="Un point seulement quand il s'y passe quelque chose, le reste vaut zéro."
        >
          <InWindow>
            <TimeCharts
              lines={canvasChartLinesFor("day")}
              slots={toCanvasSlots(sampleCanvasPoints("day", nowMs), "day", nowMs)}
              emptyText={NO_CANVAS_POINT}
            />
          </InWindow>
        </StateRow>
        <StateRow name="Un canvas, Tout" detail="Une courbe de plus, ses joueurs actifs de chaque jour.">
          <InWindow>
            <TimeCharts
              lines={canvasChartLinesFor("all")}
              slots={toCanvasSlots(sampleCanvasPoints("all", nowMs), "all", nowMs)}
              emptyText={NO_CANVAS_POINT}
            />
          </InWindow>
        </StateRow>
        <StateRow
          name="Un taux, 24 h"
          detail="La saturation et un maillon par courbe, chacune de 0 à 100 % ; Convex ne mesure qu'à partir d'un moment, un trou avant."
        >
          <InWindow>
            <TimeCharts
              lines={CAPACITY_LINES}
              slots={toCapacitySlots(sampleCapacityPoints("day", nowMs), "day", nowMs)}
              emptyText={NO_POINT}
            />
          </InWindow>
        </StateRow>
        <StateRow name="Un taux, Tout" detail="Un point par jour.">
          <InWindow>
            <TimeCharts
              lines={CAPACITY_LINES}
              slots={toCapacitySlots(sampleCapacityPoints("all", nowMs), "all", nowMs)}
              emptyText={NO_POINT}
            />
          </InWindow>
        </StateRow>
        <StateRow name="Une autre période se charge" detail="Les courbes d'avant, grisées.">
          <InWindow>
            <TimeCharts lines={dayLines} slots={daySlots} emptyText={NO_POINT} isLoading />
          </InWindow>
        </StateRow>
        <StateRow name="Aucun point sur la période">
          <InWindow>
            <TimeCharts lines={dayLines} slots={[null, null]} emptyText={NO_POINT} />
          </InWindow>
        </StateRow>
      </Block>
    </Entry>
  );
};
