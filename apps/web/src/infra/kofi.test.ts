import { describe, expect, it } from "vitest";
import { createKofiWebhook } from "./kofi";

const secret = "test-secret-invented-for-this-file";
const now = Date.UTC(2026, 10, 3, 13, 0, 0);

// Ce que Ko-fi envoie (page API de Ko-fi, 03/11) : un formulaire dont l'unique champ `data` porte le JSON. `extra` s'ajoute à la
// fin du JSON et l'emporte sur un champ de même nom.
const MESSAGE = `{"verification_token":"${secret}","message_id":"3a1fac0c-f960-4506-a60e-824979a74e74","timestamp":"2026-11-03T12:01:22Z","type":"Donation","is_public":true,"from_name":"Jo Example","message":"Good luck with the integration!","amount":"3.00","url":"https://ko-fi.com/Home/CoffeeShop?txid=00000000-1111-2222-3333-444444444444","email":"Jo.Example@Example.com","currency":"USD","is_subscription_payment":false,"is_first_subscription_payment":false,"kofi_transaction_id":"00000000-1111-2222-3333-444444444444","shop_items":null,"tier_name":null,"shipping":null,"discord_username":"Jo#0001","discord_userid":"1234567890"`;
const form = (extra = "") => new URLSearchParams({ data: `${MESSAGE}${extra}}` }).toString();
const formOf = (json: string) => new URLSearchParams({ data: json }).toString();

const donationOf = (body: string) => {
  const read = createKofiWebhook(secret).read(body, now);
  return read.ok && read.value.kind === "donation" ? read.value.donation : null;
};

describe("createKofiWebhook (JOURNAL 2026-11-03)", () => {
  const webhook = createKofiWebhook(secret);

  // Un don : le montant en centimes, la monnaie telle quelle, la date de Ko-fi ; jamais le message, Discord, l'adresse de la page
  it("reads a donation and keeps nothing else than what the badge needs", () => {
    const read = webhook.read(form(), now);

    expect(read).toEqual({
      ok: true,
      value: {
        kind: "donation",
        donation: {
          messageId: "3a1fac0c-f960-4506-a60e-824979a74e74",
          transactionId: "00000000-1111-2222-3333-444444444444",
          amountCents: 300,
          currency: "USD",
          donatedAt: Date.UTC(2026, 10, 3, 12, 1, 22),
          email: "Jo.Example@Example.com",
          kofiName: "Jo Example",
        },
      },
    });
    expect(JSON.stringify(read)).not.toMatch(/Good luck|Discord|Jo#0001|1234567890|CoffeeShop/);
  });

  // « Donation », « Tip » et « Subscription » comptent ; l'abonnement chaque mois
  it("counts a donation, a tip and every payment of a subscription", () => {
    for (const type of ["Donation", "Tip", "Subscription"])
      expect(webhook.read(form(`,"type":"${type}","is_subscription_payment":true`), now)).toMatchObject({
        ok: true,
        value: { kind: "donation" },
      });
  });

  // Une commande ou une boutique n'est pas un don : ignorée, et leur adresse postale n'est jamais lue
  it("ignores a commission and a shop order, shipping address included", () => {
    const shipping = `"shipping":{"full_name":"Jo Example","street_address":"1 rue de la Paix","city":"Paris"}`;
    for (const type of ["Commission", "Shop Order"]) {
      const read = webhook.read(form(`,"type":"${type}",${shipping}`), now);
      expect(read).toEqual({ ok: true, value: { kind: "ignored" } });
      expect(JSON.stringify(read)).not.toContain("Paix");
    }
  });

  // Les champs facultatifs absents ou nuls ne rejettent pas le don : seuls le jeton, le type, le message et le montant comptent
  it("accepts a donation without the optional fields", () => {
    const json = `{"verification_token":"${secret}","type":"Donation","message_id":"m-1","amount":"5","message":null,"email":null,"from_name":null,"currency":null,"timestamp":null}`;

    expect(webhook.read(formOf(json), now)).toEqual({
      ok: true,
      value: {
        kind: "donation",
        donation: { messageId: "m-1", amountCents: 500, currency: "EUR", donatedAt: now },
      },
    });
  });

  // Les montants se lisent sans flottant : « 0.10 », « 1000.5 », « 2,50 », un tronqué et un nombre
  it("reads amounts to the cent", () => {
    const cents = (amount: string) => donationOf(form(`,"amount":${amount}`))?.amountCents;

    expect(cents('"0.10"')).toBe(10);
    expect(cents('"1000.5"')).toBe(100050);
    expect(cents('"2,50"')).toBe(250);
    expect(cents('"19.999"')).toBe(1999);
    expect(cents("7")).toBe(700);
  });

  // Un paiement à zéro n'est pas un don
  it("ignores a payment of zero", () => {
    expect(webhook.read(form(',"amount":"0.00"'), now)).toEqual({ ok: true, value: { kind: "ignored" } });
  });

  // Un don sans montant lisible ou sans identifiant de message est refusé : il ne pourrait ni compter ni être dédoublonné
  it("refuses a donation without a readable amount or a message id", () => {
    for (const extra of [
      ',"amount":"beaucoup"',
      ',"amount":null',
      ',"amount":"-3.00"',
      ',"message_id":null',
      ',"message_id":""',
    ])
      expect(webhook.read(form(extra), now)).toEqual({ ok: false, error: "invalid" });
  });

  // Une date illisible ou absente : la date de la réception
  it("falls back on the reception time when the date is unreadable", () => {
    expect(donationOf(form(',"timestamp":"hier"'))?.donatedAt).toBe(now);
  });

  // Le jeton : faux, plus court, plus long ou vide, c'est refusé ; le bon passe
  it("refuses a wrong, shorter, longer or empty verification token", () => {
    for (const sent of ["wrong", `${secret}x`, secret.slice(1), ""])
      expect(webhook.read(form(`,"verification_token":"${sent}"`), now)).toEqual({
        ok: false,
        error: "unauthorized",
      });
    expect(webhook.read(form(), now).ok).toBe(true);
  });

  // Sans jeton dans le message ou avec un jeton qui n'est pas un texte, le message n'est pas celui de Ko-fi
  it("refuses a message whose verification token is missing or not a text", () => {
    expect(webhook.read(formOf('{"type":"Donation","message_id":"m-1","amount":"3.00"}'), now)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(webhook.read(form(',"verification_token":42'), now)).toEqual({ ok: false, error: "invalid" });
  });

  // Le jeton se vérifie avant le type : un faux jeton ne dit jamais si le type compte
  it("checks the token before the type", () => {
    expect(webhook.read(form(',"type":"Shop Order","verification_token":"wrong"'), now)).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  // Sans jeton posé, rien ne passe, pas même un message au bon jeton
  it("refuses everything when no secret is set", () => {
    expect(createKofiWebhook(null).read(form(), now)).toEqual({ ok: false, error: "unconfigured" });
  });

  // Un corps qui n'est pas ce que Ko-fi envoie : sans champ `data`, sans JSON, ou avec un JSON d'une autre forme
  it("refuses a body that is not what Ko-fi sends", () => {
    for (const body of [
      "",
      "foo=bar",
      "data=pas-du-json",
      formOf("[1,2]"),
      formOf("null"),
      formOf('"un texte"'),
    ])
      expect(webhook.read(body, now)).toEqual({ ok: false, error: "invalid" });
  });

  // Le nom Ko-fi et l'e-mail sont bornés
  it("caps the name and the address", () => {
    const donation = donationOf(form(`,"from_name":"${"n".repeat(500)}","email":"${"e".repeat(500)}@x.org"`));

    expect(donation?.kofiName?.length).toBe(100);
    expect(donation?.email?.length).toBe(320);
  });
});
