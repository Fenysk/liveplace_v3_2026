// Copier une valeur (maquette, `.lp-copy`) : tout le champ est le bouton, et « Copier » devient « Copié » un instant.

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { blurAfterClick } from "./button";

const COPIED_MS = 1500;

type CopyButtonProps = {
  value: string; // ce qu'on lit
  copyText?: string; // ce qui part dans le presse-papiers : `value` par défaut
};

export const CopyButton = ({ value, copyText = value }: CopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);
  const copy = (): void => {
    navigator.clipboard.writeText(copyText).then(
      () => setIsCopied(true),
      (error: unknown) => console.warn("copy-button : le navigateur refuse le presse-papiers", error),
    );
  };
  return (
    <button
      type="button"
      className="lp-btn lp-copy lp-type-body"
      aria-label={`Copier ${value}`}
      onClick={blurAfterClick(copy)}
    >
      <span className="lp-copy-value">{value}</span>
      <span className="lp-copy-action" aria-live="polite">
        {isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {isCopied ? "Copié" : "Copier"}
      </span>
    </button>
  );
};
