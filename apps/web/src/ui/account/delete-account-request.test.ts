import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "./delete-account-request";

afterEach(() => {
  vi.restoreAllMocks();
});

const sendOf = (response: Response | Error) => {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({ url: String(url), init });
    if (response instanceof Error) throw response;
    return response;
  };
  return { send, sent };
};

const reply = (body: string, status = 200) => new Response(body, { status });

describe("requestAccountDeletion (CDC §8)", () => {
  // Un POST à l'adresse de la route, avec le cookie de la session, sans corps
  it("posts to the route with the session cookie, and succeeds on ok", async () => {
    const { send, sent } = sendOf(reply('{"ok":true}'));

    expect(await requestAccountDeletion(send)).toEqual({ ok: true, value: undefined });

    expect(sent).toEqual([
      { url: "/auth/delete-account", init: { method: "POST", credentials: "same-origin" } },
    ]);
  });

  // Chaque raison du serveur arrive telle quelle à la fenêtre
  it("hands each reason of the server to the window as it is", async () => {
    for (const [status, error] of [
      [401, "unauthenticated"],
      [502, "failed"],
      [403, "forbidden"],
    ] as const) {
      const { send } = sendOf(reply(JSON.stringify({ ok: false, error }), status));

      expect(await requestAccountDeletion(send)).toEqual({ ok: false, error });
    }
  });

  // Une réponse que la page ne comprend pas (une page d'erreur du proxy) vaut un échec, pas une réussite
  it("takes an answer it does not understand as a failure, never as a success", async () => {
    for (const body of ["<html>502</html>", "{}", '{"ok":false,"error":"autre"}', '{"ok":"true"}', "null"]) {
      const { send } = sendOf(reply(body, 502));

      expect(await requestAccountDeletion(send)).toEqual({ ok: false, error: "failed" });
    }
  });

  // Pas de réponse du tout : l'erreur réseau, journalisée sans rien qui nomme le compte
  it("says network when nothing answers, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { send } = sendOf(new TypeError("Failed to fetch"));

    expect(await requestAccountDeletion(send)).toEqual({ ok: false, error: "network" });

    expect(logged).toHaveBeenCalledTimes(1);
  });
});
