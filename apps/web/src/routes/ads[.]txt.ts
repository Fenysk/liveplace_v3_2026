// `/ads.txt` : vendeurs autorisés pour AdSense.

import { createFileRoute } from "@tanstack/react-router";
import { adsTxtResponse } from "../ui/ads/ads-txt";

export const Route = createFileRoute("/ads.txt")({
  server: { handlers: { GET: adsTxtResponse } },
});
