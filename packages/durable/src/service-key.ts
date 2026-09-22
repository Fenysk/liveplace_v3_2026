// La garde des fonctions Convex (§8.2) : chacune exige la clé du service, comparée à `SERVICE_KEY`.

// Défaut fermé (règle 4) : sans clé posée dans le déploiement, rien ne passe.
export function isServiceKeyValid(expected: string | undefined, provided: string): boolean {
  if (!expected || provided.length !== expected.length) return false;
  let difference = 0;
  // Tous les caractères sont comparés : la durée ne dit pas où la clé diverge.
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return difference === 0;
}

// En tête de chaque fonction Convex, avant toute lecture.
export function requireServiceKey(provided: string): void {
  if (!isServiceKeyValid(process.env.SERVICE_KEY, provided)) throw new Error("serviceKey refusée");
}
