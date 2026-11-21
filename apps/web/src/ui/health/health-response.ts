// `/healthz` : la réponse lue par un robot, séparée de la route pour se tester sans routeur. Un contrat machine, pas un texte d'interface.

import type { HealthAnswer } from "../../usecase/check-health";

// Le corps du 503 est fixe : l'état interne (Redis, gateway, worker) ne sort pas sur Internet, il va dans les journaux du web.
export const healthResponse = (answer: HealthAnswer): Response => {
  if (answer.status === 503) console.error("healthz : parties en échec :", answer.failed.join(","));
  return new Response(answer.status === 200 ? "ok" : "unavailable", {
    status: answer.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      // `robots.txt` interdit déjà tout sauf l'accueil ; l'en-tête le dit aussi à qui n'a pas lu `robots.txt`.
      "x-robots-tag": "noindex, nofollow",
    },
  });
};
