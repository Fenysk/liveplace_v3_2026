import { describe, expect, it } from "vitest";
import { createHostProbe, toCpuPercent } from "./host";

// Écart §5.1 (JOURNAL 2026-10-07) : la machine et le process se lisent par `node:os`, `node:fs` et `performance`.
describe("the processor of the machine (JOURNAL 2026-10-07)", () => {
  // Rend la part du temps de tous les cœurs passée à travailler, entre deux lectures
  it("gives the share of the time of all the cores spent working, between two readings", () => {
    expect(toCpuPercent({ busy: 100, total: 200 }, { busy: 150, total: 300 })).toBe(50);
    expect(toCpuPercent({ busy: 0, total: 0 }, { busy: 400, total: 400 })).toBe(100);
  });

  // Ne rend rien quand aucun temps ne s'est écoulé entre les lectures : pas de division par zéro
  it("gives nothing when no time went by between the readings: no division by zero", () => {
    expect(toCpuPercent({ busy: 100, total: 200 }, { busy: 100, total: 200 })).toBeNull();
  });
});

describe("the host probe (JOURNAL 2026-10-07)", () => {
  // Lit la mémoire de la machine : une part utilisée d'un total
  it("reads the memory of the machine: a used part of a total", () => {
    const { usedBytes, totalBytes } = createHostProbe().getMemory();

    expect(totalBytes).toBeGreaterThan(0);
    expect(usedBytes).toBeGreaterThan(0);
    expect(usedBytes).toBeLessThanOrEqual(totalBytes);
  });

  // Compte les cœurs de la machine : le plafond de son processeur
  it("counts the cores of the machine: the ceiling of its processor", () => {
    expect(createHostProbe().getCoreCount()).toBeGreaterThanOrEqual(1);
  });

  // Lit le disque du process, même sous Windows : une part utilisée d'un total
  it("reads the disk of the process, under Windows too: a used part of a total", async () => {
    const { usedBytes, totalBytes } = await createHostProbe().getDisk();

    expect(totalBytes).toBeGreaterThan(0);
    expect(usedBytes).toBeGreaterThanOrEqual(0);
    expect(usedBytes).toBeLessThanOrEqual(totalBytes);
  });

  // Ne dit rien du processeur à la première lecture, puis un pourcentage depuis la précédente
  it("says nothing of the processor at the first reading, then a percentage since the previous one", () => {
    const probe = createHostProbe();
    expect(probe.getCpuPercent()).toBeNull();

    for (const end = Date.now() + 100; Date.now() < end; ) Math.sqrt(Date.now()); // du travail à mesurer

    const percent = probe.getCpuPercent();
    expect(percent).not.toBeNull();
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
  });

  // Dit l'occupation de la boucle d'événements du process, entre 0 et 100 %, depuis la lecture précédente
  it("tells how busy the event loop of the process is, from 0 to 100 %, since the previous reading", async () => {
    const probe = createHostProbe();
    probe.getUtilizationPercent();

    for (const end = Date.now() + 50; Date.now() < end; ) Math.sqrt(Date.now());
    const busy = probe.getUtilizationPercent();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const idle = probe.getUtilizationPercent();

    expect(busy).toBeGreaterThan(idle);
    expect(busy).toBeLessThanOrEqual(100);
    expect(idle).toBeGreaterThanOrEqual(0);
  });
});
