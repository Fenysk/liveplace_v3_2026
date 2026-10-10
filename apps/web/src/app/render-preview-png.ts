// Écart §9.1 (JOURNAL 2026-10-10) : l'image d'un canvas pour la carte d'aperçu de son lien. L'interface écrit la mise en page
// et dessine le canvas et son fond, l'infra mesure les textes, rend la photo et le PNG : cette composition les assemble.

import { toBase64 } from "@liveplace/shared";
import type { AvatarPhotos } from "../infra/avatar-photos";
import { measureCardTexts, renderCardPng } from "../infra/card-png";
import { encodeIndexedPng } from "../infra/indexed-png";
import { encodeRgbPng } from "../infra/rgb-png";
import { DESIGN_TEXTS } from "../ui/design/design-texts";
import { cardName, cardTheme } from "../ui/link-preview/card-text";
import { PREVIEW_IMAGE_HEIGHT, PREVIEW_IMAGE_WIDTH } from "../ui/link-preview/link-preview";
import { LINK_PREVIEW_TEXTS } from "../ui/link-preview/link-preview-texts";
import { BRAND_NAME, BRAND_SUFFIX, previewCard } from "../ui/link-preview/preview-card";
import { ADDRESS_SIZE, fitName, nameSize, previewGeometry } from "../ui/link-preview/preview-geometry";
import { renderBackdrop, renderCanvasBitmap } from "../ui/link-preview/preview-image";
import { DEFAULT_LOCALE } from "../ui/locale/locale";
import type { PreviewInput } from "../usecase/canvas-preview";

type PreviewRendererDeps = { photos: Pick<AvatarPhotos, "get"> };

const embedPng = (png: Uint8Array): string => `data:image/png;base64,${toBase64(png)}`;

// Le robot de Discord, X ou Facebook n'envoie ni cookie ni `Accept-Language` (link-preview-texts.ts) : l'image est écrite
// dans la langue par défaut, comme les `meta` qu'il lit.
export function createPreviewRenderer({ photos }: PreviewRendererDeps) {
  const texts = LINK_PREVIEW_TEXTS[DEFAULT_LOCALE];
  const themeCaption = DESIGN_TEXTS[DEFAULT_LOCALE].theme;
  return async ({ image, owner, theme }: PreviewInput): Promise<Uint8Array<ArrayBuffer>> => {
    // La photo se charge pendant que le reste se dessine.
    const photo = owner.avatarUrl ? photos.get(owner.avatarUrl) : Promise.resolve(null);
    const geometry = previewGeometry(image.width, image.height);
    const name = cardName(owner);
    // Satori sait les largeurs : le pseudo prend la plus grande taille qui tient, le login est coupé s'il le faut.
    const [nameWidth = 0, loginWidth = 0, brandName = 0, brandSuffix = 0] = await measureCardTexts([
      { text: name, fontWeight: 900 },
      { text: `/${owner.login}`, fontWeight: 800 },
      { text: BRAND_NAME, fontWeight: 900 },
      { text: BRAND_SUFFIX, fontWeight: 800 },
    ]);
    const atAddressSize = (width100: number): number => (width100 * ADDRESS_SIZE) / 100;
    const card = previewCard({
      geometry,
      login: owner.login,
      name,
      nameFit: fitName({
        width100: nameWidth,
        available: geometry.content,
        size: nameSize(geometry.inner),
      }),
      loginWidth: atAddressSize(loginWidth),
      brandWidth: atAddressSize(brandName + brandSuffix),
      invitation: texts.invitation,
      themeCaption,
      theme: cardTheme(theme),
      photo: await photo,
      canvasSrc: embedPng(
        encodeIndexedPng(renderCanvasBitmap(image, geometry.canvas.width, geometry.canvas.height)),
      ),
      backdropSrc: embedPng(encodeRgbPng(renderBackdrop(image))),
    });
    return renderCardPng(card, { width: PREVIEW_IMAGE_WIDTH, height: PREVIEW_IMAGE_HEIGHT });
  };
}
