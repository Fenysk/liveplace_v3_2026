import { describe, expect, it } from "vitest";
import { Route as RootRoute } from "../../routes/__root";
import { adsTxtResponse } from "./ads-txt";

describe("la connexion du site à AdSense", () => {
  // Quand Google lit `/ads.txt`, le système doit le servir en texte brut, avec Google en vendeur direct du compte
  it("serves ads.txt as plain text naming Google as the direct seller", async () => {
    const response = adsTxtResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("google.com, pub-6181034891893686, DIRECT, f08c47fec0942fa0\n");
  });

  // Quand Google lit une page, le système doit y trouver la balise du compte, sans qu'aucun script ne se charge
  it("puts the AdSense account meta tag in the head of every page, with no script", async () => {
    const head = await RootRoute.options.head?.({} as never);

    expect(head?.meta).toContainEqual({ name: "google-adsense-account", content: "ca-pub-6181034891893686" });
    expect(head?.scripts).toBeUndefined();
  });
});
