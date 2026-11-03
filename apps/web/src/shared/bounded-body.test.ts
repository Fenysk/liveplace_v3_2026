import { describe, expect, it } from "vitest";
import { getBoundedBody } from "./bounded-body";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });

describe("getBoundedBody", () => {
  // Un corps dans la borne se rend en entier, à l'octet près
  it("gives the whole body when it fits", async () => {
    const bytes = await getBoundedBody(post("abcdef"), 6);
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("abcdef");
  });

  // Un en-tête qui annonce plus que la borne refuse sans rien lire
  it("refuses a body that announces more than the bound", async () => {
    expect(await getBoundedBody(post("abc", { "content-length": "7" }), 6)).toBeNull();
  });

  // Un corps qui dépasse la borne sans l'annoncer (en morceaux) s'arrête en route
  it("refuses a body that goes over the bound without announcing it", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(4));
        controller.close();
      },
    });
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await getBoundedBody(request, 6)).toBeNull();
  });

  // Sans corps, la borne ne gêne pas : zéro octet
  it("gives no bytes for a request without a body", async () => {
    expect(await getBoundedBody(new Request("http://localhost/x", { method: "POST" }), 6)).toEqual(
      new Uint8Array(),
    );
  });
});
