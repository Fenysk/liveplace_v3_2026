// Ce qu'un lecteur d'écran entend d'un toast (CDC 2026, Toasts) : deux régions toujours présentes, vides jusqu'au toast,
// car un texte ajouté dans une région déjà là est lu, une région née avec son texte non. Un succès se dit poliment, une
// erreur tout de suite. Une fenêtre modale rend la page inerte, région comprise : chaque fenêtre redit donc le toast
// dans la sienne (window.tsx), et une seule des deux est exposée à la fois.

import { createContext, useContext } from "react";

export type ToastTone = "success" | "error";

// `id` : deux fois la même phrase font deux toasts.
export type ToastMessage = { id: number; tone: ToastTone; text: string };

export const ToastAnnouncementContext = createContext<ToastMessage | null>(null);

type RegionProps = { role: "status" | "alert"; message: ToastMessage | null };

// Une clé par toast : la même phrase deux fois change de nœud, donc se redit.
const Region = ({ role, message }: RegionProps) => (
  <div role={role} className="lp-visually-hidden">
    {message && <span key={message.id}>{message.text}</span>}
  </div>
);

export const ToastAnnouncement = () => {
  const message = useContext(ToastAnnouncementContext);
  return (
    <>
      <Region role="status" message={message?.tone === "success" ? message : null} />
      <Region role="alert" message={message?.tone === "error" ? message : null} />
    </>
  );
};
