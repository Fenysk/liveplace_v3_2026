// Le thème du canvas en cours dans la section Canvas (Écart §8.1, JOURNAL 2026-10-07) : lu à l'ouverture, enregistré quand le
// champ perd le focus. Sans bouton : rien n'est appelé tant que le thème nettoyé est celui qui est déjà enregistré.

import { useCallback, useEffect, useState } from "react";
import { listCanvasesFn, setCanvasThemeFn } from "../../routes/-owner-canvases";
import { ARCHIVE_TEXTS } from "../archive/archive-texts";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import type { ThemeField } from "./canvas-settings";
import { toThemeToSave } from "./canvas-theme";

// `unavailable` : la liste ne se lit pas, ou il n'y a pas de canvas en cours. `ready` garde le canvas visé et son thème
// enregistré : le champ revient à ce thème après un échec.
type Loaded =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; canvasId: string; saved: string };

export function useThemeField(): ThemeField {
  const toast = useToast();
  const t = useTexts(ARCHIVE_TEXTS);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(() => {
    listCanvasesFn().then(
      (result) => {
        const active = result.ok ? result.value.active : null;
        if (!active) {
          setLoaded({ status: "unavailable" });
          return;
        }
        const saved = active.theme ?? "";
        setLoaded({ status: "ready", canvasId: active.canvasId, saved });
        setValue(saved);
      },
      (error: unknown) => {
        console.error("thème du canvas : lecture impossible", error);
        setLoaded({ status: "unavailable" });
      },
    );
  }, []);
  useEffect(load, [load]);

  const commit = async () => {
    if (loaded.status !== "ready" || isSaving) return;
    const { canvasId, saved } = loaded;
    const theme = toThemeToSave(value, saved);
    if (theme === null) {
      setValue(saved);
      return;
    }
    setIsSaving(true);
    try {
      const result = await setCanvasThemeFn({ data: { canvasId, theme } });
      if (result.ok) {
        setLoaded({ status: "ready", canvasId, saved: theme });
        setValue(theme);
        toast("success", t.themeSaved);
        return;
      }
      setValue(saved);
      toast("error", t.themeFailure(result.error));
      // Le canvas en cours a changé depuis l'ouverture : son thème, et celui qu'on vise, sont à relire.
      if (result.error === "not_active") load();
    } catch (error) {
      console.error("thème du canvas : enregistrement sans réponse", error);
      setValue(saved);
      toast("error", t.themeFailure("network"));
    } finally {
      setIsSaving(false);
    }
  };

  return {
    status: loaded.status,
    value,
    isSaving,
    onInput: setValue,
    onCommit: () => void commit(),
  };
}
