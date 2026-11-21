// Audit de sécurité n°4 et n°6 : l'adresse d'un client derrière Traefik. Traefik ajoute à droite de `X-Forwarded-For` l'adresse
// qu'il voit ; ce qui est à gauche vient du client et se forge. Seule l'entrée la plus à droite compte. Sans en-tête (ou si cette
// entrée n'est pas une adresse), l'adresse de la socket : c'est celle du client quand rien ne s'intercale.
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

const isAddress = (text: string): boolean => IPV4.test(text) || (text.includes(":") && IPV6.test(text));

export function clientIpOf(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
): string | undefined {
  const added = forwardedFor?.split(",").at(-1)?.trim();
  if (added && isAddress(added)) return added;
  return socketAddress && isAddress(socketAddress) ? socketAddress : undefined;
}

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const GROUPS_PER_ADDRESS = 8;
const GROUPS_PER_NETWORK = 4;
const HEXTET = /^[0-9a-f]{1,4}$/;

// La clé d'un plafond par adresse : un client IPv6 reçoit tout un /64 (2^64 adresses), il en changerait à chaque requête.
// Une adresse IPv4 reste telle quelle, y compris sa forme « mappée » `::ffff:a.b.c.d` que donne une socket à double pile.
export function ipKeyOf(ip: string): string {
  const mapped = MAPPED_IPV4.exec(ip);
  if (mapped?.[1]) return mapped[1];
  if (!ip.includes(":") || ip.includes(".")) return ip;
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2) return ip;
  const [head = "", tail = ""] = halves;
  const left = head === "" ? [] : head.split(":");
  const right = tail === "" ? [] : tail.split(":");
  const missing = GROUPS_PER_ADDRESS - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return ip;
  const groups = [...left, ...new Array<string>(missing > 0 ? missing : 0).fill("0"), ...right];
  if (!groups.every((group) => HEXTET.test(group))) return ip;
  const network = groups.slice(0, GROUPS_PER_NETWORK).map((group) => Number.parseInt(group, 16).toString(16));
  return `${network.join(":")}::/64`;
}
