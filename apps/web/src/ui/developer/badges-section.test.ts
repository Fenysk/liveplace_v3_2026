import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatDonationDay, linkFailureText } from "./badges-labels";
import { BadgesSection, type BadgesView } from "./badges-section";

const never = async (): Promise<null> => null;

const render = (view: BadgesView): string =>
  renderToStaticMarkup(createElement(BadgesSection, { view, onLink: never }));

const donation = {
  donationId: "d1",
  donatedAt: Date.UTC(2026, 10, 2, 12),
  kofiName: "Camille R.",
  email: "camille@example.com",
};

describe("la section Badges de la fenêtre Développeur (CDC des badges §4, JOURNAL 2026-11-03)", () => {
  // Une ligne « Titulaires du badge Soutien » avec le cœur du badge à côté du libellé, puis le nombre
  it("starts with the holders of the Support badge: the label, the heart of the badge, then the number", () => {
    const markup = render({ status: "ready", report: { holders: 7, waiting: [] } });
    const row = markup.slice(markup.indexOf("lp-window-row"), markup.indexOf("</section>"));

    expect(row).toContain("Titulaires du badge Soutien");
    expect(row).toContain("lp-user-badge--support");
    expect(row).toContain("lucide-heart");
    expect(row.indexOf("Titulaires")).toBeLessThan(row.indexOf("lucide-heart"));
    expect(row).toContain('<span class="lp-type-title">7</span>');
  });

  // Les dons non reliés : le nom Ko-fi, l'e-mail dessous, la date ; jamais le montant ; le bouton Relier à un compte
  it("lists each unlinked donation with the Ko-fi name, the e-mail below it and the day, and no amount", () => {
    const markup = render({ status: "ready", report: { holders: 1, waiting: [donation] } });

    expect(markup).toContain("Dons non reliés");
    expect(markup).toContain('<span class="lp-type-body">Camille R.</span>');
    expect(markup).toContain('<span class="lp-type-caption lp-muted">camille@example.com</span>');
    expect(markup).toContain('<span class="lp-type-caption lp-muted">2 novembre 2026</span>');
    expect(markup.indexOf("Camille R.")).toBeLessThan(markup.indexOf("camille@example.com"));
    expect(markup.indexOf("camille@example.com")).toBeLessThan(markup.indexOf("2 novembre 2026"));
    expect(markup).toContain("<span>Relier à un compte</span>");
    expect(markup).not.toMatch(/€|EUR|montant|amount/i);
  });

  // Rien en attente : la phrase, et aucune ligne
  it("says there is no donation waiting when the list is empty", () => {
    const markup = render({ status: "ready", report: { holders: 0, waiting: [] } });

    expect(markup).toContain("Aucun don en attente.");
    expect(markup).not.toContain("Relier à un compte");
  });

  // Fermé, le champ n'existe pas : il s'ouvre sur place, dans la ligne, quand on presse le bouton (lignes simples, aucune carte)
  it("opens no field until the button is pressed, and uses plain rows with no card", () => {
    const markup = render({ status: "ready", report: { holders: 1, waiting: [donation] } });

    expect(markup).not.toContain("Pseudo Twitch");
    expect(markup).not.toContain("lp-pill");
    expect(markup).toContain('aria-expanded="false"');
  });

  // Chargement : un squelette ; panne : une phrase atténuée
  it("shows a skeleton while loading and a muted sentence when it failed", () => {
    expect(render({ status: "loading" })).toContain("lp-skeleton");
    expect(render({ status: "failed" })).toContain("Les badges ne sont pas disponibles.");
  });

  // Le jour d'un don est celui de Paris, en toutes lettres
  it("writes the day of a donation in Paris time, in French", () => {
    expect(formatDonationDay(Date.UTC(2026, 9, 30, 23, 30))).toBe("31 octobre 2026");
    expect(formatDonationDay(Date.UTC(2026, 10, 2, 12))).toBe("2 novembre 2026");
  });

  // Un pseudo inconnu affiche un message sur la ligne, un autre message par refus
  it("has a message for each refusal, the unknown login included", () => {
    expect(linkFailureText("unknown_account")).toBe("Aucun compte ne porte ce pseudo.");
    expect(
      new Set(
        (["unknown_account", "already_linked", "unknown_donation", "failed"] as const).map(linkFailureText),
      ).size,
    ).toBe(4);
  });
});
