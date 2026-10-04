// La bande de la publicité (CDC 2026, Publicité) : réservée, jamais recouverte ni effacée.
// À gauche au PC, en haut sur mobile ; sa taille est mesurée, et le canvas s'arrête à son bord. En DEV : placeholder de layout.

import { useRef } from "react";
import { AD_BAR_HEIGHT, AD_SIDE_FITS_QUERY, AD_SIDE_WIDTH, AD_TOP_QUERY } from "../design/ad-bar";
import { classNames } from "../design/class-names";
import { useMeasuredSize } from "../design/use-measured-size";
import { useMediaQuery } from "../design/use-media-query";
import { ADSENSE_SLOT_DESKTOP, ADSENSE_SLOT_MOBILE } from "./ad-loader";
import { ADSENSE_CLIENT } from "./adsense";
import { useAdFill } from "./use-ad-fill";

const IS_DEV = import.meta.env.DEV;

export type AdBandEdge = "side" | "top";

export type AdBandProps = {
  edge?: AdBandEdge; // absent : celle de l'écran. Forcée sur /design.
  isDocked?: boolean;
  isLive?: boolean; // false sur /design : boîte vide, sans script AdSense
};

const SLOTS: Record<AdBandEdge, string> = { side: ADSENSE_SLOT_DESKTOP, top: ADSENSE_SLOT_MOBILE };
const MEASURES: Record<AdBandEdge, { cssVar: string; dimension: "width" | "height" }> = {
  side: { cssVar: AD_SIDE_WIDTH, dimension: "width" },
  top: { cssVar: AD_BAR_HEIGHT, dimension: "height" },
};
const SLOT_SHAPES: Record<AdBandEdge, string> = { side: "lp-ad-slot--rail", top: "lp-ad-slot--banner" };

type AdBandSlotProps = { edge: AdBandEdge; isDocked: boolean; isLive: boolean };

// Un montage par slot : AdSense n'accepte qu'un push par `<ins>`.
const AdBandSlot = ({ edge, isDocked, isLive }: AdBandSlotProps) => {
  const band = useRef<HTMLDivElement>(null);
  const insRef = useRef<HTMLModElement>(null);
  const phase = useAdFill(insRef, isLive);
  const isPlaceholder = !isLive || (phase === "empty" && IS_DEV);
  const isShown = phase === "shown" || isPlaceholder;
  // La place n'est réservée que pour une annonce remplie : avant, la bande est transparente et ne pousse rien.
  useMeasuredSize(band, { ...MEASURES[edge], isActive: isDocked && isShown });

  if (phase === "empty" && !IS_DEV) return null;

  return (
    <div
      ref={band}
      className={classNames("lp-ad-band", !isDocked && "lp-ad-band--inline", !isShown && "is-hidden")}
      data-edge={edge}
      inert={!isShown}
    >
      {isPlaceholder ? (
        <div
          className={classNames("lp-ad-slot", "lp-ad-slot--placeholder", SLOT_SHAPES[edge])}
          aria-hidden="true"
        >
          <span className="lp-type-caption lp-muted">
            {isLive ? "Pub (slot vide en local)" : "Publicité"}
          </span>
        </div>
      ) : (
        <ins
          ref={insRef}
          className={classNames("adsbygoogle", "lp-ad-slot", SLOT_SHAPES[edge])}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={SLOTS[edge]}
        />
      )}
    </div>
  );
};

export const AdBand = ({ edge: forcedEdge, isDocked = true, isLive = true }: AdBandProps) => {
  const isNarrow = useMediaQuery(AD_TOP_QUERY);
  const isTallEnough = useMediaQuery(AD_SIDE_FITS_QUERY);
  // Un écran de PC trop bas pour l'encart n'a pas de bande : ni `<ins>`, ni script.
  const edge = forcedEdge ?? (isNarrow ? "top" : isTallEnough ? "side" : null);
  if (!edge) return null;
  return <AdBandSlot key={SLOTS[edge]} edge={edge} isDocked={isDocked} isLive={isLive} />;
};
