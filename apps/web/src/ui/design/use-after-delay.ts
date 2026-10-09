// Vrai `delayMs` après que `isOn` l'est devenu, faux dès qu'il cesse de l'être.

import { useEffect, useState } from "react";

export const useAfterDelay = (isOn: boolean, delayMs: number): boolean => {
  const [isElapsed, setIsElapsed] = useState(false);
  useEffect(() => {
    if (!isOn) {
      setIsElapsed(false);
      return;
    }
    const timer = setTimeout(() => setIsElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [isOn, delayMs]);
  return isElapsed;
};
