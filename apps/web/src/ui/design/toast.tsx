// Le toast (CDC 2026, Toasts) : une pill courte, une icône et une phrase, 3 s, un seul à la fois,
// succès ou erreur. Il monte du bas en fondu et y redescend. `ToastProvider` le tient pour toute la page,
// `useToast` l'affiche. Il s'entend par les régions de `toast-announcement.tsx`, pas par lui-même : l'image n'est pas lue.

import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Pill } from "./pill";
import {
  ToastAnnouncement,
  ToastAnnouncementContext,
  type ToastMessage,
  type ToastTone,
} from "./toast-announcement";
import { useShownWhileClosing } from "./window";

export type { ToastMessage, ToastTone };

const TOAST_MS = 3000;

type ToastProps = { message: ToastMessage | null; isDocked?: boolean };

export const Toast = ({ message, isDocked = true }: ToastProps) => {
  const shown = useShownWhileClosing(message);
  if (!shown) return null;
  const Icon = shown.tone === "success" ? CircleCheck : CircleAlert;
  // Une clé par message : celui qui en remplace un autre refait son entrée.
  return (
    <Pill key={shown.id} dock={isDocked ? "toast" : undefined} isVisible={message !== null}>
      <span className={`lp-toast lp-toast--${shown.tone} lp-type-body`}>
        <Icon aria-hidden="true" />
        {shown.text}
      </span>
    </Pill>
  );
};

type ShowToast = (tone: ToastTone, text: string) => void;

// Sans `ToastProvider` (un test, /design), un toast ne s'affiche nulle part : jamais une erreur.
const ToastContext = createContext<ShowToast>(() => undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = useRef(0);
  const show = useCallback<ShowToast>((tone, text) => {
    if (timer.current) clearTimeout(timer.current);
    count.current += 1;
    setMessage({ id: count.current, tone, text });
    timer.current = setTimeout(() => setMessage(null), TOAST_MS);
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
