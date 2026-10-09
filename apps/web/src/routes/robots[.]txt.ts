// `/robots.txt` : ce que les moteurs de recherche peuvent lire.

import { createFileRoute } from "@tanstack/react-router";
import { robotsTxtResponse } from "../ui/robots/robots-txt";

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: robotsTxtResponse } },
});
