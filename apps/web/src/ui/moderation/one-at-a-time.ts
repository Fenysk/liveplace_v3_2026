// Relire une liste à chaque demande (JOURNAL 2026-10-06) : une lecture à la fois, et une seule de plus pour tout ce qui
// a été demandé pendant. Une synchro Twitch périme la liste des centaines de fois en quelques secondes.
export const oneAtATime = (read: () => Promise<void>): (() => void) => {
  let isReading = false;
  let isAskedAgain = false;
  const ask = (): void => {
    if (isReading) {
      isAskedAgain = true;
      return;
    }
    isReading = true;
    void read().finally(() => {
      isReading = false;
      if (!isAskedAgain) return;
      isAskedAgain = false;
      ask();
    });
  };
  return ask;
};
