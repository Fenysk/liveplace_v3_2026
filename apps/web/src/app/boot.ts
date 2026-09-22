// Plugin Nitro, exécuté une fois au démarrage : une variable manquante arrête le process en la nommant (§10.2).
// Sans lui, Nitro ne charge l'application qu'à la première requête, et chaque requête rendrait 500.

import { definePlugin } from "nitro";
import { parseWebConfig } from "./config";

export default definePlugin(() => {
  parseWebConfig(process.env);
});
