#!/bin/sh
# La liste des oublis du suivi, lue au début de chaque session (voir CLAUDE.md).
#   sh tools/suivi.sh
# Sort toujours en 0 : c'est une liste, pas un gate.

vault="${LIVEPLACE_VAULT:-$HOME/Leviia/Obsidian MacOS}/LivePlace"
depuis="${SUIVI_DEPUIS:-2026-11-02}"

if [ ! -d "$vault" ]; then
  echo "Vault introuvable : $vault"
  exit 0
fi

# Hors ligne, on lit le dernier origin/main connu.
git fetch -q origin 2>/dev/null || true

# Sous Windows, git et les notes peuvent écrire des CRLF : chaque \r est retiré avant toute comparaison.
controles() {
  # 1. Un commit de main dont le hash court n'est cité dans aucun journal. Sans « 00:00 », git prend l'heure courante et saute le début de la journée.
  git log origin/main --since="$depuis 00:00" --format='%H %s' | tr -d '\r' | while read -r complet sujet; do
    court=$(printf '%.7s' "$complet")
    grep -rqF "$court" "$vault/Journal" 2>/dev/null && continue
    # LC_ALL force la coupe au caractère : à l'octet, elle trancherait un « É » en deux.
    sujet=$(printf '%s' "$sujet" | LC_ALL=C.UTF-8 sed 's/^\(.\{80\}\).*/\1/; s/ *$//')
    echo "Journal : $court absent — $sujet"
  done

  # 2. Une branche locale sans plan : une ligne `branche: <nom>` dans Chantiers/ (les worktree-… du harnais n'en ont pas).
  plans=$(find "$vault/Chantiers" -type f -name '*.md' -exec cat {} + 2>/dev/null | tr -d '\r')
  git for-each-ref --format='%(refname:short)' refs/heads | tr -d '\r' | while read -r branche; do
    case "$branche" in main | worktree-*) continue ;; esac
    printf '%s\n' "$plans" | grep -qxF "branche: $branche" || echo "Chantier : $branche n'a pas de plan"
  done

  # 3. Un worktree avec des changements non commités.
  git worktree list --porcelain | tr -d '\r' | {
    chemin=
    branche=
    while read -r cle valeur; do
      case "$cle" in
        worktree) chemin=$valeur; branche='(détaché)' ;;
        branch) branche=${valeur#refs/heads/} ;;
        '') signaler_non_commite; chemin= ;;
      esac
    done
    signaler_non_commite
  }
}

# Lit `chemin` et `branche` du bloc porcelain en cours ; un bloc sans chemin est déjà traité.
signaler_non_commite() {
  [ -n "$chemin" ] || return 0
  nombre=$(git -C "$chemin" status --porcelain 2>/dev/null | tr -d '\r' | grep -c .)
  [ "$nombre" -eq 0 ] || echo "Non commité : $branche ($nombre fichiers)"
}

oublis=$(controles)
if [ -n "$oublis" ]; then
  printf '%s\n' "$oublis"
else
  echo "Suivi à jour"
fi
exit 0
