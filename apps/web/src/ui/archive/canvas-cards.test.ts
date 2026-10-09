import { MAX_ARCHIVES } from "@liveplace/domain";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ListedArchive, ListedCanvas } from "../../usecase/list-canvases";
import { ARCHIVE_TEXTS } from "./archive-texts";
import { ArchivesSection } from "./canvas-cards";

const doNothing = (): void => undefined;

// Sans miniature : le damier, sans l'aperçu de pixels (qui a besoin du navigateur)
const active: ListedCanvas = {
  canvasId: "canvas-actif",
  createdAt: Date.UTC(2026, 9, 4, 10),
  thumbnail: null,
};

const archiveOf = (index: number, theme?: string): ListedArchive => ({
  canvasId: `archive-${index}`,
  createdAt: Date.UTC(2026, 9, 12, 10),
  archivedAt: Date.UTC(2026, 9, 18, 10),
  linkCode: `code${index}xxxxxx`,
  thumbnail: null,
  ...(theme ? { theme } : {}),
});

const sectionHtml = (current: ListedCanvas, archives: ListedArchive[]): string =>
  renderToString(
    createElement(ArchivesSection, {
      list: { status: "ready", canvases: { active: current, archives } },
      login: "kalyss",
      onArchive: doNothing,
      onCopyLink: doNothing,
      onReopen: doNothing,
      onDiscard: doNothing,
      onRetry: doNothing,
    }),
  );

describe("the rows of the Archives section (Écart §15, JOURNAL 2026-10-06)", () => {
  // Plus de cartes : ni leurs classes, ni un attribut `style` que la CSP de production bloquerait
  it("has no card, and no inline style", () => {
    const html = sectionHtml(active, [archiveOf(1, "Printemps"), archiveOf(2)]);

    expect(html).not.toContain("lp-canvas-card");
    expect(html).not.toMatch(/\sstyle=/);
  });

  // Le canvas en cours : son libellé, son titre à partir de sa date sans thème, et Archiver seul, sans « repartir à zéro »
  it("labels the current canvas, titles it by its date, and offers « Archiver » alone", () => {
    const html = sectionHtml(active, []);

    expect(html).toContain("Canvas en cours");
    expect(html).toContain("Depuis le 4 octobre 2026");
    expect(html).toMatch(/<button[^>]*class="lp-btn lp-type-body lp-btn--primary"[^>]*>.*Archiver<\/span>/);
    expect(html).not.toContain("repartir à zéro");
  });

  // Sans archive : « Archives · 0 sur 5 », puis la phrase
  it("says « Archives · 0 sur 5 » and the sentence when there is no archive", () => {
    const html = sectionHtml(active, []);

    expect(html).toContain("Archives · 0 sur 5");
    expect(html).toContain(ARCHIVE_TEXTS.fr.noArchive.replace("'", "&#x27;"));
    expect(html).not.toContain("<ul");
  });

  // Une archive : la miniature et le titre forment un seul lien nommé, qui ouvre un nouvel onglet ; l'icône suit le titre
  it("makes the thumbnail and the title one link named by the archive, opening a new tab, the icon after the title", () => {
    const html = sectionHtml(active, [archiveOf(1)]);
    const link = html.match(/<a [^>]*>.*?<\/a>/)?.[0] ?? "";

    expect(html).toContain("Archives · 1 sur 5");
    expect(link).toContain('href="/kalyss/archives/code1xxxxxx"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).toContain(
      'aria-label="Ouvrir l&#x27;archive Du 12 au 18 octobre 2026 dans un nouvel onglet"',
    );
    expect(link).toMatch(/Du 12 au 18 octobre 2026<svg[^>]*lucide-external-link/);
    expect(link).toContain("lp-canvas-thumb");
    expect(html).not.toContain("Ouvrir l&#x27;archive</");
  });

  // Sans thème, les dates sont le titre et rien dessous ; avec un thème, le thème est le titre et les dates la légende
  it("titles an archive by its dates without a theme, and by its theme with the dates below with one", () => {
    const unnamed = sectionHtml(active, [archiveOf(1)]);
    const named = sectionHtml(active, [archiveOf(1, "Printemps")]);

    expect(unnamed).toMatch(/lp-type-title">Du 12 au 18 octobre 2026<svg/);
    expect(unnamed).not.toContain('lp-muted">Du 12');
    expect(named).toMatch(/lp-type-title">Printemps<svg/);
    expect(named).toContain('lp-muted">Du 12 au 18 octobre 2026<');
  });

  // À droite : Rouvrir écrit, Copier le lien et Supprimer en icônes seules, nommées par leur titre
  it("offers Rouvrir written, and Copier le lien and Supprimer as icons named by their title", () => {
    const html = sectionHtml(active, [archiveOf(1)]);

    expect(html).toMatch(/<button[^>]*>.*Rouvrir<\/span><\/button>/);
    expect(html).toMatch(
      /<button[^>]*lp-btn--ghost[^>]*title="Copier le lien"[^>]*aria-label="Copier le lien"/,
    );
    expect(html).toMatch(/<button[^>]*lp-btn--ghost[^>]*title="Supprimer"[^>]*aria-label="Supprimer"/);
  });

  // Les archives se suivent dans une liste, de la plus récente à la plus ancienne
  it("lists the archives in a list, in the order it is given", () => {
    const html = sectionHtml(active, [archiveOf(2, "Récente"), archiveOf(1, "Ancienne")]);

    expect(html).toMatch(/<ul class="lp-canvas-list">/);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html.indexOf("Récente")).toBeLessThan(html.indexOf("Ancienne"));
  });

  // À cinq archives : Archiver est inactif, et la phrase dit de supprimer une archive d'abord
  it("disables Archiver at the maximum, and says to delete an archive first", () => {
    const archives = Array.from({ length: MAX_ARCHIVES }, (_, index) => archiveOf(index + 1));
    const html = sectionHtml(active, archives);

    expect(html).toContain(`Archives · ${MAX_ARCHIVES} sur ${MAX_ARCHIVES}`);
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*lp-btn--primary|<button[^>]*lp-btn--primary[^>]*disabled=""/,
    );
    expect(html).toContain("supprime-en une avant d&#x27;archiver.");
    expect(sectionHtml(active, archives.slice(1))).not.toContain("supprime-en une avant");
  });

  // Un canvas en cours avec un thème : le thème en titre, et « depuis le … » en légende
  it("titles a current canvas with a theme by its theme, the caption saying since when", () => {
    const html = sectionHtml({ ...active, theme: "Printemps" }, []);

    expect(html).toContain("Printemps");
    expect(html).toMatch(/lp-muted">depuis le 4 octobre 2026</);
    expect(html).not.toContain("Depuis le 4 octobre 2026");
  });
});
