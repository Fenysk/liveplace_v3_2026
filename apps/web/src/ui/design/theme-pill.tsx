// La pill Thème (§9.7), en haut au centre : le thème du canvas, montré à tous dès qu'il est
// rempli. Un petit texte discret au-dessus, le thème dessous, gros. Sur mobile, c'est une bande sous les pills du haut, sur
// leur largeur : « Thème » devant le thème, qui tient sur deux lignes ; en Dessin, elle monte à leur place (§9.7,
// pill.css, theme-pill.css). Jamais cliquable, hors le lien de la pastille de l'événement.
// Pendant l'attente puis l'événement (CDC 2026, Mode événement), le titre de l'événement s'y ajoute : une pastille blanche entourée d'un
// cadre arc-en-ciel de 3 px, au-dessus du thème, dans le même bloc ; une 2e ligne est dedans, sous le titre (compte à rebours, « En cours »,
// temps qui reste avant la fin). Avec une adresse de page de dons, le titre et cette ligne sont un lien vers elle, dans un nouvel onglet.
// Sans thème, la pastille est la pill elle-même ; sans les deux, pas de pill. Un don de l'événement ouvre une ligne de plus : sous le
// thème, le bloc grandit puis reprend sa taille quand le don se ferme ; sans thème, elle s'ouvre dans la pastille, sous le titre, sur
// son fond blanc, et le cadre continue son cycle.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTexts } from "../locale/use-locale";
import { classNames } from "./class-names";
import { DESIGN_TEXTS } from "./design-texts";
import { type DonationControls, DonationLine } from "./donation-toast";
import { Pill, type PillDock } from "./pill";
import { useShownWhileClosing } from "./window";

const DOCK: PillDock = "tc";

type ThemePillProps = {
  theme: string | undefined; // absent : pas de thème dans la pill
  eventTitle?: string | undefined; // absent : pas de pastille ; sans thème non plus, pas de pill, ou elle part en fondu avec ses derniers textes
  eventLine?: string | undefined; // « Commence dans 2 j 5 h », « En cours » : sous le titre
  eventHref?: string | undefined; // la page de dons : absent, le titre n'est pas un lien
  donation?: DonationControls | undefined; // absent : pas de ligne de don ; elle n'existe de toute façon qu'avec un titre
  isDocked?: boolean;
};

// Une part qui s'en va pendant que l'autre reste disparaît tout de suite ; quand la pill part, elles partent en fondu avec elle.
const partOf = (current: string | undefined, last: string | null, isVisible: boolean): string | null => {
  if (!isVisible) return last;
  return current ? last : null;
};

// Une part qui n'existe que sous le titre de l'événement (sa 2e ligne, son lien).
const partUnder = (
  title: string | null,
  current: string | undefined,
  last: string | null,
  isVisible: boolean,
): string | null => (title === null ? null : partOf(current, last, isVisible));

// Le cadre arc-en-ciel : deux couches imbriquées. La 1re tourne sans fin, la 2e fait 3 tours de plus quand on survole ou touche la
// pastille (la classe `is-boosting`, retirée à la fin du tour), sans saut : 1080° = 0°.
const EventFrame = ({ isBoosting, onBoostEnd }: { isBoosting: boolean; onBoostEnd: () => void }) => (
  <span className="lp-event-frame" aria-hidden="true">
    <span
      className={classNames("lp-event-frame-boost", isBoosting && "is-boosting")}
      onAnimationEnd={onBoostEnd}
    />
  </span>
);

// Le titre et la ligne dessous ; avec une adresse, ils sont un seul lien (hors du bouton +N de la ligne de don, qui reste à part).
const EventHead = ({ title, line, href }: { title: string; line: string | null; href: string | null }) => {
  const t = useTexts(DESIGN_TEXTS);
  const head = (
    <>
      <p className="lp-event-heading lp-type-heading">
        <span className="lp-event-title-text">{title}</span>
      </p>
      {line !== null && <p className="lp-event-line lp-type-numeric lp-muted">{line}</p>}
    </>
  );
  if (href === null) return head;
  return (
    <a
      className="lp-event-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.eventDonate(title)}
    >
      {head}
    </a>
  );
};

// Le contenu blanc de la pastille : le titre, sa ligne dessous, et la ligne d'un don quand la pastille est seule
const EventBody = ({
  title,
  line,
  href,
  children,
}: {
  title: string;
  line: string | null;
  href: string | null;
  children?: ReactNode;
}) => {
  const [isBoosting, setIsBoosting] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  // Écouteurs natifs : une `div` passive n'a pas de gestionnaire de souris en JSX (a11y) ; le lien est dedans, le toucher l'accélère aussi.
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const boost = () => setIsBoosting(true);
    element.addEventListener("mouseenter", boost);
    element.addEventListener("pointerdown", boost);
    return () => {
      element.removeEventListener("mouseenter", boost);
      element.removeEventListener("pointerdown", boost);
    };
  }, []);
  return (
    <>
      <EventFrame isBoosting={isBoosting} onBoostEnd={() => setIsBoosting(false)} />
      <div ref={body} className="lp-event-body">
        <EventHead title={title} line={line} href={href} />
        {children}
      </div>
    </>
  );
};

const ThemeLines = ({ theme }: { theme: string }) => {
  const t = useTexts(DESIGN_TEXTS);
  return (
    <p className="lp-theme">
      {/* Au PC, il s'efface (display: contents) ; sur mobile, c'est le seul bloc du `line-clamp`, où le petit texte et le thème coulent à la suite. */}
      <span className="lp-theme-line">
        <span className="lp-theme-caption lp-type-caption lp-muted">
          {/* Les deux phrases sont dans la page : le CSS garde celle de l'écran, sans attendre React sur un téléphone. */}
          <span className="lp-theme-wide">{t.themeDraw}</span>
          <span className="lp-theme-narrow">{t.theme}</span>
        </span>
        <span className="lp-theme-text lp-type-heading">{theme}</span>
      </span>
    </p>
  );
};

// Ce que la pill montre : le titre de l'événement seul (la pill est alors son cadre arc-en-ciel, la ligne de don dans son corps blanc),
// ou au-dessus du thème, la ligne de don restant sous le thème.
const PillParts = ({
  title,
  line,
  href,
  theme,
  children,
}: {
  title: string | null;
  line: string | null;
  href: string | null;
  theme: string | null;
  children: ReactNode;
}) => {
  if (theme === null)
    return title === null ? null : (
      <EventBody title={title} line={line} href={href}>
        {children}
      </EventBody>
    );
  return (
    <>
      {title !== null && (
        <div className="lp-event-title">
          <EventBody title={title} line={line} href={href} />
        </div>
      )}
      <ThemeLines theme={theme} />
      {children}
    </>
  );
};

export const ThemePill = ({
  theme,
  eventTitle,
  eventLine,
  eventHref,
  donation,
  isDocked = true,
}: ThemePillProps) => {
  const lastTheme = useShownWhileClosing(theme || null);
  const lastTitle = useShownWhileClosing(eventTitle || null);
  const lastLine = useShownWhileClosing(eventLine || null);
  const lastHref = useShownWhileClosing(eventHref || null);
  const isVisible = Boolean(theme || eventTitle);
  if (lastTheme === null && lastTitle === null) return null;
  const shownTheme = partOf(theme, lastTheme, isVisible);
  const shownTitle = partOf(eventTitle, lastTitle, isVisible);
  const shownLine = partUnder(shownTitle, eventLine, lastLine, isVisible);
  const shownHref = partUnder(shownTitle, eventHref, lastHref, isVisible);
  const donationLine = eventTitle && donation ? <DonationLine {...donation} /> : null;
  return (
    <Pill
      dock={isDocked ? DOCK : undefined}
      layout="title"
      tone={shownTheme === null ? "claim" : undefined}
      isVisible={isVisible}
    >
      <PillParts title={shownTitle} line={shownLine} href={shownHref} theme={shownTheme}>
        {donationLine}
      </PillParts>
    </Pill>
  );
};
