// Les octets du corps d'une requête, jamais plus que la borne : un en-tête qui annonce plus, ou un corps qui la dépasse sans
// l'annoncer, s'arrête sans tout lire. `null` : trop gros.
export async function getBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const announced = Number(request.headers.get("content-length"));
  if (announced > maxBytes) return null;
  const reader = request.body?.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}
