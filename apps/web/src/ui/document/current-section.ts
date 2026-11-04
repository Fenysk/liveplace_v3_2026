// La section courante d'un document : la dernière dont le haut a passé la ligne. Des données pures, sans React.

export type SectionTop = { id: string; top: number };

// Au-dessus de la première section (le titre, la ligne en chantier), la première reste la courante : un sommaire sans courante n'en dit rien.
// `isAtEnd` : le bas de la page est atteint. Une dernière section courte ne remonte jamais jusqu'à la ligne ; elle est alors la courante.
export const currentSectionId = (tops: readonly SectionTop[], line: number, isAtEnd: boolean): string => {
  if (isAtEnd) return tops.at(-1)?.id ?? "";
  return tops.findLast(({ top }) => top <= line)?.id ?? tops[0]?.id ?? "";
};
