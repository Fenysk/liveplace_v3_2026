// Un tableau de chiffres (l'audience de la section Activité, JOURNAL 2026-10-07) : une ligne par chiffre, une colonne par
// période, et sous une valeur une précision facultative. Sur mobile, il garde ses colonnes.

import { RollingNumber } from "./rolling-number";

export type StatTableCell = { value: string; note?: string | undefined };

export type StatTableRow = { label: string; cells: readonly StatTableCell[] }; // une cellule par colonne

type StatTableProps = {
  caption: string; // pour les lecteurs d'écran
  columns: readonly string[];
  rows: readonly StatTableRow[];
};

export const StatTable = ({ caption, columns, rows }: StatTableProps) => (
  <table className="lp-stat-table">
    <caption className="lp-visually-hidden">{caption}</caption>
    <thead>
      <tr>
        <th scope="col">
          <span className="lp-visually-hidden">Chiffre</span>
        </th>
        {columns.map((column) => (
          <th key={column} scope="col" className="lp-stat-table-column lp-type-caption lp-muted">
            {column}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map(({ label, cells }) => (
        <tr key={label}>
          <th scope="row" className="lp-stat-table-label lp-type-body">
            {label}
          </th>
          {cells.map(({ value, note }, index) => (
            <td key={columns[index] ?? index} className="lp-stat-table-cell">
              <span className="lp-stat-table-value lp-type-title">
                <RollingNumber value={value} />
              </span>
              {note && (
                <span className="lp-type-caption lp-muted">
                  <RollingNumber value={note} />
                </span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);
