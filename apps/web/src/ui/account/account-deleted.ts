// CDC §8, Supprimer son compte : ce que l'appareil qui supprime garde de la personne, et le mot qu'il porte jusqu'à l'accueil.
// Chaque accès peut échouer, l'accès au stockage lui-même compris (fenêtre privée, stockage refusé) : un oubli manqué ne casse
// jamais la page, qui quitte les lieux quoi qu'il arrive.

// Toutes nos clés commencent ainsi : brouillons, vue, apparence, bulles d'aide, compteurs (inventaire du 2026-11-01).
const OWN_KEY_PREFIX = "liveplace:";
// Dans le stockage de l'onglet, jamais dans celui de l'appareil que l'effacement vide : il ne survit qu'au retour à l'accueil.
const NOTICE_KEY = "liveplace:account-deleted";

type DeviceStorage = Pick<Storage, "length" | "key" | "removeItem">;
type NoticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Les noms d'abord, la suppression ensuite : retirer une clé change les positions des suivantes.
export function forgetDevice(getStorage: () => DeviceStorage): void {
  try {
    const storage = getStorage();
    const names: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name?.startsWith(OWN_KEY_PREFIX)) names.push(name);
    }
    for (const name of names) storage.removeItem(name);
  } catch (error) {
    console.warn("account-deleted : l'appareil n'a pas pu tout oublier, stockage refusé", error);
  }
}

// L'accueil dit « Compte supprimé » : la page qui supprime laisse ce mot avant de partir.
export function rememberAccountDeleted(getStorage: () => NoticeStorage): void {
  try {
    getStorage().setItem(NOTICE_KEY, "1");
  } catch (error) {
    console.warn("account-deleted : mot non retenu, stockage refusé", error);
  }
}

// Une seule fois : le mot est lu puis retiré, un rechargement de l'accueil ne le redit pas.
export function takeAccountDeleted(getStorage: () => NoticeStorage): boolean {
  try {
    const storage = getStorage();
    const isNoticed = storage.getItem(NOTICE_KEY) !== null;
    if (isNoticed) storage.removeItem(NOTICE_KEY);
    return isNoticed;
  } catch (error) {
    console.warn("account-deleted : mot illisible, stockage refusé", error);
    return false;
  }
}
