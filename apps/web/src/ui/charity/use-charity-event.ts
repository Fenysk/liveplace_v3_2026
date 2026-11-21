// La section Événement, branchée sur le store (JOURNAL 2026-11-21) : le réglage s'enregistre en perdant le focus d'un champ et au clic
// de l'interrupteur ; le formulaire garde ce que le streamer a modifié jusqu'à la réponse du gateway.

import { charityEventStatusOf } from "@liveplace/domain/charity-event";
import { useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { useLocale, useTexts } from "../locale/use-locale";
import {
  type Edits,
  type Failure,
  fieldsOf,
  isSettingChanged,
  refusalOf,
  settingOf,
  statusLineOf,
  withoutSaved,
} from "./charity-form";
import type { CharitySectionProps } from "./charity-section";
import { CHARITY_TEXTS } from "./charity-texts";
import { useCharityClock } from "./use-charity-clock";

export function useCharityEvent(canvas: CanvasStore): CharitySectionProps | null {
  const { charityEvent } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const state = charityEvent?.state;
  const locale = useLocale();
  const t = useTexts(CHARITY_TEXTS);
  const toast = useToast();
  const nowMs = useCharityClock(state);
  const [edits, setEdits] = useState<Edits>({});
  const [failure, setFailure] = useState<Failure | null>(null);

  if (!charityEvent) return null;
  const isEnabled = state?.isEnabled ?? false;
  const isEventOnly = state?.isEventOnly === true;

  const save = (isEnabledNext: boolean, isEventOnlyNext: boolean) => {
    const setting = settingOf(state, edits, isEnabledNext, isEventOnlyNext);
    if (!isSettingChanged(state, setting)) return;
    const sent = edits;
    setFailure(null);
    void canvas.setCharityEvent(setting).then((result) => {
      if (!result.ok) {
        setFailure(refusalOf(result.error, locale, t));
        return;
      }
      setEdits((current) => withoutSaved(current, sent));
      toast("success", t.saved);
    });
  };

  return {
    isEnabled,
    isEventOnly,
    statusLine: statusLineOf(
      state ? charityEventStatusOf(state, nowMs) : { kind: "off" },
      nowMs,
      state?.donationCount ?? 0,
      locale,
      t,
    ),
    fields: fieldsOf(state, edits),
    failure,
    onInput: (field, value) => {
      setEdits((current) => ({ ...current, [field]: value }));
      setFailure(null);
    },
    onCommit: () => save(isEnabled, isEventOnly),
    onToggle: (isOn) => save(isOn, isEventOnly),
    onToggleEventOnly: (isOn) => save(isEnabled, isOn),
  };
}
