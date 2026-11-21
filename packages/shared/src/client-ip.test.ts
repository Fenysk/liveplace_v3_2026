import { describe, expect, it } from "vitest";
import { clientIpOf, ipKeyOf } from "./client-ip";

describe("clientIpOf (audit de sécurité n°4 et n°6)", () => {
  // Traefik ajoute l'adresse qu'il voit à droite : ce que le client a écrit à gauche ne compte pas
  it("takes the rightmost X-Forwarded-For entry, never what the client wrote on the left", () => {
    expect(clientIpOf("203.0.113.9", "172.18.0.5")).toBe("203.0.113.9");
    expect(clientIpOf("1.1.1.1, 2.2.2.2, 203.0.113.9", "172.18.0.5")).toBe("203.0.113.9");
    expect(clientIpOf("  198.51.100.7  ", undefined)).toBe("198.51.100.7");
    expect(clientIpOf("2001:db8::1", undefined)).toBe("2001:db8::1");
  });

  // Sans en-tête, ou avec une dernière entrée qui n'est pas une adresse, l'adresse de la socket
  it("falls back to the socket address without a usable header", () => {
    expect(clientIpOf(undefined, "192.0.2.4")).toBe("192.0.2.4");
    expect(clientIpOf("", "192.0.2.4")).toBe("192.0.2.4");
    expect(clientIpOf("1.1.1.1, not-an-ip", "192.0.2.4")).toBe("192.0.2.4");
    expect(clientIpOf(undefined, "::ffff:192.0.2.4")).toBe("::ffff:192.0.2.4");
  });

  // Rien d'exploitable : aucune adresse, jamais une chaîne arbitraire
  it("gives nothing when no address is usable", () => {
    expect(clientIpOf(undefined, undefined)).toBeUndefined();
    expect(clientIpOf("garbage", "also garbage")).toBeUndefined();
  });
});

describe("ipKeyOf (audit de sécurité n°4)", () => {
  // IPv4 telle quelle, et sa forme mappée d'une socket à double pile s'y ramène
  it("keeps an IPv4 address, and folds its mapped form onto it", () => {
    expect(ipKeyOf("203.0.113.9")).toBe("203.0.113.9");
    expect(ipKeyOf("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  // Un client IPv6 change d'adresse dans son /64 : une seule clé pour tout le /64, quelle que soit l'écriture
  it("gives one key to a whole IPv6 /64, whatever the spelling", () => {
    const key = ipKeyOf("2001:db8:1:2::1");

    expect(key).toBe("2001:db8:1:2::/64");
    expect(ipKeyOf("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe(key);
    expect(ipKeyOf("2001:DB8:1:2:0:0:0:ffff")).toBe(key);
    expect(ipKeyOf("2001:db8:1:3::1")).not.toBe(key);
    expect(ipKeyOf("::1")).toBe("0:0:0:0::/64");
  });

  // Une écriture illisible n'a pas de /64 : la chaîne reste sa propre clé
  it("keeps a malformed IPv6 text as its own key", () => {
    expect(ipKeyOf("2001:db8:::1")).toBe("2001:db8:::1");
    expect(ipKeyOf("1:2:3")).toBe("1:2:3");
    expect(ipKeyOf("zz::1")).toBe("zz::1");
  });
});
