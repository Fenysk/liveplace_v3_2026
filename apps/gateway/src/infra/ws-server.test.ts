import { describe, expect, it } from "vitest";
import { isAllowedOrigin, toClientSocket, toDevice } from "./ws-server";

const publicOrigin = "https://liveplace.tv";

describe("isAllowedOrigin (audit de sécurité §4, JOURNAL 2026-09-29)", () => {
  // Une page du site ouvre le WebSocket
  it("accepts the public origin", () => {
    expect(isAllowedOrigin("https://liveplace.tv", publicOrigin)).toBe(true);
  });

  // Une page d'ailleurs est refusée : autre site, autre schéma, sous-domaine, origine opaque
  it("refuses every other origin", () => {
    for (const origin of [
      "https://evil.example",
      "http://liveplace.tv",
      "https://www.liveplace.tv",
      "https://liveplace.tv.evil.example",
      "null",
    ])
      expect(isAllowedOrigin(origin, publicOrigin)).toBe(false);
  });

  // Sans `Origin`, ce n'est pas un navigateur : les bots des preuves et le test de charge passent
  it("accepts a handshake without Origin", () => {
    expect(isAllowedOrigin(undefined, publicOrigin)).toBe(true);
  });
});

// Écart §5.1 (JOURNAL 2026-10-07) : le débit sortant du gateway se compte aux octets envoyés par socket.
describe("toClientSocket (JOURNAL 2026-10-07)", () => {
  const silent = { send: () => undefined, close: () => undefined };

  // Compte les octets de chaque envoi : une frame partagée compte pour chaque socket, un snapshot aussi
  it("counts the bytes of each send: a shared frame counts for each socket, and a snapshot too", () => {
    const counted: number[] = [];
    const sockets = [silent, silent].map((socket) => toClientSocket(socket, (bytes) => counted.push(bytes)));
    const frame = { t: "pong" } as const; // `{"t":"pong"}` : 12 octets

    for (const socket of sockets) socket.sendFrame(frame);
    sockets[0]?.sendSnapshot(new Uint8Array(2500));

    expect(counted).toEqual([12, 12, 2500]);
  });

  // Envoie ce qu'il compte : la même frame, en texte, et le snapshot, en binaire
  it("sends what it counts: the same frame as text, and the snapshot as binary", () => {
    const sent: unknown[][] = [];
    const socket = toClientSocket(
      { send: (...args: unknown[]) => sent.push(args), close: () => undefined },
      () => undefined,
    );

    socket.sendFrame({ t: "pong" });
    socket.sendSnapshot(new Uint8Array(3));

    expect(sent.map(([, options]) => options)).toEqual([{ binary: false }, { binary: true }]);
    expect(String(sent[0]?.[0])).toBe('{"t":"pong"}');
  });
});

describe("toDevice (écart §4.3, JOURNAL 2026-10-06)", () => {
  // Lit un téléphone au User-Agent d'un mobile, un PC sinon, et sans User-Agent
  it("reads a phone in a mobile User-Agent, a desktop otherwise and without one", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const android =
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
    const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

    expect(toDevice(iphone)).toBe("phone");
    expect(toDevice(android)).toBe("phone");
    expect(toDevice(windows)).toBe("desktop");
    expect(toDevice(undefined)).toBe("desktop");
  });
});
