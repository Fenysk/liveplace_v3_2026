// Une teinte de tokens.css en apparence sombre, lue au serveur : le manifest et l'image d'aperçu s'y accordent sans la recopier.
// Le bloc sombre d'abord, puis les jetons communs aux deux apparences (le bloc `:root` seul : le vrai blanc d'un PNG, Twitch).

import tokensCss from "./tokens.css?raw";

const DARK_BLOCK = /\[data-appearance="dark"\]\s*\{([^}]*)\}/;
const SHARED_BLOCK = /^:root\s*\{([^}]*)\}/m;

export function darkShade(name: string): string {
  const pattern = new RegExp(`(?<![\\w-])${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i");
  const shade =
    pattern.exec(DARK_BLOCK.exec(tokensCss)?.[1] ?? "")?.[1] ??
    pattern.exec(SHARED_BLOCK.exec(tokensCss)?.[1] ?? "")?.[1];
  if (!shade) throw new Error(`dark-shade: no hex ${name} in the dark appearance of tokens.css`);
  return shade;
}
