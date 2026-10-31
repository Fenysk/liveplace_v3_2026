// Le faux stream de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : l'écran d'un PC qui montre la disposition d'une page de stream,
// en formes et en squelettes seulement : aucun chiffre, nom ni texte inventé qui passerait pour vrai, aucun logo, aucune couleur
// de marque. On reconnaît un stream sans qu'il en nomme un ; seul le téléphone devant lui montre la vraie interface, jouable.
// Décoratif pour un lecteur d'écran.

import { useLayoutEffect, useRef } from "react";
import { classNames } from "../design/class-names";
import { motionEasing, motionMs } from "../design/motion";
import type { ChatLine } from "./chat-lines";
import type { CellSwatches } from "./home-demo";
import { PixelGrid } from "./pixel-grid";

const CHANNELS = [0, 1, 2, 3, 4, 5];

// Une ligne arrive en bas : la liste monte d'autant, puis la ligne paraît (WAAPI, durées et courbe des tokens de mouvement).
const useChatRise = (lines: readonly ChatLine[]) => {
  const list = useRef<HTMLDivElement>(null);
  const newestId = useRef(lines.at(-1)?.id);
  useLayoutEffect(() => {
    const element = list.current;
    const added = element?.lastElementChild;
    const id = lines.at(-1)?.id;
    if (!element || !added || id === newestId.current) return;
    newestId.current = id;
    const duration = motionMs(element, "--lp-dur");
    if (duration === 0) return;
    const easing = motionEasing(element);
    element.animate(
      [
        { transform: `translateY(${added.getBoundingClientRect().height}px)` },
        { transform: "translateY(0)" },
      ],
      { duration, easing },
    );
    added.animate([{ opacity: 0 }, { opacity: 1 }], { duration: motionMs(element, "--lp-dur-fade"), easing });
  }, [lines]);
  return list;
};

const ChatMessage = ({ width, isLong }: Pick<ChatLine, "width" | "isLong">) => (
  <div className={classNames("lp-home-line", `lp-home-line--${width}`)}>
    <div className="lp-home-line-row">
      <i className="lp-home-bar lp-home-bar--name" />
      <i className="lp-home-bar lp-home-bar--text" />
    </div>
    {isLong && (
      <div className="lp-home-line-row">
        <i className="lp-home-bar lp-home-bar--more" />
      </div>
    )}
  </div>
);

const Chat = ({ lines }: { lines: readonly ChatLine[] }) => {
  const list = useChatRise(lines);
  return (
    <div className="lp-home-chat">
      <div className="lp-home-chat-head">
        <i className="lp-home-bar lp-home-bar--title" />
      </div>
      <div ref={list} className="lp-home-chat-list">
        {lines.map(({ id, width, isLong }) => (
          <ChatMessage key={id} width={width} isLong={isLong} />
        ))}
      </div>
      <div className="lp-home-chat-input" />
    </div>
  );
};

type FakeStreamProps = { streamed: CellSwatches; chat: readonly ChatLine[] };

export const FakeStream = ({ streamed, chat }: FakeStreamProps) => (
  <div className="lp-home-monitor" aria-hidden="true">
    <div className="lp-home-bezel">
      <div className="lp-home-stream">
        <div className="lp-home-top">
          <i className="lp-home-dot" />
          <i className="lp-home-bar lp-home-bar--nav" />
          <i className="lp-home-bar lp-home-bar--nav" />
          <i className="lp-home-bar lp-home-bar--search" />
          <i className="lp-home-dot" />
        </div>
        <div className="lp-home-channels">
          {CHANNELS.map((channel) => (
            <i key={channel} className="lp-home-dot" />
          ))}
        </div>
        <div className="lp-home-main">
          <div className="lp-home-player">
            <i className="lp-home-person">
              <i className="lp-home-person-head" />
              <i className="lp-home-person-shoulders" />
            </i>
            <PixelGrid name="stream" cells={streamed} />
          </div>
          <div className="lp-home-channel-row">
            <i className="lp-home-dot lp-home-dot--channel" />
            <div className="lp-home-channel-text">
              <i className="lp-home-bar lp-home-bar--title" />
              <i className="lp-home-bar lp-home-bar--subtitle" />
            </div>
            <i className="lp-home-bar lp-home-bar--button" />
            <i className="lp-home-bar lp-home-bar--button" />
          </div>
        </div>
        <Chat lines={chat} />
      </div>
    </div>
    <div className="lp-home-stand" />
  </div>
);
