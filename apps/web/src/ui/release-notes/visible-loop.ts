// Une boucle d'animation qui ne tourne que tant que son élément est à l'écran : une fenêtre fermée, une page défilée plus bas
// ou un onglet caché ne dépensent aucune image. L'environnement est injecté pour se tester sans navigateur.

export type LoopEnvironment = {
  observe(element: Element, onVisible: (isVisible: boolean) => void): () => void;
  schedule(callback: (timeMs: number) => void): number;
  cancel(scheduled: number): void;
};

export const browserLoopEnvironment: LoopEnvironment = {
  observe(element, onVisible) {
    const observer = new IntersectionObserver((entries) => {
      const latest = entries.at(-1);
      if (latest) onVisible(latest.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  },
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (scheduled) => cancelAnimationFrame(scheduled),
};

// Rend la fonction qui arrête tout : l'écoute de l'élément et l'image en attente.
export const startVisibleLoop = (
  element: Element,
  render: (timeMs: number) => void,
  environment: LoopEnvironment = browserLoopEnvironment,
): (() => void) => {
  let scheduled: number | undefined;
  const step = (timeMs: number) => {
    render(timeMs);
    scheduled = environment.schedule(step);
  };
  const stopFrames = () => {
    if (scheduled !== undefined) environment.cancel(scheduled);
    scheduled = undefined;
  };
  const stopObserving = environment.observe(element, (isVisible) => {
    stopFrames();
    if (isVisible) scheduled = environment.schedule(step);
  });
  return () => {
    stopObserving();
    stopFrames();
  };
};
