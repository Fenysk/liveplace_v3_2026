import { describe, expect, it } from "vitest";
import { type AdsByGoogleQueue, createAdSenseLoader, type ScriptHost } from "./ad-loader";

type FakePage = ScriptHost & { added: string[]; queue(): AdsByGoogleQueue; fail(): void };

// Une page factice : le script se « charge » quand le test le décide.
const fakePage = (): FakePage => {
  const added: string[] = [];
  const queue: AdsByGoogleQueue = [];
  let callbacks: { onLoad(): void; onError(): void } | undefined;
  return {
    added,
    hasScript: () => added.length > 0,
    addScript: (src, onLoad, onError) => {
      added.push(src);
      callbacks = { onLoad, onError };
      onLoad();
    },
    queue: () => queue,
    fail: () => callbacks?.onError(),
  };
};

describe("le chargeur AdSense", () => {
  // Quand la pub est demandée deux fois, le système doit ne charger qu'un seul script
  it("loads a single script however many times it is asked", async () => {
    const page = fakePage();
    const loader = createAdSenseLoader(page);

    await Promise.all([loader.ensureScript(), loader.ensureScript()]);
    await loader.ensureScript();

    expect(page.added).toHaveLength(1);
    expect(page.added[0]).toBe(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6181034891893686",
    );
  });

  // Quand le script est chargé, le système doit demander des pubs non personnalisées avant tout emplacement
  it("asks for non-personalized ads before any slot is pushed", async () => {
    const page = fakePage();
    const loader = createAdSenseLoader(page);

    await loader.ensureScript();
    loader.pushSlot();

    expect(page.queue().requestNonPersonalizedAds).toBe(1);
    expect(page.queue()).toHaveLength(1);
  });

  // Si le script est déjà dans la page, le système doit s'en servir au lieu d'en ajouter un autre
  it("reuses a script already in the page", async () => {
    const page = fakePage();
    page.addScript(
      "déjà là",
      () => undefined,
      () => undefined,
    );
    const loader = createAdSenseLoader(page);

    await loader.ensureScript();

    expect(page.added).toEqual(["déjà là"]);
    expect(page.queue().requestNonPersonalizedAds).toBe(1);
  });

  // Si le chargement échoue, le système doit refuser, puis laisser une nouvelle tentative
  it("rejects when the script fails, then lets a later attempt try again", async () => {
    const added: string[] = [];
    let isFailing = true;
    const page: ScriptHost = {
      hasScript: () => false,
      addScript: (src, onLoad, onError) => {
        added.push(src);
        if (isFailing) onError();
        else onLoad();
      },
      queue: () => [],
    };
    const loader = createAdSenseLoader(page);

    await expect(loader.ensureScript()).rejects.toThrow("AdSense script failed to load");
    isFailing = false;
    await expect(loader.ensureScript()).resolves.toBeUndefined();
    expect(added).toHaveLength(2);
  });
});
