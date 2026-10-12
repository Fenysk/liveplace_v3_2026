// Où poser une bulle qui vise un élément (Écart §8.1, JOURNAL 2026-10-08) : au-dessus de lui, centrée sur lui, gardée dans l'écran.
// La hauteur de la bulle comprend la place de sa flèche. Sans DOM : bubble.tsx mesure, et applique le résultat.

export type TargetRect = { left: number; top: number; width: number; height: number };
export type BubbleSize = { width: number; height: number };

// `left` et `top` : le coin de la bulle ; `arrowX` : le centre de la flèche, depuis le bord gauche de la bulle.
export type BubblePosition = { left: number; top: number; arrowX: number };

export function positionBubble(
  target: TargetRect,
  bubble: BubbleSize,
  screen: BubbleSize,
  margin: number,
): BubblePosition {
  const targetCenter = target.left + target.width / 2;
  // Trop large pour l'écran, elle reste collée à la marge gauche plutôt que de sortir par la gauche.
  const left = Math.max(
    margin,
    Math.min(targetCenter - bubble.width / 2, screen.width - margin - bubble.width),
  );
  const top = Math.max(margin, target.top - bubble.height);
  return { left, top, arrowX: targetCenter - left };
}

// Écart §8.1 (JOURNAL 2026-10-08) : une bulle d'aide vise un bouton d'une pill, sans la couvrir. Elle se pose contre la pill
// (`anchor`) qui le porte, du côté où elle tient dans l'écran : au-dessus d'abord, puis dessous (les pills du haut), puis à
// gauche, puis à droite (une barre du bas en colonne). La flèche vise le centre de la cible, même dans une pill plus haute.
export type BubbleSide = "above" | "below" | "left" | "right";

// `left` et `top` : le coin de la bulle, sa flèche comprise ; `arrow` : le centre de la flèche, depuis le bord de la bulle
// qu'elle longe (le gauche pour dessus et dessous, le haut pour gauche et droite).
export type BubblePlacement = { side: BubbleSide; left: number; top: number; arrow: number };

const SIDES: readonly BubbleSide[] = ["above", "below", "left", "right"];

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(value, high));

const isBeside = (side: BubbleSide): boolean => side === "left" || side === "right";

// La bulle avec sa flèche, du côté où elle se pose : plus haute dessus et dessous, plus large à gauche et à droite.
type WithArrow = { vertical: BubbleSize; horizontal: BubbleSize };

const withArrow = (pill: BubbleSize, arrowSpace: number): WithArrow => ({
  vertical: { width: pill.width, height: pill.height + arrowSpace },
  horizontal: { width: pill.width + arrowSpace, height: pill.height },
});

// La place libre de chaque côté de `anchor`, la bulle et sa flèche retranchées : négative, elle n'y tient pas.
const roomAround = (
  anchor: TargetRect,
  { vertical, horizontal }: WithArrow,
  screen: BubbleSize,
  margin: number,
): Record<BubbleSide, number> => ({
  above: anchor.top - margin - vertical.height,
  below: screen.height - margin - (anchor.top + anchor.height) - vertical.height,
  left: anchor.left - margin - horizontal.width,
  right: screen.width - margin - (anchor.left + anchor.width) - horizontal.width,
});

// `pill` : la surface de la bulle, sans sa flèche ; `arrowSpace` : ce que la flèche prend, du côté de la cible ; `sides` : les
// seuls côtés essayés, dans l'ordre (Écart §8.1, JOURNAL 2026-10-09 : une rangée d'onglets se vise de dessous, une colonne de côté).
export function placeBubble(
  target: TargetRect,
  anchor: TargetRect,
  pill: BubbleSize,
  screen: BubbleSize,
  margin: number,
  arrowSpace: number,
  sides: readonly BubbleSide[] = SIDES,
): BubblePlacement {
  const boxes = withArrow(pill, arrowSpace);
  const { vertical, horizontal } = boxes;
  const anchorBottom = anchor.top + anchor.height;
  const anchorRight = anchor.left + anchor.width;
  const room = roomAround(anchor, boxes, screen, margin);
  // Aucun côté ne tient : celui qui déborde le moins.
  const side =
    sides.find((candidate) => room[candidate] >= 0) ??
    sides.reduce((best, candidate) => (room[candidate] > room[best] ? candidate : best));
  if (side === "left" || side === "right") {
    const centerY = target.top + target.height / 2;
    const top = clamp(centerY - horizontal.height / 2, margin, screen.height - margin - horizontal.height);
    return {
      side,
      left: side === "left" ? anchor.left - horizontal.width : anchorRight,
      top,
      arrow: centerY - top,
    };
  }
  // Un `DOMRect` ne se déplie pas (ses mesures sont des accesseurs) : les mesures s'écrivent une à une.
  const aboveTarget = { left: target.left, top: anchor.top, width: target.width, height: target.height };
  const above = positionBubble(aboveTarget, vertical, screen, margin);
  const top =
    side === "above" ? above.top : clamp(anchorBottom, margin, screen.height - margin - vertical.height);
  return { side, left: above.left, top, arrow: above.arrowX };
}

// Écart §8.1 (JOURNAL 2026-10-12) : aucun côté ne tient à la largeur du texte (un téléphone couché étroit, un pliable) : au lieu
// de couvrir la pill, la bulle se resserre à la place que laisse un côté, et son texte passe à la ligne. `undefined` : un côté tient
// (les côtés essayés, comme pour `placeBubble`), ou la place est trop étroite pour y lire.
export const MIN_SQUEEZED_WIDTH = 200;

export function squeezedWidth(
  anchor: TargetRect,
  pill: BubbleSize,
  screen: BubbleSize,
  margin: number,
  arrowSpace: number,
  sides: readonly BubbleSide[] = SIDES,
): number | undefined {
  const room = roomAround(anchor, withArrow(pill, arrowSpace), screen, margin);
  if (sides.some((side) => room[side] >= 0)) return undefined;
  const widest = Math.max(...sides.filter(isBeside).map((side) => pill.width + room[side]));
  return widest >= MIN_SQUEEZED_WIDTH ? widest : undefined;
}

// Écart §8.1 (JOURNAL 2026-10-09) : dans une fenêtre dont le corps défile, la cible peut passer sous un bord. Elle reste à la vue
// tant que son centre est dans chaque cadre qui la rogne (le corps, la rangée d'onglets, la fenêtre) ; sinon la bulle s'efface.
export function isInsideClips(target: TargetRect, clips: readonly TargetRect[]): boolean {
  const x = target.left + target.width / 2;
  const y = target.top + target.height / 2;
  return clips.every(
    (clip) => x >= clip.left && x <= clip.left + clip.width && y >= clip.top && y <= clip.top + clip.height,
  );
}
