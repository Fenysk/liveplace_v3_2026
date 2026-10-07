// L'entrée affichée sur /design : elle vit dans l'adresse (`/design#dessin`), et son chapitre reste ouvert dans le sommaire.

import { useEffect, useState } from "react";
import {
  DEFAULT_ENTRY_SLUG,
  type DesignChapterId,
  type DesignEntry,
  type EntrySlug,
  toEntry,
} from "./design-entries";

type ShownEntry = DesignEntry<EntrySlug>;

export const useDesignEntry = () => {
  const [entry, setEntry] = useState<ShownEntry>(() => toEntry(DEFAULT_ENTRY_SLUG));
  const [openChapterIds, setOpenChapterIds] = useState<ReadonlySet<DesignChapterId>>(
    () => new Set([entry.chapterId]),
  );

  // Le serveur ne voit pas le hash : on le lit après le montage, et quand on le retape dans la barre d'adresse.
  useEffect(() => {
    const showHash = () => {
      const next = toEntry(window.location.hash);
      setEntry(next);
      setOpenChapterIds(new Set([next.chapterId]));
    };
    showHash();
    window.addEventListener("hashchange", showHash);
    return () => window.removeEventListener("hashchange", showHash);
  }, []);

  const showEntry = (next: ShownEntry) => {
    window.history.replaceState(null, "", `#${next.slug}`);
    setEntry(next);
    setOpenChapterIds((ids) => new Set(ids).add(next.chapterId));
    window.scrollTo({ top: 0 });
  };

  const toggleChapter = (id: DesignChapterId) =>
    setOpenChapterIds((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return { entry, openChapterIds, showEntry, toggleChapter };
};
