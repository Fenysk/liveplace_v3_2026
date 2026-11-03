// La section Badges branchée sur Convex (JOURNAL 2026-11-03), par les fonctions serveur du développeur : elle se lit à chaque
// ouverture de la fenêtre, et se relit après chaque lien. Montée pour le seul développeur, tant que Badges est la section ouverte.

import { useCallback, useEffect, useState } from "react";
import { getBadgesReportFn, linkDonationFn } from "../../routes/-badges";
import type { LinkFailure } from "./badges-labels";
import { BadgesSection, type BadgesView } from "./badges-section";

// Ce qui s'est passé hors d'un refus de Convex (session perdue, panne) : la ligne dit de réessayer.
const toFailure = (error: string): LinkFailure =>
  error === "unknown_account" || error === "already_linked" || error === "unknown_donation"
    ? error
    : "failed";

export const LiveBadgesSection = ({ isOpen }: { isOpen: boolean }) => {
  const [view, setView] = useState<BadgesView>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const result = await getBadgesReportFn();
      setView(result.ok ? { status: "ready", report: result.value } : { status: "failed" });
    } catch (error) {
      console.error("badges : rapport non lu", error);
      setView({ status: "failed" });
    }
  }, []);
  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);
  const link = async (donationId: string, login: string): Promise<LinkFailure | null> => {
    try {
      const result = await linkDonationFn({ data: { donationId, login } });
      if (result.ok) {
        await load();
        return null;
      }
      // Un don plus là ou déjà relié : la liste n'était plus à jour, elle se relit derrière la ligne.
      if (result.error === "unknown_donation" || result.error === "already_linked") await load();
      return toFailure(result.error);
    } catch (error) {
      console.error("badges : don non relié", error);
      return "failed";
    }
  };
  return <BadgesSection view={view} onLink={link} />;
};
