// Le nom du canvas en cours dans la section Canvas (Écart §15, JOURNAL 2026-10-06) : lu à l'ouverture, enregistré quand le
// champ perd le focus. Sans bouton : rien n'est appelé tant que le nom nettoyé est celui qui est déjà enregistré.

import { useCallback, useEffect, useState } from "react";
import { listCanvasesFn, renameCanvasFn } from "../../routes/-owner-canvases";
import { ARCHIVE_TEXTS } from "../archive/archive-texts";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import { toNameToSave } from "./canvas-name";
import type { CanvasNameField } from "./canvas-settings";

// `unavailable` : la liste ne se lit pas, ou il n'y a pas de canvas en cours. `ready` garde le canvas visé et son nom
// enregistré : le champ revient à ce nom après un échec.
type Loaded =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; canvasId: string; saved: string };

export function useCanvasName(): CanvasNameField {
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
        const saved = active.name ?? "";
        setLoaded({ status: "ready", canvasId: active.canvasId, saved });
        setValue(saved);
      },
      (error: unknown) => {
        console.error("nom du canvas : lecture impossible", error);
        setLoaded({ status: "unavailable" });
      },
    );
  }, []);
  useEffect(load, [load]);

  const commit = async () => {
    if (loaded.status !== "ready" || isSaving) return;
    const { canvasId, saved } = loaded;
    const name = toNameToSave(value, saved);
    if (name === null) {
      setValue(saved);
      return;
    }
    setIsSaving(true);
    try {
      const result = await renameCanvasFn({ data: { canvasId, name } });
      if (result.ok) {
        setLoaded({ status: "ready", canvasId, saved: name });
        setValue(name);
        toast("success", t.nameSaved);
        return;
      }
      setValue(saved);
      toast("error", t.renameFailure(result.error));
      // Le canvas en cours a changé depuis l'ouverture : son nom, et celui qu'on vise, sont à relire.
      if (result.error === "not_active") load();
    } catch (error) {
      console.error("nom du canvas : enregistrement sans réponse", error);
      setValue(saved);
      toast("error", t.renameFailure("network"));
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
