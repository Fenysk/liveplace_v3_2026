// Le callback OAuth, dans l'ordre du §10.1. Chaque étape est idempotente : un callback rejoué ne crée rien en double.

import { defaultCanvasMeta, type User } from "@liveplace/domain";
import type {
  DurableStore,
  SessionSigner,
  SignedInUser,
  SignInWrites,
  TwitchAuth,
} from "@liveplace/domain/ports";

export type SignInDeps = {
  twitch: TwitchAuth;
  durable: DurableStore;
  redis: SignInWrites;
  signer: SessionSigner;
  randomCanvasId: () => string;
};

export type SignInResult = { signedSession: string; login: string };

// Écart §8.1 (JOURNAL 2026-09-27) : le streamer dont la page a lancé la connexion. Jamais soi-même, rien depuis l'accueil.
const getDiscoveredViaUserId = async (
  durable: DurableStore,
  user: User,
  returnPath: string | null,
): Promise<string | undefined> => {
  const login = returnPath?.slice(1);
  if (!login || login === user.login) return undefined;
  const owner = await durable.getUserByLogin(login);
  return owner && owner.userId !== user.userId ? owner.userId : undefined;
};

// `returnPath` : le canvas d'où l'on s'est connecté, déjà validé (`toReturnPath`), ou `null`.
export async function completeSignIn(
  deps: SignInDeps,
  code: string,
  returnPath: string | null,
): Promise<SignInResult> {
  return signInTwitchUser(deps, await deps.twitch.getUserFromCode(code), returnPath);
}

// La connexion d'un utilisateur que Twitch vient de rendre : par le code seul, ou avec sa chaîne (sync-twitch.ts).
export async function signInTwitchUser(
  deps: SignInDeps,
  signedIn: SignedInUser,
  returnPath: string | null,
): Promise<SignInResult> {
  // Écart §10.1 (JOURNAL 2026-09-27) : l'e-mail ne va qu'à Convex, jamais dans Redis ni dans la session.
  const { email, ...user } = signedIn;
  const discoveredViaUserId = await getDiscoveredViaUserId(deps.durable, user, returnPath);
  await deps.durable.upsertUserFromTwitch({ ...user, ...(email ? { email } : {}) }, discoveredViaUserId);
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
