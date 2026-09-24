import { describe, expect, it } from "vitest";
import { decodeClientFrame, decodeServerFrame, PROTOCOL_VERSION } from "./index";

describe("protocol frames", () => {
  it("decodes a valid hello frame", () => {
    const raw = {
      t: "hello",
      protocolVersion: PROTOCOL_VERSION,
      canvasId: "abc123",
      mode: "ui",
    };

    const result = decodeClientFrame(raw);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.t).toBe("hello");
  });

  it("rejects a hello frame with the wrong protocolVersion", () => {
    const raw = {
      t: "hello",
      protocolVersion: PROTOCOL_VERSION - 1,
      canvasId: "abc123",
      mode: "ui",
    };

    const result = decodeClientFrame(raw);

    expect(result.ok).toBe(false);
  });

  it("decodes a place frame with multiple pixels", () => {
    const raw = {
      t: "place",
      requestId: "req-1",
      pixels: [
        { x: 0, y: 0, colorIndex: 5 },
        { x: 10, y: 20, colorIndex: 0 },
        { x: 15, y: 3, colorIndex: 7 },
      ],
    };

    const result = decodeClientFrame(raw);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.t === "place") expect(result.value.pixels.length).toBe(3);
  });

  // Garde la photo Twitch de `you` dans un welcome, et accepte un welcome sans elle (écart §4.3, JOURNAL 2026-09-24)
  it("keeps the Twitch photo of `you` in a welcome, and accepts a welcome without one", () => {
    const welcome = {
      t: "welcome",
      canvas: { canvasId: "abc123", width: 4, height: 4, ownerId: "owner-1" },
      params: { gaugeMax: 10, refillMs: 10_000, refillCharges: 1, obsDelayMs: 5000 },
      palette: ["#00000000"],
      version: 0,
      you: { userId: "1234", login: "fenysk", displayName: "Fenysk", role: "viewer" },
    };
    const avatarUrl = "https://static-cdn.jtvnw.net/jtv_user_pictures/fenysk-profile_image-300x300.png";

    const withPhoto = decodeServerFrame({ ...welcome, you: { ...welcome.you, avatarUrl } });
    const withoutPhoto = decodeServerFrame(welcome);

    expect(withPhoto.ok && withPhoto.value.t === "welcome" && withPhoto.value.you.avatarUrl).toBe(avatarUrl);
    expect(withoutPhoto.ok).toBe(true);
  });
});
