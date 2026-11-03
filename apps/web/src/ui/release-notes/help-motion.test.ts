import { describe, expect, it } from "vitest";
import { CLICK_RESTART_MS, HELP_LOOP_MS, HELP_RESTING_MS, helpAt, RESTART_SPOT } from "./help-motion";

describe("Un coup de pouce ? (vignette)", () => {
  // L'image fixe : la bulle de Valider seule, ni fenêtre, ni toast, ni seconde bulle, aucune souris
  it("rests on the Confirm bubble alone, with no window, no toast and no mouse", () => {
    const moment = helpAt(HELP_RESTING_MS);

    expect(moment.submitBubble).toBe(1);
    expect(moment.gaugeBubble).toBe(0);
    expect(moment.window).toBe(0);
    expect(moment.toast).toBe(0);
    expect(moment.restartTap).toBe(0);
    expect(moment.pointer.opacity).toBe(0);
  });

  // Les bulles paraissent une à une : celle de Valider part avant que celle de la jauge ne vienne, jamais les deux entières ensemble
  it("shows the bubbles one at a time, the Confirm one first and then the gauge one", () => {
    expect(helpAt(2600).submitBubble).toBeGreaterThan(0);
    expect(helpAt(2600).submitBubble).toBeLessThan(1);
    expect(helpAt(2900).submitBubble).toBe(0);
    expect(helpAt(2900).gaugeBubble).toBe(0);
    expect(helpAt(3200).gaugeBubble).toBeGreaterThan(0);
    expect(helpAt(3200).gaugeBubble).toBeLessThan(1);
    expect(helpAt(4000).gaugeBubble).toBe(1);
    expect(helpAt(4000).submitBubble).toBe(0);
    expect(helpAt(5300).gaugeBubble).toBeLessThan(1);
    expect(helpAt(5500).gaugeBubble).toBe(0);
    for (let t = 0; t < HELP_LOOP_MS; t += 100) {
      const { submitBubble, gaugeBubble } = helpAt(t);
      expect(Math.min(submitBubble, gaugeBubble)).toBe(0);
    }
  });

  // La fenêtre Mon compte s'ouvre quand les bulles sont parties, et la souris clique Revoir le tuto au milieu
  it("opens the account window once the bubbles are gone, and the mouse clicks Replay the tutorial", () => {
    expect(helpAt(5500).window).toBe(0);
    expect(helpAt(5750).window).toBeGreaterThan(0);
    expect(helpAt(5750).window).toBeLessThan(1);
    expect(helpAt(6200).window).toBe(1);
    const onClick = helpAt(CLICK_RESTART_MS);

    expect([onClick.pointer.ax, onClick.pointer.ay, onClick.pointer.bx, onClick.pointer.by]).toEqual([
      RESTART_SPOT.ax,
      RESTART_SPOT.ay,
      RESTART_SPOT.bx,
      RESTART_SPOT.by,
    ]);
    expect(onClick.restartTap).toBe(1);
    expect(onClick.press).toBe(1);
    expect(onClick.pointer.opacity).toBe(1);
    expect(onClick.window).toBe(1);
  });

  // Le toast confirme après le clic, pas avant ; la fenêtre se ferme ensuite
  it("confirms with the toast after the click only, then closes the window", () => {
    expect(helpAt(CLICK_RESTART_MS).toast).toBe(0);
    expect(helpAt(6900).toast).toBe(1);
    expect(helpAt(7250).window).toBeGreaterThan(0);
    expect(helpAt(7250).window).toBeLessThan(1);
    expect(helpAt(7500).window).toBe(0);
    expect(helpAt(7500).pointer.opacity).toBe(0);
    expect(helpAt(8000).toast).toBe(0);
  });

  // Le tutoriel repart du début : la bulle de Valider revient une fois la fenêtre fermée, et la boucle se referme sur elle-même
  it("brings the Confirm bubble back once the window is closed, and closes the loop on itself", () => {
    expect(helpAt(7500).submitBubble).toBe(0);
    expect(helpAt(7800).submitBubble).toBeGreaterThan(0);
    expect(helpAt(7800).submitBubble).toBeLessThan(1);
    expect(helpAt(8200).submitBubble).toBe(1);
    expect(helpAt(HELP_LOOP_MS - 1).submitBubble).toBe(1);
    expect(helpAt(HELP_LOOP_MS)).toEqual(helpAt(0));
    expect(helpAt(HELP_LOOP_MS + HELP_RESTING_MS)).toEqual(helpAt(HELP_RESTING_MS));
  });

  // La souris ne paraît que pour le clic : jamais pendant les bulles
  it("shows the mouse only around the click, never while a bubble is shown", () => {
    expect(helpAt(2000).pointer.opacity).toBe(0);
    expect(helpAt(4000).pointer.opacity).toBe(0);
    expect(helpAt(5100).pointer.opacity).toBeGreaterThan(0);
    expect(helpAt(5100).pointer.opacity).toBeLessThan(1);
    expect(helpAt(8200).pointer.opacity).toBe(0);
  });
});
