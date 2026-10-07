// La machine et le process, lus sans rien installer (écart §5.1, JOURNAL 2026-10-07) : `node:os` et `node:fs` donnent les
// chiffres de l'hôte, même depuis un conteneur, et sous Windows en local ; `performance`, l'occupation de la boucle d'événements.

import { statfs } from "node:fs/promises";
import { cpus, freemem, totalmem } from "node:os";
import { parse } from "node:path";
import { performance } from "node:perf_hooks";
import type { HostProbe } from "@liveplace/domain/ports";

// Le temps de tous les cœurs depuis le démarrage de la machine, en millisecondes : celui qui travaille, et le total.
type CpuTimes = { busy: number; total: number };

const getCpuTimes = (): CpuTimes =>
  cpus().reduce(
    (sum, { times }) => {
      const busy = times.user + times.nice + times.sys + times.irq;
      return { busy: sum.busy + busy, total: sum.total + busy + times.idle };
    },
    { busy: 0, total: 0 },
  );

// La part du temps passée à travailler entre deux lectures ; aucune quand l'horloge des cœurs n'a pas avancé.
export function toCpuPercent(before: CpuTimes, after: CpuTimes): number | null {
  const total = after.total - before.total;
  return total > 0 ? ((after.busy - before.busy) / total) * 100 : null;
}

export function createHostProbe(): HostProbe {
  let previousCpu: CpuTimes | undefined;
  let previousLoop = performance.eventLoopUtilization();
  // Le disque du process : la racine où il tourne, `/` d'un conteneur, `C:\` d'un poste Windows.
  const diskRoot = parse(process.cwd()).root;

  return {
    getMemory() {
      const totalBytes = totalmem();
      return { usedBytes: totalBytes - freemem(), totalBytes };
    },

    getCpuPercent() {
      const current = getCpuTimes();
      const before = previousCpu;
      previousCpu = current;
      return before ? toCpuPercent(before, current) : null;
    },

    getCoreCount: () => cpus().length,

    // Ce que le process peut encore écrire : les blocs réservés au système comptent comme pris.
    async getDisk() {
      const { bsize, blocks, bavail } = await statfs(diskRoot);
      return { usedBytes: (blocks - bavail) * bsize, totalBytes: blocks * bsize };
    },

    getUtilizationPercent() {
      const current = performance.eventLoopUtilization();
      const { utilization } = performance.eventLoopUtilization(current, previousLoop);
      previousLoop = current;
      return utilization * 100;
    },
  };
}
