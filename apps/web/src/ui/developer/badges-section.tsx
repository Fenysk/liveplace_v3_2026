// La section Badges de la fenêtre Développeur (CDC des badges §4 ; JOURNAL 2026-11-03), de haut en bas : le nombre de titulaires du
// badge Soutien, puis les dons non reliés, une ligne chacun avec « Relier à un compte ». Des lignes simples comme Modération, jamais
// de cartes ; un seul bouton plein par section, celui de la ligne ouverte (une seule à la fois). Jamais un montant. L'affichage seul :
// `LiveBadgesSection` la branche sur Convex.

import type { WaitingDonation } from "@liveplace/domain/ports";
import { useState } from "react";
import type { BadgesReport } from "../../usecase/badges-section";
import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { SkeletonBlock, SkeletonSwap } from "../design/skeleton";
import { TextField } from "../design/text-field";
import { BadgeGlyph } from "../design/user-badge";
import { WindowRow } from "../design/window";
import { formatDonationDay, type LinkFailure, linkFailureText } from "./badges-labels";

export type BadgesView =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; report: BadgesReport };

export type BadgesSectionProps = {
  view: BadgesView;
  // `null` : le don est relié, la liste se relit. Sinon, ce qui a empêché le lien : la ligne le dit et garde son champ.
  onLink: (donationId: string, login: string) => Promise<LinkFailure | null>;
};

type LinkFormProps = { donationId: string; onLink: BadgesSectionProps["onLink"] };

// Le champ et le bouton Relier, sur place dans la ligne. Entrée dans le champ ne valide rien : le bouton seul relie.
const LinkForm = ({ donationId, onLink }: LinkFormProps) => {
  const [login, setLogin] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [failure, setFailure] = useState<LinkFailure | null>(null);
  const link = async () => {
    setIsRunning(true);
    setFailure(await onLink(donationId, login));
    setIsRunning(false);
  };
  return (
    <div className="lp-link-form">
      <TextField
        label="Pseudo Twitch"
        value={login}
        onInput={(value) => {
          setLogin(value);
          setFailure(null);
        }}
        maxLength={60}
        isDisabled={isRunning}
      />
      <Button
        label="Relier"
        variant="primary"
        isDisabled={isRunning || login.trim() === ""}
        onPress={() => void link()}
      />
      <span
        role="alert"
        className={classNames(
          "lp-type-caption lp-danger lp-link-form-failure",
          !failure && "lp-visually-hidden",
        )}
      >
        {failure ? linkFailureText(failure) : null}
      </span>
    </div>
  );
};

type WaitingRowProps = {
  donation: WaitingDonation;
  isOpen: boolean;
  onToggle: () => void;
  onLink: BadgesSectionProps["onLink"];
};

// Le nom Ko-fi, l'e-mail Ko-fi dessous (il aide à choisir le compte : le développeur seul le voit) et le jour du don.
const WaitingRow = ({ donation, isOpen, onToggle, onLink }: WaitingRowProps) => (
  <WindowRow
    label={
      <span className="lp-window-block">
        <span className="lp-type-body">{donation.kofiName ?? "Anonyme"}</span>
        {donation.email && <span className="lp-type-caption lp-muted">{donation.email}</span>}
        <span className="lp-type-caption lp-muted">{formatDonationDay(donation.donatedAt)}</span>
      </span>
    }
  >
    <Button label="Relier à un compte" isExpanded={isOpen} onPress={onToggle} />
    {isOpen && <LinkForm donationId={donation.donationId} onLink={onLink} />}
  </WindowRow>
);

const ReadySection = ({ report, onLink }: { report: BadgesReport; onLink: BadgesSectionProps["onLink"] }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <WindowRow
        label={
          <span className="lp-badge-line">
            Titulaires du badge Soutien
            <span className="lp-user-badge lp-user-badge--support" aria-hidden="true">
              <BadgeGlyph family="support" />
            </span>
          </span>
        }
      >
        <span className="lp-type-title">{report.holders}</span>
      </WindowRow>
      <section className="lp-setting">
        <h3 className="lp-type-title lp-window-subhead">Dons non reliés</h3>
        {report.waiting.length === 0 ? (
          <span className="lp-type-caption lp-muted">Aucun don en attente.</span>
        ) : (
          report.waiting.map((donation) => (
            <WaitingRow
              key={donation.donationId}
              donation={donation}
              isOpen={openId === donation.donationId}
              onToggle={() => setOpenId(openId === donation.donationId ? null : donation.donationId)}
              onLink={onLink}
            />
          ))
        )}
      </section>
    </>
  );
};

export const BadgesSection = ({ view, onLink }: BadgesSectionProps) => (
  <div className="lp-window-layout">
    <SkeletonSwap isLoading={view.status === "loading"} skeleton={<SkeletonBlock shape="area" />}>
      {view.status === "ready" && <ReadySection report={view.report} onLink={onLink} />}
      {view.status === "failed" && (
        <span className="lp-type-caption lp-muted">Les badges ne sont pas disponibles.</span>
      )}
    </SkeletonSwap>
  </div>
);
