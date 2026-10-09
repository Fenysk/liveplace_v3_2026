import { CANVAS_FORMATS, CANVAS_HEIGHT, CANVAS_WIDTH } from "@liveplace/domain";
import type { ServerFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { isAllowedOrigin, MAX_BUFFERED_BYTES, toClientSocket, toDevice } from "./ws-server";

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
  const silent = { bufferedAmount: 0, send: () => undefined, close: () => undefined };

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
      { bufferedAmount: 0, send: (...args: unknown[]) => sent.push(args), close: () => undefined },
      () => undefined,
    );

    socket.sendFrame({ t: "pong" });
    socket.sendSnapshot(new Uint8Array(3));

    expect(sent.map(([, options]) => options)).toEqual([{ binary: false }, { binary: true }]);
    expect(String(sent[0]?.[0])).toBe('{"t":"pong"}');
  });
});

// Le plus gros snapshot qu'un canvas puisse faire : un octet par case, des canvas d'avant les formats aux plus grands formats.
const biggestSnapshot = (): Uint8Array =>
  new Uint8Array(
    Math.max(
      CANVAS_WIDTH * CANVAS_HEIGHT,
      ...CANVAS_FORMATS.flatMap(({ sizes }) => sizes.map(({ width, height }) => width * height)),
    ),
  );

// Une frame `cells` de `count` cases : ~117 octets chacune, le `recent` d'une vue OBS ou le resync d'une page revenue.
const cellsFrame = (count: number): ServerFrame => ({
  t: "cells",
  toVersion: count,
  cells: Array.from({ length: count }, (_, version) => ({
    x: 1,
    y: 2,
    colorIndex: 3,
    previousColorIndex: 0,
    placedAt: 1_700_000_000_000,
    version,
    kind: "place" as const,
  })),
});

// Une socket qui ne vide rien : sa file est tout ce qu'on lui a envoyé.
const fillingSocket = () => {
  const queue = { bytes: 0 };
  const closes: number[] = [];
  const socket = {
    get bufferedAmount() {
      return queue.bytes;
    },
    send: (payload: unknown) => {
      if (payload instanceof Uint8Array) queue.bytes += payload.length;
    },
    close: (code?: number) => {
      if (code !== undefined) closes.push(code);
    },
  };
  return { socket, closes };
};

// Une vraie paire `ws` sur un port éphémère. Hors lecture, le client laisse tout ce qu'on lui envoie dans les tampons du système.
const openPair = async (isReading: boolean) => {
  const sockets = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => sockets.once("listening", () => resolve()));
  const address = sockets.address();
  if (typeof address === "string" || address === null) throw new Error("adresse d'écoute inattendue");
  const accepted = new Promise<WebSocket>((resolve) => sockets.once("connection", resolve));
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const reading: { resume: () => void } = { resume: () => undefined };
  if (!isReading)
    client.once("upgrade", ({ socket }) => {
      socket.pause();
      reading.resume = () => socket.resume();
    });
  const opened = new Promise<void>((resolve) => client.once("open", () => resolve()));
  const [server] = await Promise.all([accepted, opened]);
  return {
    server,
    client,
    resume: () => reading.resume(),
    stop: () => {
      client.terminate();
      server.terminate();
      sockets.close();
    },
  };
};

// §6.3 : une connexion qui ne suit pas se ferme en 1013, et se resynchronise seule ; Écart §6.3 (JOURNAL 2026-10-09).
describe("toClientSocket — a connection that does not keep up (§6.3)", () => {
  // Ferme en 1013 une page qui ne lit plus, ne lui envoie plus rien, et elle l'entend dès qu'elle relit
  it("closes in 1013 a page that no longer reads, sends it nothing more, and the page hears it once it reads again", async () => {
    const pair = await openPair(false);
    try {
      const sent: number[] = [];
      const client = toClientSocket(pair.server, (bytes) => sent.push(bytes));
      const snapshot = biggestSnapshot();
      for (let sends = 0; sends < 4096 && pair.server.readyState === WebSocket.OPEN; sends += 1)
        client.sendSnapshot(snapshot);

      expect(pair.server.readyState).toBe(WebSocket.CLOSING);
      const buffered = pair.server.bufferedAmount;
      expect(buffered).toBeGreaterThan(MAX_BUFFERED_BYTES);

      const delivered = sent.length;
      client.sendSnapshot(snapshot);
      client.sendFrame({ t: "pong" });
      expect(pair.server.bufferedAmount).toBe(buffered);
      expect(sent).toHaveLength(delivered);

      const closing = new Promise<number>((resolve) => pair.client.once("close", resolve));
      pair.resume();
      expect(await closing).toBe(1013);
    } finally {
      pair.stop();
    }
  });

  // Sert une page qui lit : le plus gros snapshot, une frame de plus de 1 Mio, puis la diffusion, reçus sans fermeture
  it("keeps serving a page that reads: the biggest snapshot, a frame over 1 MiB, then the broadcast, all received", async () => {
    const pair = await openPair(true);
    try {
      const total = 2 + 200;
      let count = 0;
      let closedWith: number | undefined;
      const received = new Promise<void>((resolve) =>
        pair.client.on("message", () => {
          count += 1;
          if (count === total) resolve();
        }),
      );
      pair.client.on("close", (code) => {
        closedWith = code;
      });
      const client = toClientSocket(pair.server, () => undefined);

      client.sendFrame(cellsFrame(12_000));
      client.sendSnapshot(biggestSnapshot());
      for (let version = 1; version <= 200; version += 1) client.sendFrame(cellsFrame(1 + (version % 5)));
      await received;

      expect(pair.server.readyState).toBe(WebSocket.OPEN);
      expect(closedWith).toBeUndefined();
    } finally {
      pair.stop();
    }
  });

  // Laisse finir l'arrivée d'une page qui la vide encore : une frame de plus de 1 Mio, le plus gros snapshot, puis la diffusion
  it("lets a page finish its arrival while it still empties it: a frame over 1 MiB, the biggest snapshot, then the broadcast", () => {
    const { socket, closes } = fillingSocket();
    const client = toClientSocket(socket, () => undefined);
    const arrival = cellsFrame(12_000);

    client.sendFrame(arrival);
    client.sendSnapshot(biggestSnapshot());
    for (let version = 1; version <= 100; version += 1) client.sendFrame(cellsFrame(1));

    expect(socket.bufferedAmount).toBeGreaterThan(MAX_BUFFERED_BYTES);
    expect(closes).toEqual([]);
  });

  // Ferme dès que la diffusion seule empile plus de 1 Mio derrière la plus grosse frame, puis ne lui envoie plus rien
  it("closes as soon as the broadcast alone piles up more than 1 MiB behind the biggest frame, then sends nothing more", () => {
    const { socket, closes } = fillingSocket();
    const sent: number[] = [];
    const client = toClientSocket(socket, (bytes) => sent.push(bytes));
    const snapshot = biggestSnapshot();
    const broadcast = cellsFrame(10);

    client.sendSnapshot(snapshot);
    for (let sends = 0; sends < 10_000 && closes.length === 0; sends += 1) client.sendFrame(broadcast);

    const frameBytes = sent.at(-1) ?? 0;
    expect(closes).toEqual([1013]);
    expect(socket.bufferedAmount).toBeGreaterThan(MAX_BUFFERED_BYTES + snapshot.length);
    expect(socket.bufferedAmount).toBeLessThanOrEqual(MAX_BUFFERED_BYTES + snapshot.length + frameBytes);

    const closedAt = socket.bufferedAmount;
    client.sendFrame(broadcast);
    client.sendSnapshot(snapshot);
    expect(socket.bufferedAmount).toBe(closedAt);
    expect(closes).toEqual([1013]);
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
