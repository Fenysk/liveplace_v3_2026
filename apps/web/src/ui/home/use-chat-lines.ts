// Le tchat du faux stream qui avance : une ligne arrive en bas, à un rythme irrégulier, tant que `isRunning`.

import { useEffect, useState } from "react";
import { CHAT_CAPACITY, type ChatLine, chatDelayMs, initialChat, pushChatLine } from "./chat-lines";

type Chat = { lines: readonly ChatLine[]; nextId: number };

export const useChatLines = (isRunning: boolean): readonly ChatLine[] => {
  const [chat, setChat] = useState<Chat>(() => ({ lines: initialChat(), nextId: CHAT_CAPACITY }));
  useEffect(() => {
    if (!isRunning) return;
    const timer = setTimeout(
      () => setChat(({ lines, nextId }) => ({ lines: pushChatLine(lines, nextId), nextId: nextId + 1 })),
      chatDelayMs(chat.nextId),
    );
    return () => clearTimeout(timer);
  }, [isRunning, chat.nextId]);
  return chat.lines;
};
