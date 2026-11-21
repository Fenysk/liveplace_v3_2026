// La ligne d'un don (mode événement) : une ligne de plus dans le bloc du titre et du thème (theme-pill.tsx), sous le thème, qui
// s'ouvre au don et se referme avec lui. Cœur, pseudo du donateur, texte de remerciement qui défile, puis le +N doré à réclamer,
// qui ferme la ligne. Le texte défile en boucle, sans fondu sur les bords ; en mouvement réduit il reste fixe et passe à la ligne.
// Un lecteur d'écran l'entend par sa région, toujours présente (comme toast-announcement.tsx) : le défilement n'est pas lu.

import { Heart } from "lucide-react";
import { type CSSProperties, useEffect, useEffectEvent, useRef, useState } from "react";
import { INTL_TAGS } from "../locale/locale";
import { useLocale, useTexts } from "../locale/use-locale";
import { blurAfterClick } from "./button";
import { DONATION_TEXTS } from "./donation-toast-texts";
import {
  cycleMsOf,
  donationDurationMs,
  formatAmount,
  formatPixels,
  pixelsOf,
  SCROLL_DELAY_MS,
} from "./donation-toast-timing";
import { useMediaQuery } from "./use-media-query";

// `id` : deux dons identiques font deux toasts. `donor` : un texte libre tapé par le donateur, affiché tel quel, jamais en HTML.
// `currency` (EUR par défaut) et `pixels` (1 pixel par 10 centimes par défaut) : ceux du don reçu.
export type Donation = {
  id: number;
  donor: string;
  amountCents: number;
  currency?: string | undefined;
  pixels?: number | undefined;
};

// Absent, `onClaim` retire le bouton (un compte sans bonus à réclamer). `claimPixels` : le bonus en attente, écrit dans le bouton.
// Absent, `onDismiss` laisse la ligne ouverte (une instance fixe sur /design). Présent, il est appelé au bout du temps, et à la réclamation.
export type DonationControls = {
  donation: Donation | null;
  onClaim?: (() => void) | undefined;
  claimPixels?: number | undefined;
  onDismiss?: (() => void) | undefined;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// La largeur d'une copie du texte, mesurée : elle fixe la durée d'un tour, donc celle du toast.
const useCycleMs = () => {
  const copy = useRef<HTMLSpanElement>(null);
  const [cycleMs, setCycleMs] = useState<number | null>(null);
  useEffect(() => {
    const element = copy.current;
    if (!element) return;
    const measure = () => setCycleMs(cycleMsOf(element.offsetWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { copy, cycleMs };
};

type RowProps = Omit<DonationControls, "donation"> & { donation: Donation };

const DonationRow = ({ donation, onClaim, claimPixels, onDismiss }: RowProps) => {
  const locale = useLocale();
  const t = useTexts(DONATION_TEXTS);
  const isReduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const { copy, cycleMs } = useCycleMs();
  const dismiss = useEffectEvent(() => onDismiss?.());
  const canDismiss = onDismiss !== undefined;
  const durationMs = donationDurationMs(isReduced ? null : cycleMs);
  useEffect(() => {
    if (!canDismiss) return;
    const timer = setTimeout(dismiss, durationMs);
    return () => clearTimeout(timer);
  }, [canDismiss, durationMs]);

  const amount = formatAmount(donation.amountCents, locale, donation.currency);
  const pixels = formatPixels(donation.pixels ?? pixelsOf(donation.amountCents), locale);
  const claimed = formatPixels(claimPixels ?? pixelsOf(donation.amountCents), locale);
  const claimLabel = t.claim(claimed);
  const text = (
    <>
      {t.thanks.before}
      <strong>{amount}</strong>
      {t.thanks.after(pixels)}
    </>
  );
  // Le défilement ne démarre qu'une fois la durée d'un tour mesurée.
  const track =
    cycleMs === null
      ? undefined
      : ({
          "--lp-donation-cycle": `${cycleMs}ms`,
          "--lp-donation-delay": `${SCROLL_DELAY_MS}ms`,
        } as CSSProperties);
  return (
    <div className="lp-donation lp-type-body" lang={INTL_TAGS[locale]}>
      <Heart aria-hidden="true" />
      <strong className="lp-donation-donor" aria-hidden="true">
        {donation.donor}
      </strong>
      <span className="lp-donation-marquee" aria-hidden="true">
        <span className="lp-donation-track" style={track}>
          <span ref={copy} className="lp-donation-copy">
            {text}
          </span>
          <span className="lp-donation-copy lp-donation-copy--twin" aria-hidden="true">
            {text}
          </span>
        </span>
      </span>
      {onClaim && (
        <button
          type="button"
          className="lp-btn lp-claim lp-type-body"
          aria-label={claimLabel}
          title={claimLabel}
          onClick={blurAfterClick(() => {
            onClaim();
            onDismiss?.();
          })}
        >
          <span className="lp-type-numeric">{`+${claimed}`}</span>
        </button>
      )}
    </div>
  );
};

export const DonationLine = ({ donation, onClaim, claimPixels, onDismiss }: DonationControls) => {
  const locale = useLocale();
  const t = useTexts(DONATION_TEXTS);
  // La région est là avant la ligne : un texte ajouté dans une région déjà présente est lu, une région née avec lui non.
  const pixels = donation && formatPixels(donation.pixels ?? pixelsOf(donation.amountCents), locale);
  return (
    <>
      <div role="status" className="lp-visually-hidden">
        {donation && pixels && (
          <span key={donation.id}>
            {`${donation.donor}. ${t.thanks.before}${formatAmount(donation.amountCents, locale, donation.currency)}${t.thanks.after(pixels)}`}
          </span>
        )}
      </div>
      {donation && (
        <>
          {/* Un don qui en remplace un autre garde la ligne ouverte : seule la ligne, clée par le don, repart de zéro. */}
          <span className="lp-donation-rule" aria-hidden="true" />
          <DonationRow
            key={donation.id}
            donation={donation}
            onClaim={onClaim}
            claimPixels={claimPixels}
            onDismiss={onDismiss}
          />
        </>
      )}
    </>
  );
};
