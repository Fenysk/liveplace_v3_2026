// Audit de sécurité n°10 (JOURNAL 2026-11-21) : une fonction serveur `POST` qui agit sous la session du cookie n'obéit qu'à notre page.
// `SameSite=Lax` n'écarte pas une autre origine du même site (une bêta) ; `Origin`, que le navigateur pose sur tout `POST`, le fait,
// comme pour `/auth/delete-account`. Le tiret en tête du nom : le routeur ignore ce fichier.

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isFromOurPage } from "../shared/same-origin";

// Le contexte de la requête (les `deps` posées par `app/start.ts`) est bien là à l'exécution, mais Start ne le type pas dans un
// middleware de fonction : on le vérifie plutôt que de le supposer. Sans adresse du site, la requête est refusée.
const publicUrlOf = (context: unknown): string | null => {
  if (typeof context !== "object" || context === null || !("deps" in context)) return null;
  const { deps } = context;
  if (typeof deps !== "object" || deps === null || !("publicUrl" in deps)) return null;
  return typeof deps.publicUrl === "string" ? deps.publicUrl : null;
};

export const isFromOurPageCall = (request: Request, context: unknown): boolean => {
  const publicUrl = publicUrlOf(context);
  return publicUrl !== null && isFromOurPage(request, publicUrl);
};

export const fromOurPageMiddleware = createMiddleware({ type: "function" }).server(({ next, context }) => {
  if (!isFromOurPageCall(getRequest(), context)) {
    // Une `Response` lancée est rendue telle quelle par Start.
    throw new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return next();
});
