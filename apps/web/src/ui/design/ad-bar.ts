// Ce que la publicité réserve sur la page. Mesurés par ce qui les porte (ad-band.tsx, pill.tsx), lus par canvas.css et pill.css.
export const AD_BAR_HEIGHT = "--lp-ad-bar"; // la bande, en haut sur mobile
export const AD_SIDE_WIDTH = "--lp-ad-side"; // la bande, à gauche au PC
export const CONSENT_BAR_HEIGHT = "--lp-consent-bar"; // la pill de consentement, en haut sur mobile

// Le seuil de pill.css : la bande est en haut en dessous, à gauche au-dessus si l'écran est assez haut pour l'encart de 600 px.
export const AD_TOP_QUERY = "(max-width: 640px)";
export const AD_SIDE_FITS_QUERY = "(min-width: 641px) and (min-height: 640px)";
