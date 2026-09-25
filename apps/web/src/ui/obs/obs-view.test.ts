import { describe, expect, it } from "vitest";
import { OBS_VIEW_SCRIPT } from "./obs-view";

// Le script d'avant la première peinture, exécuté contre un faux navigateur.
const runObsViewScript = (pathname: string, isInObs: boolean): string | undefined => {
  const root: { dataset: { view?: string } } = { dataset: {} };
  const fakeWindow = isInObs ? { obsstudio: { pluginVersion: "2.24.0" } } : {};
  new Function("window", "location", "document", OBS_VIEW_SCRIPT)(
    fakeWindow,
    { pathname },
    { documentElement: root },
  );
  return root.dataset.view;
};

describe("the OBS view marker (§9.1, JOURNAL 2026-09-25)", () => {
  // Marque la page dans une source OBS Studio ou Streamlabs, qui injectent toutes deux window.obsstudio
  it("marks the page inside an OBS Studio or Streamlabs source, which both inject window.obsstudio", () => {
    expect(runObsViewScript("/fenysk", true)).toBe("obs");
  });

  // Marque la page sur /{login}/obs, qui force la vue dans un navigateur normal
  it("marks the page on /{login}/obs, which forces the view in a normal browser", () => {
    expect(runObsViewScript("/fenysk/obs", false)).toBe("obs");
    expect(runObsViewScript("/fenysk/obs/", false)).toBe("obs");
  });

  // Ne marque ni le jeu, ni la page d'un streamer qui s'appellerait « obs »
  it("marks neither the game, nor the page of a streamer whose login would be obs", () => {
    expect(runObsViewScript("/fenysk", false)).toBeUndefined();
    expect(runObsViewScript("/obs", false)).toBeUndefined();
  });
});
