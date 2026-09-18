#!/usr/bin/env python3
"""Applique la règle "accolades de if" décrite dans
.agent/core/skills/executer/SKILL.md (point 9) :

  - une seule action -> jamais d'accolades, quelle que soit la condition
  - deux actions ou plus -> accolades obligatoires (inchangé)

Le placement de ligne (même ligne ou ligne suivante) n'est PAS de ce ressort :
c'est le formatter Biome (règle des 110 caractères) qui en décide seul, et
Biome refuse structurellement de préserver un saut de ligne manuel (voir
SKILL.md, point 9). Ce script se contente donc de retirer les accolades
inutiles, puis laisse `biome format --write` placer la ligne.

Il ne touche qu'aux `if` autonomes (sans `else`), à corps simple (une seule
instruction, une seule ligne, aucun commentaire, aucun bloc imbriqué) : tout
le reste est laissé tel quel plutôt que risqué.

Sécurité ("sans erreurs") :
  - par défaut le script est en dry-run : il affiche un diff, n'écrit rien.
  - avec --write, chaque fichier modifié est écrit puis reformaté par
    `biome format --write` (le formatter du projet) ; si Biome échoue à
    parser le résultat, le fichier est restauré à son contenu d'origine.

Usage:
    python tools/if_brace_style.py apps/web/src                # dry-run
    python tools/if_brace_style.py apps/web/src --write         # applique
    python tools/if_brace_style.py fichier.ts --write --biome-cmd "pnpm exec biome"
"""

from __future__ import annotations

import argparse
import difflib
import re
import subprocess
import sys
from pathlib import Path

EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"}
EXCLUDED_DIR_NAMES = {"node_modules", "dist", ".output", "_generated"}

IF_RE = re.compile(r"(?<![\w$])if\s*\(")
WORD_BEFORE_RE = re.compile(r"[A-Za-z_$][\w$]*\s*$")


def classify(src: str) -> list[str]:
    """Classe chaque caractère en 'code' | 'string' | 'comment'.

    Best-effort sur les template literals (${...} traité par comptage
    d'accolades équilibré) : un cas pathologique mal classé finit rattrapé
    par la validation Biome en aval, jamais par une confiance aveugle ici.
    """
    n = len(src)
    kinds = ["code"] * n
    i = 0
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            start = i
            while i < n and src[i] != "\n":
                i += 1
            for j in range(start, i):
                kinds[j] = "comment"
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            start = i
            i += 2
            while i + 1 < n and not (src[i] == "*" and src[i + 1] == "/"):
                i += 1
            i = min(i + 2, n)
            for j in range(start, i):
                kinds[j] = "comment"
            continue
        if c in ("'", '"', "`"):
            quote = c
            start = i
            i += 1
            while i < n:
                if src[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if quote == "`" and src[i] == "$" and i + 1 < n and src[i + 1] == "{":
                    i += 2
                    depth = 1
                    while i < n and depth > 0:
                        if src[i] == "{":
                            depth += 1
                        elif src[i] == "}":
                            depth -= 1
                        i += 1
                    continue
                if src[i] == quote:
                    i += 1
                    break
                i += 1
            for j in range(start, i):
                kinds[j] = "string"
            continue
        i += 1
    return kinds


def find_matching(src: str, kinds: list[str], open_idx: int, open_ch: str, close_ch: str) -> int:
    depth = 1
    i = open_idx + 1
    n = len(src)
    while i < n:
        if kinds[i] == "code":
            if src[i] == open_ch:
                depth += 1
            elif src[i] == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def top_level_semicolons(src: str, kinds: list[str], start: int, end: int) -> list[int]:
    """Index des `;` de code situés à profondeur 0 (parens/brackets/braces) dans [start, end)."""
    depth = 0
    result = []
    for i in range(start, end):
        if kinds[i] != "code":
            continue
        c = src[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == ";" and depth == 0:
            result.append(i)
    return result


def has_code_braces(src: str, kinds: list[str], start: int, end: int) -> bool:
    return any(kinds[i] == "code" and src[i] in "{}" for i in range(start, end))


def has_comment(kinds: list[str], start: int, end: int) -> bool:
    return any(kinds[i] == "comment" for i in range(start, end))


class Edit:
    def __init__(self, start: int, end: int, replacement: str):
        self.start = start
        self.end = end
        self.replacement = replacement


def build_edits(src: str) -> list[Edit]:
    kinds = classify(src)
    n = len(src)
    edits: list[Edit] = []

    for m in IF_RE.finditer(src):
        if_start = m.start()
        if kinds[if_start] != "code":
            continue

        before = src[:if_start]
        word_before = WORD_BEFORE_RE.search(before)
        if word_before and word_before.group() == "else":
            continue  # `else if` : chaîne à risque, on laisse telle quelle

        open_paren = m.end() - 1
        close_paren = find_matching(src, kinds, open_paren, "(", ")")
        if close_paren == -1:
            continue

        cond_start, cond_end = open_paren + 1, close_paren
        if "\n" in src[cond_start:cond_end]:
            continue  # condition multi-ligne : trop de risque, on laisse telle quelle

        after_paren = close_paren + 1
        gap = src[after_paren:]
        gap_stripped_len = len(gap) - len(gap.lstrip(" \t\n"))
        body_start = after_paren + gap_stripped_len
        if body_start >= n:
            continue

        if src[body_start] == "{":
            close_brace = find_matching(src, kinds, body_start, "{", "}")
            if close_brace == -1:
                continue
            inner_start, inner_end = body_start + 1, close_brace
            inner = src[inner_start:inner_end].strip()
            if not inner:
                continue  # bloc vide : hors sujet
            if has_comment(kinds, inner_start, inner_end):
                continue
            semis = top_level_semicolons(src, kinds, inner_start, inner_end)
            trimmed_inner_end = inner_start + len(src[inner_start:inner_end].rstrip())
            if not semis or semis[-1] != trimmed_inner_end - 1:
                continue  # ne se termine pas par le seul `;` : plusieurs instructions, ou aucune
            if len(semis) != 1:
                continue  # plusieurs instructions -> accolades obligatoires, rien à faire
            if has_code_braces(src, kinds, inner_start, inner_end):
                continue  # bloc imbriqué : on laisse les accolades
            if "\n" in inner:
                continue  # instruction déjà étalée sur plusieurs lignes : on ne la recolle pas
            stmt = inner
            stmt_end = close_brace + 1
            full_stmt_end = stmt_end
        else:
            semis = top_level_semicolons(src, kinds, body_start, n)
            if not semis:
                continue
            stmt_end = semis[0] + 1
            stmt = src[body_start:stmt_end].strip()
            if "\n" in stmt:
                continue
            if has_comment(kinds, body_start, stmt_end):
                continue
            full_stmt_end = stmt_end

        tail = src[full_stmt_end:]
        tail_gap_len = len(tail) - len(tail.lstrip(" \t\n"))
        after_ws = tail[tail_gap_len:]
        if after_ws.startswith("else") and (len(after_ws) == 4 or not (after_ws[4].isalnum() or after_ws[4] == "_")):
            continue  # cette branche a un else : chaîne à risque, on laisse telle quelle

        cond = src[cond_start:cond_end].strip()
        # Le placement de ligne appartient à Biome (règle des 110 caractères) :
        # on ne fait que retirer les accolades, jamais de saut de ligne ici.
        replacement = f"if ({cond}) {stmt}"

        original = src[if_start:full_stmt_end]
        if original == replacement:
            continue

        edits.append(Edit(if_start, full_stmt_end, replacement))

    return edits


def apply_edits(src: str, edits: list[Edit]) -> str:
    out = src
    for edit in sorted(edits, key=lambda e: e.start, reverse=True):
        out = out[: edit.start] + edit.replacement + out[edit.end :]
    return out


def iter_target_files(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_file():
            if p.suffix in EXTENSIONS:
                files.append(p)
            continue
        for child in p.rglob("*"):
            if not child.is_file() or child.suffix not in EXTENSIONS:
                continue
            if any(part in EXCLUDED_DIR_NAMES for part in child.parts):
                continue
            files.append(child)
    return files


def format_with_biome(path: Path, biome_cmd: list[str]) -> tuple[bool, str]:
    """Laisse Biome reformater le fichier réel (il décide seul du placement de
    ligne). Sur Windows, `pnpm` est un script .cmd : subprocess ne le résout
    pas sans passer par le shell (résolution PATHEXT), d'où shell=True.
    """
    try:
        result = subprocess.run(
            [*biome_cmd, "format", "--write", str(path)],
            capture_output=True,
            text=True,
            check=False,
            shell=sys.platform == "win32",
        )
    except FileNotFoundError as exc:
        return False, f"commande biome introuvable ({exc})"
    if result.returncode != 0:
        return False, result.stderr.strip() or result.stdout.strip()
    return True, ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", help="fichiers ou dossiers à traiter")
    parser.add_argument("--write", action="store_true", help="applique les changements (sinon dry-run)")
    parser.add_argument(
        "--biome-cmd",
        default="pnpm exec biome",
        help="commande Biome utilisée pour formater/valider après écriture (défaut: 'pnpm exec biome')",
    )
    args = parser.parse_args()

    biome_cmd = args.biome_cmd.split()
    files = iter_target_files(args.paths)
    if not files:
        print("Aucun fichier ciblé.", file=sys.stderr)
        return 1

    changed = 0
    reverted = 0
    for path in files:
        # newline="" : aucune traduction de fin de ligne (le dépôt est en LF ;
        # sur Windows, un write_text() par défaut réécrirait en CRLF). Path.write_text
        # n'a `newline=` qu'à partir de Python 3.13, d'où open() explicite.
        with open(path, encoding="utf-8", newline="") as f:
            original = f.read()
        edits = build_edits(original)
        if not edits:
            continue
        updated = apply_edits(original, edits)
        if updated == original:
            continue

        changed += 1
        rel = path.as_posix()
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            updated.splitlines(keepends=True),
            fromfile=rel,
            tofile=rel,
        )
        sys.stdout.writelines(diff)

        if not args.write:
            continue

        path.write_text(updated, encoding="utf-8", newline="")
        ok, error = format_with_biome(path, biome_cmd)
        if not ok:
            path.write_text(original, encoding="utf-8", newline="")
            reverted += 1
            print(f"[revert] {rel} : Biome rejette le résultat -> {error}", file=sys.stderr)

    mode = "écrit" if args.write else "dry-run"
    print(f"\n{changed} fichier(s) modifié(s) ({mode}), {reverted} annulé(s) après échec Biome.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
