import { PALETTE } from "@liveplace/domain";
import type { InspectEntry } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModerationControls } from "../moderation/use-moderation";
import { InspectionPill } from "./inspection-pill";

const now = 1_700_000_000_000;

const entry: InspectEntry = {
  userId: "3",
  login: "troll42",
  displayName: "Troll42",
  colorIndex: 5,
  placedAt: now - 60_000,
  placementId: "pdemo0001",
};

const noop = () => undefined;
const moderating: ModerationControls = { isProtected: () => false, onModerate: noop };
const owning: ModerationControls = { ...moderating, onSetModerator: noop };

const render = (author: InspectEntry, moderation?: ModerationControls) =>
  renderToStaticMarkup(
    createElement(InspectionPill, {
      inspection: { status: "found", x: 1, y: 2, entry: author },
      palette: PALETTE,
      nowMs: now,
      onClose: noop,
      moderation,
      isDocked: false,
    }),
  );

describe("Bannir in the Inspection pill (Écart §5.4, JOURNAL 2026-10-08)", () => {
  // Qui modère retire ses pixels et bannit un joueur, et un modérateur venu de Twitch seul
  it("is offered to whoever moderates on a player, and on a moderator who comes from Twitch only", () => {
    const player = render(entry, moderating);
    const fromTwitch = render(
      { ...entry, moderatorOrigin: { isFromTwitch: true, isNamedHere: false } },
      moderating,
    );

    for (const html of [player, fromTwitch]) {
      expect(html).toContain("Retirer ses pixels");
      expect(html).toContain("Bannir");
    }
  });

  // Un modérateur nommé ici, même modérateur Twitch aussi, se vide de ses pixels mais ne se bannit pas
  it("is absent on a moderator named here, even when Twitch names him too, who can still be cleared", () => {
    const namedHere = render(
      { ...entry, moderatorOrigin: { isFromTwitch: false, isNamedHere: true } },
      moderating,
    );
    const both = render({ ...entry, moderatorOrigin: { isFromTwitch: true, isNamedHere: true } }, moderating);

    for (const html of [namedHere, both]) {
      expect(html).toContain("Retirer ses pixels");
      expect(html).not.toContain("Bannir");
    }
  });

  // Le streamer retire d'abord son rôle à un modérateur nommé ici : l'inspection lui propose Retirer modérateur, sans Bannir
  it("leaves the owner Retirer modérateur on a moderator named here, and no Bannir", () => {
    const html = render({ ...entry, moderatorOrigin: { isFromTwitch: false, isNamedHere: true } }, owning);

    expect(html).toContain("Retirer modérateur");
    expect(html).not.toContain("Bannir");
  });

  // Sans droit de modérer, la pill n'offre ni l'un ni l'autre
  it("is absent without the right to moderate", () => {
    const html = render(entry);

    expect(html).not.toContain("Bannir");
    expect(html).not.toContain("Retirer ses pixels");
  });
});

describe("the Inspection pill while its pixel loads", () => {
  const renderLoading = () =>
    renderToStaticMarkup(
      createElement(InspectionPill, {
        inspection: { status: "loading", x: 12, y: 40 },
        palette: PALETTE,
        nowMs: now,
        onClose: noop,
        isDocked: false,
      }),
    );

  // Tant que la réponse n'a pas 200 ms, la pill reste fermée, mais elle a déjà la forme de la case et le bouton Fermer
  it("holds the shape of the cell, closed, before the 200 ms have passed", () => {
    const html = renderLoading();

    expect(html).toContain("lp-pill is-hidden");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement…");
    expect(html).toContain("(12, 40)");
    expect(html).toContain("lp-skeleton-bar");
    expect(html).toContain('title="Fermer (Échap)"');
  });

  // Aucun nom ni aucune date inventés pendant l'attente
  it("shows neither a name nor a date before the answer", () => {
    const html = renderLoading();

    expect(html).not.toContain("Troll42");
    expect(html).not.toContain("il y a");
    expect(html).not.toContain("lp-avatar");
  });

  // Une fois la réponse là, la pill montre la case sans trace d'attente
  it("shows the cell with no trace of the wait once the answer is there", () => {
    const html = render(entry);

    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("lp-skeleton");
    expect(html).toContain("Troll42");
  });
});
