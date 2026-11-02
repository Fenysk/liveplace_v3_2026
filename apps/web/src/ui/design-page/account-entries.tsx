// Mon compte et la suppression du compte (CDC §8) : la vraie fenêtre de Mon compte avec sa ligne sous filet, et la vraie petite
// fenêtre de confirmation, avec des props d'exemple. Rien ne s'efface : la confirmation montre son verrou, puis se ferme.

import { useState } from "react";
import { AccountWindow } from "../account/account-window";
import { DeleteAccountWindow, type DeleteAccountWindowProps } from "../account/delete-account-window";
import { Button } from "../design/button";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { noop, SAMPLE_OWNER } from "./design-fixtures";
import { Block, DIALOG_NOTE, Entry, OpenWindow, StateRow } from "./entry-layout";

const LOCKED_MS = 1500; // la démonstration du verrou : l'action, puis la fermeture

type Scene = Pick<DeleteAccountWindowProps, "status" | "failure">;

// Confirmer montre le verrou pendant l'effacement, puis la fenêtre se ferme. Une scène d'échec s'ouvre avec son message.
const useConfirmation = (start: Scene) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scene, setScene] = useState(start);
  return {
    props: {
      ...scene,
      isOpen,
      onConfirm: () => {
        setScene({ ...scene, status: "running", failure: null });
        setTimeout(() => setIsOpen(false), LOCKED_MS);
      },
      onClose: () => setIsOpen(false),
    } satisfies DeleteAccountWindowProps,
    open: () => {
      setScene(start);
      setIsOpen(true);
    },
  };
};

// Les sections du rôle, vides : Mon compte est la seule ouverte, les autres ne servent qu'à la barre latérale.
const NO_CONTENT = <span />;
const OWNER_TABS = {
  canvasTab: NO_CONTENT,
  canvasesTab: NO_CONTENT,
  obsTab: NO_CONTENT,
  moderationTab: NO_CONTENT,
};
const MODERATOR_TABS = { moderationTab: NO_CONTENT };

// Mon compte, ouverte sur la bonne section : Supprimer mon compte ouvre la confirmation, comme dans le jeu.
const AccountWithDeletion = ({
  isOwner,
  isOpen,
  close,
}: {
  isOwner: boolean;
  isOpen: boolean;
  close: () => void;
}) => {
  const appearanceChoice = useAppearanceChoice();
  const confirmation = useConfirmation({ status: "idle", failure: null });
  return (
    <>
      <AccountWindow
        isOpen={isOpen}
        sectionId="account"
        onSelect={noop}
        onClose={close}
        user={SAMPLE_OWNER}
        signOutHref="#"
        appearanceChoice={appearanceChoice}
        onPickAppearance={pickAppearance}
        onRestartTutorial={noop}
        onDeleteAccount={confirmation.open}
        {...(isOwner ? OWNER_TABS : MODERATOR_TABS)}
      />
      <DeleteAccountWindow {...confirmation.props} />
    </>
  );
};

export const AccountWindowEntry = () => (
  <Entry
    slug="mon-compte"
    components={["AccountWindow", "WindowRow"]}
    file="ui/account/account-window.tsx"
    note="Les sections dépendent du rôle ; seules celles qui servent aujourd'hui existent. En bas de Mon compte, sous un filet, Supprimer mon compte : le seul bouton rouge et plein de la section. Il ouvre la confirmation, et ne supprime rien ici."
  >
    <Block title="États">
      <StateRow name="Un streamer, sur sa fresque" detail="Échap ou Fermer, le focus revient au bouton.">
        <OpenWindow>
          {({ isOpen, close }) => <AccountWithDeletion isOwner isOpen={isOpen} close={close} />}
        </OpenWindow>
      </StateRow>
      <StateRow
        name="Un viewer, sur la fresque d'un autre"
        detail="Ici, avec Modération : il y est modérateur."
      >
        <OpenWindow>
          {({ isOpen, close }) => <AccountWithDeletion isOwner={false} isOpen={isOpen} close={close} />}
        </OpenWindow>
      </StateRow>
    </Block>
  </Entry>
);

type DemoScene = { name: string; detail?: string; start: Scene };

const SCENES: readonly DemoScene[] = [
  {
    name: "Un streamer ou un viewer, où que la fenêtre s'ouvre",
    detail:
      "La même liste pour tous : chaque compte a une fresque dès sa première connexion, et la suppression l'efface toujours. Supprimer mon compte montre le verrou, puis la fenêtre se ferme.",
    start: { status: "idle", failure: null },
  },
  {
    name: "Une erreur avant l'effacement",
    detail: "La fenêtre reste ouverte et le dit : rien n'est perdu, le compte reste, on peut réessayer.",
    start: { status: "failed", failure: "failed" },
  },
  {
    name: "Une session qui n'est plus valide",
    detail: "Se connecter, puis réessayer.",
    start: { status: "failed", failure: "unauthenticated" },
  },
];

const DeleteAccountRow = ({ name, detail, start }: DemoScene) => {
  const confirmation = useConfirmation(start);
  return (
    <StateRow name={name} detail={detail}>
      <Button label="Ouvrir la fenêtre" onPress={confirmation.open} />
      <DeleteAccountWindow {...confirmation.props} />
    </StateRow>
  );
};

export const DeleteAccountWindowEntry = () => (
  <Entry
    slug="supprimer-son-compte"
    components={["DeleteAccountWindow"]}
    file="ui/account/delete-account-window.tsx"
    note={`${DIALOG_NOTE} La seule confirmation : ni motif, ni pause. Elle ne parle ni des dons, ni des VOD, ni des clips. Pendant l'effacement le bouton attend ; la page rentre ensuite à l'accueil, déconnectée, avec le toast « Compte supprimé ».`}
    where="Au milieu de l'écran"
  >
    <Block title="États">
      {SCENES.map((scene) => (
        <DeleteAccountRow key={scene.name} {...scene} />
      ))}
    </Block>
  </Entry>
);
