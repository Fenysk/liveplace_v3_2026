// Ce que l'animation d'une vignette donne au CSS : une variable par valeur, posée par le CSSOM (la CSP de production bloque un
// attribut `style` écrit par le serveur, pas celui-ci). Le HTML du serveur n'en porte aucune : le CSS a la valeur de l'image fixe.

export const setThumbnailVariable = (
  host: HTMLElement,
  name: `--lp-release-${string}`,
  value: number,
): void => {
  host.style.setProperty(name, String(value));
};
