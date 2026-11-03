// `/healthz` : la réponse lue par un robot, séparée de la route pour se tester sans routeur. Un contrat machine, pas un texte d'interface.

import type { HealthAnswer } from "../../usecase/check-health";

export const healthResponse = (answer: HealthAnswer): Response =>
  new Response(answer.status === 200 ? "ok" : answer.failed.join(","), {
    status: answer.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      // `robots.txt` interdit déjà tout sauf l'accueil ; l'en-tête le dit aussi à qui n'a pas lu `robots.txt`.
      "x-robots-tag": "noindex, nofollow",
    },
  });
