// Le callback OAuth, dans l'ordre du §10.1. Chaque étape est idempotente : un callback rejoué ne crée rien en double.

import { defaultCanvasMeta, type Timestamp, type User } from "@liveplace/domain";
import type {
  DurableStore,
  SessionSigner,
  SignedInUser,
  SignInWrites,
  TwitchAuth,
} from "@liveplace/domain/ports";
import type { TwitchLiveTracker } from "./twitch-live";

export type SignInDeps = {
  twitch: TwitchAuth;
  // Les comptes et le canvas actif : la connexion ne touche jamais aux archives.
  durable: Pick<
    DurableStore,
    "upsertUserFromTwitch" | "getUserByLogin" | "ensureCanvasForOwner" | "getActiveCanvasForOwner"
  >;
  redis: SignInWrites;
  signer: SessionSigner;
  tracker: Pick<TwitchLiveTracker, "track">; // Écart §4 et §10.1 (JOURNAL 2026-10-07) : jamais bloquant, ni en échec
  randomCanvasId: () => string;
  now: () => Timestamp;
};

export type SignInResult = { signedSession: string; login: string };

// §8.1 : le streamer dont la page a lancé la connexion. Jamais soi-même, rien depuis l'accueil.
const getDiscoveredViaUserId = async (
  durable: Pick<DurableStore, "getUserByLogin">,
  user: User,
  returnPath: string | null,
): Promise<string | undefined> => {
  const login = returnPath?.slice(1);
  if (!login || login === user.login) return undefined;
  const owner = await durable.getUserByLogin(login);
  return owner && owner.userId !== user.userId ? owner.userId : undefined;
};

// Le canvas actif de ce streamer : c'est dans ses points d'historique que le nouveau compte se compte (JOURNAL 2026-10-07).
const getDiscoveredViaCanvasId = async (
  durable: Pick<DurableStore, "getActiveCanvasForOwner">,
  discoveredViaUserId: string | undefined,
): Promise<string | undefined> =>
  discoveredViaUserId ? (await durable.getActiveCanvasForOwner(discoveredViaUserId))?.canvasId : undefined;

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
  // §10.1 : l'e-mail ne va qu'à Convex, jamais dans Redis ni dans la session.
  const { email, ...user } = signedIn;
  const discoveredViaUserId = await getDiscoveredViaUserId(deps.durable, user, returnPath);
  await deps.durable.upsertUserFromTwitch({ ...user, ...(email ? { email } : {}) }, discoveredViaUserId);
  const meta = defaultCanvasMeta(user.userId);
  const candidateCanvasId = deps.randomCanvasId();
  // Le candidat n'est retenu qu'à la première connexion : seul le `canvasId` rendu fait foi (D-14).
  const canvasId = await deps.durable.ensureCanvasForOwner(user.userId, {
    canvasId: candidateCanvasId,
    width: meta.width,
    height: meta.height,
  });
  await deps.redis.setUser(user);
  await deps.redis.createCanvas(canvasId, meta);
  // Écart §5.1 (JOURNAL 2026-10-06) : le candidat retenu, c'est un nouveau compte.
  if (canvasId === candidateCanvasId) {
    const discoveredViaCanvasId = await getDiscoveredViaCanvasId(deps.durable, discoveredViaUserId);
    await deps.redis.storeSignup({
      nowMs: deps.now(),
      ...(discoveredViaUserId ? { discoveredViaUserId } : {}),
      ...(discoveredViaCanvasId ? { discoveredViaCanvasId } : {}),
    });
  }
  const signedSession = await deps.signer.sign(user);
  deps.tracker.track(user.userId); // en arrière-plan : la connexion n'attend pas Twitch
  return { signedSession, login: user.login };
}
