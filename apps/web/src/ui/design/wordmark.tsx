// Le mot-symbole : « LivePlace » en lettres, Nunito 900, jamais de logo, de pictogramme ni de forme à côté (JOURNAL 2026-10-22).
// Écart §9.1 (JOURNAL 2026-10-31) : un seul pour l'accueil (texte) et `/confidentialite` (lien vers l'accueil).

type WordmarkProps = { href?: string };

export const Wordmark = ({ href }: WordmarkProps) =>
  href === undefined ? (
    <p className="lp-type-display lp-wordmark">LivePlace</p>
  ) : (
    <a className="lp-type-display lp-wordmark" href={href}>
      LivePlace
    </a>
  );
