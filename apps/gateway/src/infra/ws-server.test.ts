import { createServer } from "node:net";
import { CANVAS_FORMATS, CANVAS_HEIGHT, CANVAS_WIDTH } from "@liveplace/domain";
import type { ServerFrame } from "@liveplace/protocol";
import { describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import {
  isAllowedOrigin,
  MAX_BUFFERED_BYTES,
  startGatewayServer,
  toClientSocket,
  toDevice,
} from "./ws-server";

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

// §16.3 : le débit sortant du gateway se compte aux octets envoyés par socket.
describe("toClientSocket (JOURNAL 2026-10-07)", () => {
  const silent = { bufferedAmount: 0, send: () => undefined, close: () => undefined };

  // Compte les octets de chaque envoi : une frame partagée compte pour chaque socket, un snapshot aussi
  it("counts the bytes of each send: a shared frame counts for each socket, and a snapshot too", () => {
    const counted: number[] = [];
    const sockets = [silent, silent].map((socket) =>
      toClientSocket(
        socket,
        (bytes) => counted.push(bytes),
        () => undefined,
      ),
    );
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

// §6.3 : une connexion qui ne suit pas se ferme en 1013, et se resynchronise seule.
describe("toClientSocket — a connection that does not keep up (§6.3)", () => {
  // Ferme en 1013 une page qui ne lit plus, ne lui envoie plus rien, et elle l'entend dès qu'elle relit
  it("closes in 1013 a page that no longer reads, sends it nothing more, and the page hears it once it reads again", async () => {
    const pair = await openPair(false);
    try {
      const sent: number[] = [];
      const client = toClientSocket(
        pair.server,
        (bytes) => sent.push(bytes),
        () => undefined,
      );
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
      const client = toClientSocket(
        pair.server,
        () => undefined,
        () => undefined,
      );

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
    const client = toClientSocket(
      socket,
      () => undefined,
      () => undefined,
    );
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
    const client = toClientSocket(
      socket,
      (bytes) => sent.push(bytes),
      () => undefined,
    );
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

  // Compte une fois chaque connexion qu'il ferme en 1013 pour la capacité, et aucune qui suit (JOURNAL 2026-10-09)
  it("counts once each connection it closes in 1013 for the capacity, and none that keeps up", () => {
    const { socket, closes } = fillingSocket();
    let closedBehind = 0;
    const behind = toClientSocket(
      socket,
      () => undefined,
      () => {
        closedBehind += 1;
      },
    );
    const broadcast = cellsFrame(10);

    behind.sendSnapshot(biggestSnapshot());
    for (let sends = 0; sends < 10_000 && closes.length === 0; sends += 1) behind.sendFrame(broadcast);
    behind.sendFrame(broadcast);
    behind.sendFrame(broadcast);

    expect(closes).toEqual([1013]);
    expect(closedBehind).toBe(1);

    const keepingUp = toClientSocket(
      { bufferedAmount: 0, send: () => undefined, close: () => undefined },
      () => undefined,
      () => {
        closedBehind += 1;
      },
    );
    for (let version = 1; version <= 100; version += 1) keepingUp.sendFrame(broadcast);
    keepingUp.close(1000);
    expect(closedBehind).toBe(1);
  });
});

describe("toDevice (§16.1)", () => {
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

// Un port libre : `startGatewayServer` ne rend pas l'adresse qu'il écoute.
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

const settle = (client: WebSocket) =>
  new Promise<void>((resolve) => {
    client.once("close", () => resolve());
    client.once("error", () => undefined);
  });

// Audit de sécurité n°5 : une erreur de socket ne fait pas tomber le gateway, sans handler global.
describe("startGatewayServer — errors on a socket", () => {
  const start = async (verify: () => Promise<null>) => {
    const port = await freePort();
    const gateway = startGatewayServer({
      port,
      publicOrigin,
      verifier: { verify },
      openConnection: () => ({ receive: async () => undefined, close: async () => undefined }),
      onBytesSent: () => undefined,
      onClosedBehind: () => undefined,
    });
    return { port, gateway };
  };

  // Un vérificateur qui échoue détruit la socket de cette page seule, et le serveur répond encore après
  it("destroys the socket when the upgrade throws, and keeps serving", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let attempts = 0;
    const { port, gateway } = await start(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("redis indisponible");
      return null;
    });
    try {
      await settle(new WebSocket(`ws://127.0.0.1:${port}/ws`));
      const second = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        second.once("open", () => resolve());
        second.once("error", reject);
      });
      second.terminate();
      expect(attempts).toBe(2);
    } finally {
      await gateway.close();
      quiet.mockRestore();
    }
  });

  // Une trame trop grosse fait émettre `error` à la socket ouverte : sans écouteur, le processus tomberait
  it("survives an error emitted on an upgraded socket", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { port, gateway } = await start(async () => null);
    try {
      const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise<void>((resolve) => client.once("open", () => resolve()));
      const closed = settle(client);
      client.send("x".repeat(64 * 1024));
      await closed;
      const second = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        second.once("open", () => resolve());
        second.once("error", reject);
      });
      second.terminate();
      expect(quiet).toHaveBeenCalled();
    } finally {
      await gateway.close();
      quiet.mockRestore();
    }
  });
});

// Audit de sécurité n°6 : un plafond de connexions ouvertes par adresse de client, lue dans `X-Forwarded-For`.
describe("startGatewayServer — connections per address", () => {
  const start = async (maxConnectionsPerAddress: number, verify: () => Promise<null> = async () => null) => {
    const port = await freePort();
    const gateway = startGatewayServer({
      port,
      publicOrigin,
      verifier: { verify },
      openConnection: () => ({ receive: async () => undefined, close: async () => undefined }),
      onBytesSent: () => undefined,
      onClosedBehind: () => undefined,
      maxConnectionsPerAddress,
    });
    return { port, gateway };
  };

  const connect = (port: number, forwardedFor?: string) =>
    new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    });

  const opened = (client: WebSocket) =>
    new Promise<WebSocket>((resolve, reject) => {
      client.once("open", () => resolve(client));
      client.once("error", reject);
      client.once("unexpected-response", (_request, response) =>
        reject(new Error(`refused ${response.statusCode}`)),
      );
    });

  const refusedWith = (client: WebSocket) =>
    new Promise<number | undefined>((resolve) => {
      client.once("unexpected-response", (_request, response) => resolve(response.statusCode));
      client.once("open", () => resolve(undefined));
      client.once("error", () => undefined);
    });

  // Au plafond, la connexion suivante de la même adresse reçoit un 429 ; une autre adresse passe encore
  it("refuses the connection over the cap with a 429, and still accepts another address", async () => {
    const { port, gateway } = await start(2);
    const clients: WebSocket[] = [];
    try {
      clients.push(await opened(connect(port, "203.0.113.7")), await opened(connect(port, "203.0.113.7")));
      const over = connect(port, "203.0.113.7");
      expect(await refusedWith(over)).toBe(429);
      clients.push(await opened(connect(port, "203.0.113.8")));
    } finally {
      for (const client of clients) client.terminate();
      await gateway.close();
    }
  });

  // Les entrées de gauche de `X-Forwarded-For` sont écrites par le client : seule celle de droite, posée par Traefik, compte
  it("counts the rightmost X-Forwarded-For entry and ignores a forged left one", async () => {
    const { port, gateway } = await start(1);
    const clients: WebSocket[] = [];
    try {
      clients.push(await opened(connect(port, "1.1.1.1, 203.0.113.7")));
      expect(await refusedWith(connect(port, "2.2.2.2, 203.0.113.7"))).toBe(429);
    } finally {
      for (const client of clients) client.terminate();
      await gateway.close();
    }
  });

  // Sans `X-Forwarded-For`, l'adresse de la socket sert : une boucle locale n'échappe pas au plafond
  it("falls back to the socket address without X-Forwarded-For", async () => {
    const { port, gateway } = await start(1);
    const clients: WebSocket[] = [];
    try {
      clients.push(await opened(connect(port)));
      expect(await refusedWith(connect(port))).toBe(429);
    } finally {
      for (const client of clients) client.terminate();
      await gateway.close();
    }
  });

  // Une connexion fermée rend sa place : le plafond ne s'use pas, même sur de longues séries d'ouvertures et de fermetures
  it("frees the slot when a connection closes, with no leak over many cycles", async () => {
    const { port, gateway } = await start(1);
    try {
      for (let cycle = 0; cycle < 20; cycle += 1) {
        const client = await vi.waitFor(() => opened(connect(port, "203.0.113.7")));
        const closed = settle(client);
        client.close();
        await closed;
      }
    } finally {
      await gateway.close();
    }
  });

  // Un upgrade abandonné (session illisible) rend aussi sa place
  it("frees the slot when the upgrade fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let attempts = 0;
    const { port, gateway } = await start(1, async () => {
      attempts += 1;
      if (attempts <= 3) throw new Error("redis indisponible");
      return null;
    });
    const clients: WebSocket[] = [];
    try {
      for (let failure = 0; failure < 3; failure += 1) await settle(connect(port, "203.0.113.7"));
      clients.push(await vi.waitFor(() => opened(connect(port, "203.0.113.7"))));
    } finally {
      for (const client of clients) client.terminate();
      await gateway.close();
      quiet.mockRestore();
    }
  });
});
