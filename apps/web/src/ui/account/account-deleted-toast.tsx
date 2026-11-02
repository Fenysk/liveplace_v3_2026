// CDC §8, Toasts : « Compte supprimé », à l'accueil où la page revient après l'effacement. Le mot vient de la page qui a supprimé
// (`rememberAccountDeleted`) : l'adresse reste propre, et un rechargement de l'accueil ne le redit pas.

import { useEffect } from "react";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import { takeAccountDeleted } from "./account-deleted";
import { DELETE_ACCOUNT_TEXTS } from "./delete-account-texts";

export const AccountDeletedToast = () => {
  const toast = useToast();
  const t = useTexts(DELETE_ACCOUNT_TEXTS);
  useEffect(() => {
    if (takeAccountDeleted(() => window.sessionStorage)) toast("success", t.deleted);
  }, [toast, t]);
  return null;
};
