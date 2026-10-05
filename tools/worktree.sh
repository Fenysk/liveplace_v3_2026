#!/bin/sh
# Écart §11.7 (JOURNAL 2026-10-05) : un chantier = une branche = un worktree. Se lance depuis le dossier principal, resté sur `main`.
#
#   sh tools/worktree.sh add feat/adsense     .claude/worktrees/feat-adsense, branche existante ou neuve (partie de origin/main)
#   sh tools/worktree.sh status               les worktrees et les branches, et celles déjà sur main
#   sh tools/worktree.sh remove feat/adsense  le worktree et la branche, ici et sur GitHub, une fois sur main
set -e

root=$(git rev-parse --show-toplevel)
# Le préfixe reste dans le nom du dossier : feat/x et fix/x n'ont jamais le même worktree.
dir_of() { echo "$root/.claude/worktrees/$(echo "$1" | tr / -)"; }

# Vrai si les changements de la branche sont déjà sur origin/main : la fusion squash en a fait un commit au contenu identique.
is_on_main() {
  base=$(git merge-base origin/main "$1")
  want=$(git diff "$base" "$1" | git patch-id --stable | cut -d' ' -f1)
  [ -z "$want" ] && return 0
  git log -p --format='commit %H' "$base..origin/main" | git patch-id --stable | cut -d' ' -f1 | grep -qx "$want"
}

case "$1" in
add)
  branch="$2"
  case "$branch" in feat/* | fix/* | chore/*) ;; *) echo "Une branche feat/…, fix/… ou chore/…" >&2; exit 1 ;; esac
  dir=$(dir_of "$branch")
  git fetch -q origin
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git -c core.longpaths=true worktree add -q "$dir" "$branch"
  elif git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git -c core.longpaths=true worktree add -q --track -b "$branch" "$dir" "origin/$branch"
  else
    git -c core.longpaths=true worktree add -q --no-track -b "$branch" "$dir" origin/main
  fi
  cp "$root/.env" "$dir/.env"
  (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline > /dev/null)
  echo "$dir"
  ;;
status)
  git fetch -q --prune origin
  git worktree list
  for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
    [ "$branch" = main ] && continue
    if is_on_main "$branch"; then state="déjà sur main : à supprimer"; else state="en cours"; fi
    echo "$branch — $state"
  done
  ;;
remove)
  branch="$2"
  git fetch -q origin
  if ! is_on_main "$branch"; then echo "$branch n'est pas sur main : rien n'est supprimé" >&2; exit 1; fi
  dir=$(dir_of "$branch")
  [ -d "$dir" ] && git -c core.longpaths=true worktree remove "$dir"
  git branch -D "$branch"
  if git ls-remote --exit-code --heads origin "$branch" > /dev/null; then git push -q origin --delete "$branch"; fi
  ;;
*)
  echo "Usage : sh tools/worktree.sh add|status|remove <branche>" >&2
  exit 1
  ;;
esac
