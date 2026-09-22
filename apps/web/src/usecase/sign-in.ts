// Le callback OAuth, dans l'ordre du §10.1. Chaque étape est idempotente : un callback rejoué ne crée rien en double.

import { defaultCanvasMeta } from "@liveplace/domain";
import type { DurableStore, SessionSigner, SignInWrites, TwitchAuth } from "@liveplace/domain/ports";

export type SignInDeps = {
  twitch: TwitchAuth;
  durable: DurableStore;
  redis: SignInWrites;
  signer: SessionSigner;
  randomCanvasId: () => string;
};

export type SignInResult = { signedSession: string; login: string };

export async function completeSignIn(deps: SignInDeps, code: string): Promise<SignInResult> {
  const user = await deps.twitch.getUserFromCode(code);
  await deps.durable.upsertUserFromTwitch(user);
  const meta = defaultCanvasMeta(user.userId);
  // Le candidat n'est retenu qu'à la première connexion : seul le `canvasId` rendu fait foi (D-14).
  const canvasId = await deps.durable.ensureCanvasForOwner(user.userId, {
    canvasId: deps.randomCanvasId(),
    width: meta.width,
    height: meta.height,
  });
  await deps.redis.setUser(user);
  await deps.redis.createCanvas(canvasId, meta);
  return { signedSession: await deps.signer.sign(user), login: user.login };
}
