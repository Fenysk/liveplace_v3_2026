// La scène de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : un écran qui montre un faux stream, et devant lui un téléphone qui
// montre la vraie interface mobile. Chaque pixel envoyé s'envole de sa case sur le téléphone à SA case sur le stream. La démo
// joue seule jusqu'au premier geste du visiteur. Tout reste dans la page : aucune connexion, aucune requête.

import { useCallback, useEffect, useRef } from "react";
import { FakeStream } from "./fake-stream";
import type { LaunchedPixel } from "./home-demo";
import { motionPlan } from "./home-script";
import { PhoneChrome } from "./phone-chrome";
import { PhoneScreen } from "./phone-screen";
import { createSceneEffects, type SceneEffects, stepTarget } from "./scene-effects";
import { useAutoplay } from "./use-autoplay";
import { useChatLines } from "./use-chat-lines";
import { useHomeDemo } from "./use-home-demo";
import { useIsMounted, useIsPageVisible } from "./use-page-state";

// Les effets de la scène, créés avec elle et défaits avec elle : un vol en cours ne survit pas à la page.
const useSceneEffects = () => {
  const scene = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const effects = useRef<SceneEffects | null>(null);
  useEffect(() => {
    const sceneElement = scene.current;
    const layerElement = layer.current;
    if (!sceneElement || !layerElement) return;
    effects.current = createSceneEffects(sceneElement, layerElement);
    return () => {
      effects.current?.clear();
      effects.current = null;
    };
  }, []);
  return { scene, layer, effects };
};

export const HomeScene = ({ isMotionReduced }: { isMotionReduced: boolean }) => {
  const isMounted = useIsMounted();
  const isPageVisible = useIsPageVisible();
  const plan = motionPlan(isMotionReduced);
  const { state, actions } = useHomeDemo();
  const { scene, layer, effects } = useSceneEffects();
  const chat = useChatLines(plan.autoplays && isPageVisible);

  // Les pixels envoyés volent jusqu'à leur case ; sans mouvement, ils y sont déjà.
  const launch = useCallback(
    (launched: readonly LaunchedPixel[]) => {
      if (plan.flies && effects.current) effects.current.fly(launched, actions.land);
      else for (const pixel of launched) actions.land(pixel);
    },
    [plan.flies, effects, actions],
  );

  useAutoplay({
    isEnabled: plan.autoplays && isMounted && !state.hasVisitorActed,
    read: actions.read,
    show: (step) => {
      const target = scene.current && stepTarget(scene.current, step);
      if (target) effects.current?.wave(target);
    },
    perform: (step) => launch(actions.play(step)),
  });

  return (
    <div ref={scene} className="lp-home-scene">
      <FakeStream streamed={state.streamed} chat={chat} />
      <div className="lp-home-phone">
        <div className="lp-home-screen">
          <PhoneChrome />
          {isMounted && (
            <PhoneScreen
              state={state}
              onTouch={actions.visitorTouch}
              onPick={actions.visitorPick}
              onSend={() => launch(actions.visitorSend())}
            />
          )}
        </div>
      </div>
      <div ref={layer} className="lp-home-effects" aria-hidden="true" />
    </div>
  );
};
