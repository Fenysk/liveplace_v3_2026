// Le badge à côté du pseudo (CDC des badges §1, JOURNAL 2026-11-03) : une icône Lucide, sans fond. Une variante de la famille
// `.lp-badge` : elle accompagne un nom, mais montre un statut du compte plutôt que l'origine d'un rôle.
// Un bouton (focus au clavier, toucher sur mobile) sauf dans le Classement du PC, où la ligne est déjà un bouton : là, un repère.
// L'infobulle dit le même texte que l'`aria-label` ; elle se montre au survol d'une souris, au focus clavier, au toucher.

import { type BadgeEntry, type BadgeId, getBadge, toKnownBadges } from "@liveplace/domain/badges";
import { Heart, Shield } from "lucide-react";
import { type PointerEvent, type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "../locale/use-locale";
import { classNames } from "./class-names";
import { badgeLabel } from "./user-badge-label";
import { placeTip } from "./user-badge-position";

const TIP_GAP = 4; // --space-1
const TIP_LEFT = "--lp-tip-left";
const TIP_TOP = "--lp-tip-top";

// Montrée, l'infobulle monte dans la couche supérieure (aucune pill ni fenêtre ne la coupe) et se pose contre son badge ; un
// toucher ailleurs, Échap, un défilement ou un redimensionnement la ferment.
const useBadgeTip = (tip: RefObject<HTMLSpanElement | null>, isShown: boolean, close: () => void) => {
  useLayoutEffect(() => {
    const element = tip.current;
    const anchor = element?.parentElement;
    if (!element || !anchor || typeof element.showPopover !== "function") return;
    if (!isShown) {
      if (element.matches(":popover-open")) element.hidePopover();
      return;
    }
    element.showPopover();
    const { left, top, width, height } = anchor.getBoundingClientRect();
    const place = placeTip(
      { left, top, width, height },
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth },
      TIP_GAP,
    );
    element.style.setProperty(TIP_LEFT, `${place.left}px`);
    element.style.setProperty(TIP_TOP, `${place.top}px`);
    const closeOutside = (event: Event) => {
      if (!(event.target instanceof Node) || !anchor.contains(event.target)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [tip, isShown, close]);
};

// L'icône d'une famille, décorative : le nom du badge est celui de son bouton ou de son repère, ou du texte à côté.
export const BadgeGlyph = ({ family }: { family: BadgeEntry["family"] }) =>
  family === "moderator" ? <Shield aria-hidden="true" /> : <Heart fill="currentColor" aria-hidden="true" />;

type UserBadgeProps = {
  id: BadgeId;
  isMarker?: boolean; // un repère (`role="img"`) : le badge d'une ligne qui est déjà un bouton, sans bouton imbriqué
};

export const UserBadge = ({ id, isMarker = false }: UserBadgeProps) => {
  const locale = useLocale();
  const label = badgeLabel(id, locale);
  const { family } = getBadge(id);
  const tip = useRef<HTMLSpanElement>(null);
  const lastPointer = useRef("");
  const [isShown, setIsShown] = useState(false);
  const close = useCallback(() => setIsShown(false), []);
  useBadgeTip(tip, isShown, close);
  const className = classNames("lp-user-badge", `lp-user-badge--${family}`);
  // Une souris montre l'infobulle au survol ; un doigt, par un toucher (`onClick`, plus bas).
  const hover = {
    onPointerEnter: (event: PointerEvent) => event.pointerType === "mouse" && setIsShown(true),
    onPointerLeave: (event: PointerEvent) => event.pointerType === "mouse" && setIsShown(false),
  };
  const content = (
    <>
      <BadgeGlyph family={family} />
      <span ref={tip} popover="manual" className="lp-user-badge-tip lp-type-caption" aria-hidden="true">
        {label}
      </span>
    </>
  );
  if (isMarker)
    return (
      <span className={className} role="img" aria-label={label} {...hover}>
        {content}
      </span>
    );
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={(event) => {
        lastPointer.current = event.pointerType;
      }}
      onClick={() => {
        if (lastPointer.current !== "mouse") setIsShown((shown) => !shown);
      }}
      onFocus={(event) => event.currentTarget.matches(":focus-visible") && setIsShown(true)}
      onBlur={close}
      {...hover}
    >
      {content}
    </button>
  );
};

type UserBadgesProps = { ids: readonly string[] | undefined; isMarker?: boolean };

// La rangée, dans l'ordre fixe du catalogue (Modérateur, puis Soutien) ; un id inconnu est ignoré, aucun badge : rien.
export const UserBadges = ({ ids, isMarker = false }: UserBadgesProps) => {
  const known = toKnownBadges(ids);
  if (known.length === 0) return null;
  return (
    <span className="lp-user-badges">
      {known.map((id) => (
        <UserBadge key={id} id={id} isMarker={isMarker} />
      ))}
    </span>
  );
};
