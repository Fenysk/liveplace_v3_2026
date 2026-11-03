import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { SupportButton, SupportWindow, useSupportWindow } from "./support";
import { SmallWindow } from "./window";

// CDC 2026, Soutenir LivePlace : le bouton ouvre la fenêtre à chaque clic, et Fermer comme Faire un don la referment. Le rendu du
// serveur ne rejoue aucun clic : ici les composants s'appellent à la main, l'état booléen de la fenêtre se pilote par un faux
// `useState` (la langue est le français, sans `LocaleProvider`), et les boutons se pressent dans l'arbre d'éléments qu'ils rendent.
const state = vi.hoisted(() => ({ isOpen: false }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [
    typeof initial === "boolean" ? state.isOpen : initial,
    (next: boolean) => {
      state.isOpen = next;
    },
  ],
  useContext: () => ({ locale: "fr", pick: () => undefined }),
}));

type Props = Record<string, unknown>;

// Tous les éléments d'un arbre, en descendant dans les enfants et dans les props qui portent des éléments (`actions`).
const elementsIn = (node: unknown): ReactElement<Props>[] => {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(elementsIn)];
};

const isElementOf =
  <P extends Props>(type: (props: P) => ReactNode) =>
  (element: ReactElement<Props>): element is ReactElement<P> =>
    element.type === type;

// Les props de chaque élément de ce composant dans l'arbre.
const propsOf = <P extends Props>(type: (props: P) => ReactNode, node: unknown): P[] =>
  elementsIn(node)
    .filter(isElementOf(type))
    .map((element) => element.props);

// Ce que la page rend : le bouton, qui ne sait qu'ouvrir, et la fenêtre que `useSupportWindow` lui donne ; puis ce que la fenêtre
// rend : la petite fenêtre et ses boutons.
const show = (hasLabel = true) => {
  const support = useSupportWindow();
  const root = SupportButton({ hasLabel, onOpen: support.open });
  const opener = propsOf(Button, root)[0];
  const window = propsOf(SupportWindow, support.supportWindow)[0];
  if (!opener || !window) throw new Error("la page rend un bouton Soutenir et sa fenêtre");
  const content = SupportWindow(window);
  const dialog = propsOf(SmallWindow, content)[0];
  if (!dialog) throw new Error("la fenêtre Soutenir rend une petite fenêtre");
  return { root, opener, window, dialog, actions: propsOf(Button, content) };
};

beforeEach(() => {
  state.isOpen = false;
});

describe("l'ouverture de la fenêtre Soutenir LivePlace (CDC 2026, Soutenir LivePlace)", () => {
  // Fermée au départ, pour tous : le bouton n'a ni adresse ni onglet, il ne fait qu'ouvrir
  it("starts closed, and its button carries no address: it only opens", () => {
    const { root, opener, window, dialog } = show();

    expect(propsOf(SupportWindow, root)).toEqual([]);
    expect(window.isOpen).toBe(false);
    expect(dialog.isOpen).toBe(false);
    expect(dialog.title).toBe("Soutenir LivePlace");
    expect(opener.label).toBe("Soutenir LivePlace");
    expect(opener.href).toBeUndefined();
    expect(opener.isNewTab).toBeUndefined();
    expect(opener.onPress).toBeTypeOf("function");
  });

  // Le cœur seul de l'accueil, sur un téléphone, ouvre la même fenêtre
  it("opens from the heart alone too, named by its title", () => {
    const { opener } = show(false);

    expect(opener.label).toBeUndefined();
    expect(opener.title).toBe("Soutenir LivePlace");
    opener.onPress?.();

    expect(show(false).window.isOpen).toBe(true);
    expect(show(false).dialog.isOpen).toBe(true);
  });

  // L'accueil a deux boutons (le texte, le cœur seul), dont le CSS en cache un : une seule fenêtre, ouverte par l'un comme par l'autre
  it("opens the one window of a page from either of its two buttons", () => {
    const support = useSupportWindow();
    const [label, icon] = [
      propsOf(Button, SupportButton({ onOpen: support.open }))[0],
      propsOf(Button, SupportButton({ hasLabel: false, onOpen: support.open }))[0],
    ];
    const windows = () => propsOf(SupportWindow, useSupportWindow().supportWindow);

    expect(windows()).toHaveLength(1);
    expect(windows()[0]?.isOpen).toBe(false);
    icon?.onPress?.();
    expect(windows()[0]?.isOpen).toBe(true);

    windows()[0]?.onClose();
    expect(windows()[0]?.isOpen).toBe(false);
    label?.onPress?.();
    expect(windows()[0]?.isOpen).toBe(true);
  });

  // À chaque clic : la fermer puis la rouvrir la montre de nouveau
  it("opens on a press, and opens again on the next one after it was closed", () => {
    show().opener.onPress?.();
    const opened = show();

    expect(opened.window.isOpen).toBe(true);

    opened.window.onClose();
    expect(show().window.isOpen).toBe(false);

    show().opener.onPress?.();
    expect(show().window.isOpen).toBe(true);
  });

  // Fermer ferme la fenêtre
  it("closes when Close is pressed", () => {
    show().opener.onPress?.();
    const close = show().actions.find(({ label }) => label === "Fermer");

    expect(close?.href).toBeUndefined();
    close?.onPress?.();

    expect(show().window.isOpen).toBe(false);
  });

  // Faire un don est le lien vers Ko-fi, dans un nouvel onglet ; le clic ferme aussi la fenêtre
  it("closes when Donate is pressed, the link to Ko-fi in a new tab leaving all the same", () => {
    show().opener.onPress?.();
    const donate = show().actions.find(({ label }) => label === "Faire un don");

    expect(donate?.href).toBe("https://ko-fi.com/fenysk");
    expect(donate?.isNewTab).toBe(true);
    donate?.onPress?.();

    expect(show().window.isOpen).toBe(false);
  });
});
