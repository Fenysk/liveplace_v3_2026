import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../locale/use-locale";
import { DeleteAccountWindow, type DeleteAccountWindowProps } from "./delete-account-window";

const doNothing = (): void => undefined;

const windowProps = (props: Partial<DeleteAccountWindowProps> = {}): DeleteAccountWindowProps => ({
  isOpen: true,
  status: "idle",
  failure: null,
  onConfirm: doNothing,
  onClose: doNothing,
  ...props,
});

const render = (props: Partial<DeleteAccountWindowProps> = {}, locale: "fr" | "en" = "fr"): string =>
  renderToStaticMarkup(
    createElement(
      LocaleProvider,
      { initial: locale },
      createElement(DeleteAccountWindow, windowProps(props)),
    ),
  );

// La typographie française : l'espace avant « : » est insécable, celle avant « ? » insécable et fine.
const NBSP = " ";
const NARROW_NBSP = " ";

describe("the confirmation window of the account deletion (CDC §8, mockup of 2026-11-01)", () => {
  // Le texte validé, mot pour mot
  it("says the validated text word for word", () => {
    const markup = render();

    expect(markup).toContain(`>Supprimer ton compte${NARROW_NBSP}?</h2>`);
    expect(markup).toContain("C&#x27;est immédiat, et sans retour.");
    expect(markup).toContain(`Ce qui part${NBSP}:`);
    expect(markup).toContain("<li>ta fresque, tes archives et ta vue OBS</li>");
    expect(markup).toContain("<li>tes badges et ton classement</li>");
    expect(markup).toContain("<li>tes rôles de modérateur</li>");
    expect(markup).toContain(`Ce qui reste${NBSP}:</span> tes pixels sur les autres fresques, sans ton nom.`);
    expect(markup).toContain(`LivePlace ne peut pas effacer${NBSP}:</span> l&#x27;accès donné dans`);
    expect(markup).toContain(">tes connexions Twitch</a>.");
  });

  // Les trois éléments de ce qui part, dans l'ordre de la maquette
  it("lists what goes in the order of the mockup", () => {
    const markup = render();

    expect(markup.indexOf("ta fresque")).toBeLessThan(markup.indexOf("tes badges"));
    expect(markup.indexOf("tes badges")).toBeLessThan(markup.indexOf("tes rôles de modérateur"));
  });

  // La fresque, les archives et la vue OBS partent pour tout compte, où que la fenêtre s'ouvre : chacun a une fresque dès sa première connexion
  it("always names the canvas, the archives and the OBS view, whatever the page the window opens on", () => {
    for (const markup of [
      render(),
      render({ status: "running" }),
      render({ status: "failed", failure: "failed" }),
    ]) {
      expect(markup).toContain("<li>ta fresque, tes archives et ta vue OBS</li>");
      expect(markup).toContain("archives et ta vue OBS");
      expect(markup).toContain("tes badges et ton classement");
      expect(markup).toContain("tes rôles de modérateur");
    }
  });

  // Elle ne parle ni des dons, ni des VOD, ni des clips : décision d'Alexis
  it("speaks neither of donations, nor of VODs, nor of clips", () => {
    for (const markup of [render(), render({}, "en")])
      expect(markup).not.toMatch(/dons?\b|donation|VOD|clips?|Ko-fi/i);
  });

  // Le lien vers les connexions Twitch s'ouvre dans un nouvel onglet, sans rien confier à la page ouverte
  it("links to the Twitch connections in a new tab, without opener", () => {
    const markup = render();

    expect(markup).toContain(
      '<a class="lp-window-link" href="https://www.twitch.tv/settings/connections" target="_blank" rel="noopener noreferrer">',
    );
  });

  // Le pied : Annuler avec Échap, puis le bouton rouge et plein, sans icône
  it("ends with Cancel and its Escape key, then the red button, with no icon", () => {
    const markup = render();
    const footer = /<footer[^>]*>(.*?)<\/footer>/s.exec(markup)?.[1] ?? "";

    expect(footer).toMatch(/<span>Annuler<\/span><span class="lp-kbd lp-type-kbd"[^>]*>Échap<\/span>/);
    expect(footer).toMatch(/<button[^>]*lp-btn--danger[^>]*>/);
    expect(footer).toContain("Supprimer mon compte");
    expect(footer.indexOf("Annuler")).toBeLessThan(footer.indexOf("Supprimer mon compte"));
    expect(footer.match(/<svg/g) ?? []).toHaveLength(0);
  });

  // Fermée, elle ne laisse ni titre, ni texte, ni bouton dans la page
  it("leaves nothing in the page when closed", () => {
    const markup = render({ isOpen: false });

    expect(markup).not.toContain("Supprimer ton compte");
    expect(markup).not.toContain("<button");
  });

  // Pendant l'effacement, le bouton attend, désactivé, et la fenêtre est verrouillée
  it("shows a waiting button, disabled, and a locked window while it deletes", () => {
    const idle = render();
    const running = render({ status: "running" });

    expect(idle).not.toContain("is-locked");
    expect(running).toContain("is-locked");
    expect(running).toMatch(/<button[^>]*lp-btn--danger[^>]*disabled=""[^>]*>.*Suppression…/s);
    expect(running).not.toContain("Supprimer mon compte</span>");
  });

  // Un échec avant l'inscription se dit dans la fenêtre, en alerte ; sans échec, l'alerte est là mais vide
  it("says a failure in an alert, which is there but empty without one", () => {
    const quiet = render();
    const failed = render({ status: "failed", failure: "failed" });
    const signedOut = render({ status: "failed", failure: "unauthenticated" });
    const network = render({ status: "failed", failure: "network" });

    expect(quiet).toMatch(/<p role="alert" class="[^"]*lp-visually-hidden[^"]*"><\/p>/);
    expect(failed).toMatch(
      /<p role="alert" class="lp-type-caption lp-danger lp-window-text">La suppression n&#x27;a pas abouti\./,
    );
    expect(network).toContain("La suppression n&#x27;a pas abouti.");
    expect(signedOut).toContain("Tu n&#x27;es plus connecté.");
    expect(signedOut).not.toContain("La suppression n&#x27;a pas abouti.");
  });

  // En anglais, chaque phrase a la sienne, avec « you »
  it("says every sentence in English, in the same tone", () => {
    const markup = render({}, "en");

    expect(markup).toContain("Delete your account?");
    expect(markup).toContain("It&#x27;s immediate, and there&#x27;s no undo.");
    expect(markup).toContain("What goes away:");
    expect(markup).toContain("<li>your canvas, your archives and your OBS view</li>");
    expect(markup).toContain("<li>your badges and your ranking</li>");
    expect(markup).toContain("<li>your moderator roles</li>");
    expect(markup).toContain("What stays:</span> your pixels on other canvases, without your name.");
    expect(markup).toContain("LivePlace can&#x27;t erase:</span> the access you gave in");
    expect(markup).toContain(">your Twitch connections</a>.");
    expect(markup).toContain("<span>Cancel</span>");
    expect(markup).toContain("Esc");
    expect(markup).toContain("Delete my account");
    expect(markup).not.toMatch(/ta fresque|Supprimer|tes /);
  });

  // L'anglais garde la ligne de la fresque aussi, et celui de l'attente dit « Deleting… »
  it("keeps the canvas line in English too, and says Deleting… while it runs", () => {
    expect(render({}, "en")).toContain("<li>your canvas, your archives and your OBS view</li>");
    expect(render({ status: "running" }, "en")).toContain("Deleting…");
  });
});
