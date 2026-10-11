// Copier une valeur (maquette, `.lp-copy`) : tout le champ est le bouton, et « Copier » devient « Copié » un instant.

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTexts } from "../locale/use-locale";
import { blurAfterClick } from "./button";
import { classNames } from "./class-names";
import { DESIGN_TEXTS } from "./design-texts";

const COPIED_MS = 1500;

type CopyButtonProps = {
  value: string; // ce qu'on lit
  copyText?: string; // ce qui part dans le presse-papiers : `value` par défaut
  onCopy?: (() => void) | undefined; // le navigateur a bien pris la valeur (Écart §8.1, JOURNAL 2026-10-09)
};

export const CopyButton = ({ value, copyText = value, onCopy }: CopyButtonProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);
  const copy = (): void => {
    navigator.clipboard.writeText(copyText).then(
      () => {
        setIsCopied(true);
        onCopy?.();
      },
      (error: unknown) => console.warn("copy-button : le navigateur refuse le presse-papiers", error),
    );
  };
  return (
    <button
      type="button"
      className="lp-btn lp-copy lp-type-body"
      aria-label={t.copy(value)}
      onClick={blurAfterClick(copy)}
    >
      <span className="lp-copy-value">{value}</span>
      <span className={classNames("lp-copy-action", isCopied && "is-copied")} aria-live="polite">
        <span className="lp-copy-icon">
          <Copy aria-hidden="true" />
          <Check aria-hidden="true" />
        </span>
        {isCopied ? t.copied : t.copyAction}
      </span>
    </button>
  );
};
