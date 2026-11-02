import { describe, expect, it } from "vitest";
import { CLOSE_ACCOUNT_DELETED, createOpenConnections, type OpenConnection } from "./open-connections";

const openOn = (userId: string | undefined, ownerId: string | undefined) => {
  const closed: number[] = [];
  const connection: OpenConnection = { userId, ownerId, socket: { close: (code) => closed.push(code) } };
  return { connection, closed };
};

describe("the open connections of the gateway (CDC §8, Supprimer son compte)", () => {
  // Ferme les connexions du compte, et celles des pages de ses fresques, qu'elles aient une session ou non
  it("closes the connections of the account and the pages of its canvases, session or not", () => {
    const connections = createOpenConnections();
    const own = openOn("user-1", undefined); // avant son hello
    const onItsCanvas = openOn("viewer-2", "user-1");
    const obsOnItsCanvas = openOn(undefined, "user-1");
    const elsewhere = openOn("viewer-2", "streamer-9");
    for (const { connection } of [own, onItsCanvas, obsOnItsCanvas, elsewhere]) connections.add(connection);

    expect(connections.closeAccount("user-1")).toBe(3);

    expect(own.closed).toEqual([CLOSE_ACCOUNT_DELETED]);
    expect(onItsCanvas.closed).toEqual([CLOSE_ACCOUNT_DELETED]);
    expect(obsOnItsCanvas.closed).toEqual([CLOSE_ACCOUNT_DELETED]);
    expect(elsewhere.closed).toEqual([]);
  });

  // Une page qui a joint le canvas après coup est trouvée par son streamer
  it("finds a page by the owner it learned of after its hello", () => {
    const connections = createOpenConnections();
    const page = openOn("viewer-2", undefined);
    connections.add(page.connection);
    page.connection.ownerId = "user-1";

    expect(connections.closeAccount("user-1")).toBe(1);
  });

  // Une connexion retirée à sa fermeture n'est plus fermée
  it("no longer closes a connection once it was released", () => {
    const connections = createOpenConnections();
    const page = openOn("user-1", undefined);
    const release = connections.add(page.connection);

    release();

    expect(connections.closeAccount("user-1")).toBe(0);
    expect(page.closed).toEqual([]);
  });
});
