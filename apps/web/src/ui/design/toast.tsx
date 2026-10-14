// Le toast (CDC 2026, Toasts) : une pill courte, une icône et une phrase, 3 s, un seul à la fois,
// succès ou erreur. Une action en bouton texte (Écart §9.3, JOURNAL 2026-10-13) le garde 5 s. Il monte du bas en fondu et y redescend.
// Dans le jeu il est dans la couche supérieure du navigateur, au-dessus d'une fenêtre ouverte (Écart §8.1, JOURNAL 2026-10-13).
// `ToastProvider` le tient pour toute la page, `useToast` l'affiche. Il s'entend par les régions de `toast-announcement.tsx`,
// pas par lui-même : l'image n'est pas lue.

import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Button } from "./button";
import { classNames } from "./class-names";
import { Pill } from "./pill";
import {
  type ToastAction,
  ToastAnnouncement,
  ToastAnnouncementContext,
  type ToastMessage,
  type ToastTone,
} from "./toast-announcement";
import { useShownWhileClosing } from "./window";

export type { ToastAction, ToastMessage, ToastTone };

const TOAST_MS = 3000;
// Le temps d'appuyer : une action demande plus que de lire une phrase.
const TOAST_ACTION_MS = 5000;

export const toastDurationMs = (hasAction: boolean): number => (hasAction ? TOAST_ACTION_MS : TOAST_MS);

type ToastProps = { message: ToastMessage | null; isDocked?: boolean };

// Une fenêtre modale couvre tout hors de la couche supérieure du navigateur, quel que soit le `z-index` : le toast y monte
// (`popover` natif, comme la bulle d'aide) à chaque message. Une clé par message refait l'élément : le nouveau passe au-dessus d'une
// fenêtre ouverte depuis le précédent. Après son fondu la pill reste, invisible et inerte, dans la couche : le message suivant la remplace.
const raiseToTopLayer = (element: HTMLDivElement | null): void => {
  if (typeof element?.showPopover === "function") element.showPopover();
};

export const Toast = ({ message, isDocked = true }: ToastProps) => {
  const shown = useShownWhileClosing(message);
  if (!shown) return null;
  const Icon = shown.tone === "success" ? CircleCheck : CircleAlert;
  // Une clé par message : celui qui en remplace un autre refait son entrée.
  const pill = (
    <Pill key={shown.id} dock={isDocked ? "toast" : undefined} isVisible={message !== null}>
      <span
        className={classNames(
          "lp-toast",
          `lp-toast--${shown.tone}`,
          shown.action && "lp-toast--action",
          "lp-type-body",
        )}
      >
        <Icon aria-hidden="true" />
        {shown.text}
        {shown.action && <Button label={shown.action.label} onPress={shown.action.onPress} />}
      </span>
    </Pill>
  );
  return isDocked ? (
    <div key={shown.id} ref={raiseToTopLayer} popover="manual" className="lp-toast-layer">
      {pill}
    </div>
  ) : (
    pill
  );
};

export type ShowToast = (tone: ToastTone, text: string, action?: ToastAction) => void;

// Sans `ToastProvider` (un test, /design), un toast ne s'affiche nulle part : jamais une erreur.
const ToastContext = createContext<ShowToast>(() => undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = useRef(0);
  const show = useCallback<ShowToast>((tone, text, action) => {
    if (timer.current) clearTimeout(timer.current);
    count.current += 1;
    const dismiss = () => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(null);
    };
    // Presser l'action ferme le toast, puis la fait : elle peut en montrer un autre.
    const pressable = action && {
      label: action.label,
      onPress: () => {
        dismiss();
        action.onPress();
      },
    };
    setMessage({ id: count.current, tone, text, ...(pressable ? { action: pressable } : {}) });
    timer.current = setTimeout(() => setMessage(null), toastDurationMs(action !== undefined));
  }, []);
  return (
    <ToastContext.Provider value={show}>
      <ToastAnnouncementContext.Provider value={message}>
        {children}
        <ToastAnnouncement />
        <Toast message={message} />
      </ToastAnnouncementContext.Provider>
    </ToastContext.Provider>
  );
};

export const useToast = (): ShowToast => useContext(ToastContext);
