import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toast, ToastProvider } from "./toast";
import { ToastAnnouncement, ToastAnnouncementContext, type ToastMessage } from "./toast-announcement";

const success: ToastMessage = { id: 1, tone: "success", text: "Pose rétablie : elle revient sur le stream" };
const failure: ToastMessage = { id: 2, tone: "error", text: "Le rôle n'a pas changé : réessaie." };

// Le contenu de la région de ce rôle, `undefined` si la page n'en a pas.
const regionOf = (markup: string, role: "status" | "alert"): string | undefined =>
  markup.match(new RegExp(`<div role="${role}"[^>]*>(.*?)</div>`))?.[1];

const withToast = (message: ToastMessage | null, child: ReactNode) =>
  renderToStaticMarkup(createElement(ToastAnnouncementContext.Provider, { value: message }, child));

describe("what a screen reader hears of a toast", () => {
  // La page a ses deux régions avant tout toast : un texte ajouté dans une région déjà là est lu, une région née avec son texte non
  it("has both regions in the page before any toast, empty", () => {
    const markup = renderToStaticMarkup(createElement(ToastProvider, null, "page"));

    expect(regionOf(markup, "status")).toBe("");
    expect(regionOf(markup, "alert")).toBe("");
  });

  // Un succès se dit poliment, dans la région d'état seule
  it("says a success politely, in the status region alone", () => {
    const markup = withToast(success, createElement(ToastAnnouncement));

    expect(regionOf(markup, "status")).toBe(`<span>${success.text}</span>`);
    expect(regionOf(markup, "alert")).toBe("");
  });

  // Une erreur se dit tout de suite, dans l'alerte seule
  it("says an error at once, in the alert region alone", () => {
    const markup = withToast(failure, createElement(ToastAnnouncement));

    expect(regionOf(markup, "alert")).toBe("<span>Le rôle n&#x27;a pas changé : réessaie.</span>");
    expect(regionOf(markup, "status")).toBe("");
  });

  // L'image du toast n'est pas une région : le texte ne se dit pas deux fois
  it("has no live role on the picture, so the sentence is not said twice", () => {
    const markup = renderToStaticMarkup(createElement(Toast, { message: success }));

    expect(markup).toContain(success.text);
    expect(markup).not.toContain("role=");
  });
});
