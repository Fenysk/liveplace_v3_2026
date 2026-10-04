// `/ads.txt` : la réponse de la route, séparée d'elle pour se tester sans routeur.

import { ADS_TXT_BODY } from "./adsense";

export const adsTxtResponse = (): Response =>
  new Response(ADS_TXT_BODY, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
