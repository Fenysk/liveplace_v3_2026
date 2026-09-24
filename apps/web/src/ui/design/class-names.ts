// Assembler les classes `lp-…` d'un composant, et typer les variables CSS qu'il reçoit par `style`.

export type CssVariables = Record<`--${string}`, string>;

export function classNames(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
