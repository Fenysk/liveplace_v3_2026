// Les Nouveautés (CDC 2026) : la section de la fenêtre pour chaque public, sur mobile aussi, et les dix-huit vignettes, toutes animées.
// Les vrais composants, avec les vraies publications : une vignette se clique, et s'ouvre en grand sur un flou.

import { ReleaseList } from "../release-notes/release-list";
import { ReleaseShot } from "../release-notes/release-shot";
import { Block, Entry, InPhone, InWindow, StateRow } from "./entry-layout";

const SHOTS = [
  {
    kind: "archives",
    name: "Archive et recommence",
    detail:
      "Animée : une pile de trois mini-fresques parmi six, chacune ses pixel arts (champignon, épée, fantôme…) ; la pile recule : celle de devant passe au milieu, celle du milieu derrière, celle de derrière s'en va en fondu, une neuve entre devant en fondu, jamais une fresque déjà passée. Fixe : la pile telle quelle.",
  },
  {
    kind: "backgrounds",
    name: "Choisis ton fond",
    detail:
      "Animée : le vrai choix du fond (damier, noir, blanc) en petit, puis l'image ; l'aperçu change en fondu court. L'image se pose par-dessus n'importe quel fond, à 40 %. Fixe : l'image sur le blanc.",
  },
  {
    kind: "growth",
    name: "La fresque grandit seule",
    detail:
      "Animée : un pixel art entier se pose à chaque étape (champignon, étoile, fantôme, couronne, chat), la fresque s'agrandit en glissant, en boucle de 4,8 s.",
  },
  {
    kind: "scoreboard",
    name: "Le classement",
    detail:
      "Animée : toutes les 1,6 s, un autre passe premier. De gauche à droite : la place (1er, 2e, 3e ; 1st, 2nd, 3rd), l'anneau, le pseudo. L'anneau et le pseudo suivent la place, le numéro reste celui de la place.",
  },
  {
    kind: "moderation",
    name: "Modération facile",
    detail:
      "Animée : la pill Compte en haut à droite d'une mini-fresque ; un point rouge paraît sur le bouclier, un curseur le clique, la liste des signalements s'ouvre dessous. Fixe : le point rouge sur le bouclier.",
  },
  {
    kind: "undo",
    name: "Annuler, refaire",
    detail:
      "Animée, en boucle de 8,4 s : la pill Dessin réduite (trois pastilles de couleur, Annuler, Refaire, Vider) en bas au centre d'une mini-fresque. Une souris trace un petit champignon en trois traits (le chapeau, ses points blancs, le pied), clique Annuler deux fois (le pied part, puis les points ; Refaire se dégrise), puis Refaire (les points reviennent) ; le brouillon se vide et la boucle repart. Fixe : les trois traits posés, sans la souris.",
  },
  {
    kind: "report",
    name: "Signaler un dessin",
    detail:
      "Animée, en boucle de 8,4 s : une mini-fresque (un champignon, un chat, un gribouillis gris). Une souris clique le gribouillis, la pill Inspection s'ouvre à droite (l'auteur, la case, Signaler), la souris clique Signaler, une petite fenêtre demande « Signaler ce dessin de Kira ? » sur un voile, la souris confirme : le bouton dit « Signalé » (grisé) et le toast « Signalement envoyé » paraît. Le gribouillis reste : signaler ne retire rien. Fixe : « Signalé » et le toast, sans souris.",
  },
  {
    kind: "eyedropper",
    name: "La pipette",
    detail:
      "Animée, en boucle de 8,4 s : la pill Dessin réduite (trois pastilles de couleur, bleue choisie, et la pipette) sous un champignon. Une souris clique la pipette (elle s'arme : l'anneau intérieur du jeu), devient l'icône de la pipette sur la fresque, clique un pixel rouge du chapeau (le pixel s'entoure un instant) : la pastille rouge est choisie et la pipette se désarme, un seul clic. Fixe : la pastille rouge choisie, sans souris.",
  },
  {
    kind: "clear",
    name: "Efface les dessins gênants",
    detail:
      "Animée, en boucle de 8,4 s : le même parcours que Signaler, avec « Effacer ses dessins » et la fenêtre « Effacer ce dessin de Kira ? » dont le bouton est rouge. Le gribouillis disparaît d'un coup à la confirmation (la modération ne s'anime jamais), l'Inspection reste ouverte ; il revient en fondu quand tout est reparti. Fixe : le gribouillis effacé, sans souris.",
  },
  {
    kind: "keyboard",
    name: "Dessiner au clavier",
    detail:
      "Animée, en boucle de 8,4 s, sans souris : une mini-fresque (un champignon) et, en bas au centre, les touches du clavier en petit (quatre flèches et Espace, la classe lp-kbd du jeu). Les flèches s'allument une à une et la case visée (le contour noir et blanc du jeu) saute de case en case ; Espace s'allume et la case se remplit : quatre pixels bleus forment un petit sourire. Fixe : le sourire dessiné, la case visée à côté du dernier pixel, les touches éteintes.",
  },
  {
    kind: "gauge",
    name: "Augmente ta jauge",
    detail:
      "Animée, en boucle de 8,4 s : la pill Dessin en Vue, en bas au centre d'une mini-fresque : la jauge pleine (l'anneau, le tube, « 20/20 ») et le +1 doré à la place de Dessiner. Une souris clique le +1 : la jauge dit « 21/21 », son tube grossit un instant, le bouton redevient « Dessiner » ; puis la pill s'efface en fondu et le +1 revient. Fixe : le +1 à côté de la jauge pleine, sans souris.",
  },
  {
    kind: "format",
    name: "Le format de la fresque",
    detail:
      "Animée, en boucle de 8,4 s : le cadre d'une fresque (un petit cœur dedans) au-dessus du sélecteur de format de la fenêtre Fresque (1:1, 16:9, 9:16, 4:3, 3:4). Une souris choisit 1:1, puis 16:9, puis 9:16 ; le cadre glisse vers chaque forme (le dernier est le format de départ, la boucle se referme sans saut). Fixe : 16:9 choisi, sans souris.",
  },
  {
    kind: "launch",
    name: "Lancement de LivePlace (bêta)",
    detail:
      "Animée, en boucle de 8,4 s : une mini-fresque et, en haut à droite, la pill Compte d'un invité (Nouveautés, l'apparence, et Se connecter aux couleurs de Twitch). Une souris clique Se connecter ; la pill devient celle du compte connecté (Nouveautés, la photo, l'apparence). La souris s'en va, puis trois dessins arrivent l'un après l'autre (un fantôme, un chat, un cœur), case après case en fondu, comme les dessins des autres viewers dans le jeu. Tout s'efface en fondu, l'invité revient. Fixe : le compte connecté et les trois dessins, sans souris.",
  },
  {
    kind: "help",
    name: "Un coup de pouce ?",
    detail:
      "Animée, en boucle de 9,6 s : la pill Dessin (la jauge à 7/10 et Valider) en bas d'une mini-fresque, et les vraies bulles d'aide du tutoriel, avec leur flèche et l'anneau autour de ce qu'elles désignent : « Clique sur la fresque pour préparer ton dessin, Valider l'envoie » (sur Valider), puis « Ta jauge se recharge toute seule » (sur la jauge). Puis la fenêtre Mon compte, réduite à sa rangée Tutoriel, s'ouvre sur un voile : une souris clique « Revoir le tuto » (le bouton de Mon compte), le toast « Le tuto repart du début » paraît, la fenêtre se ferme et la bulle de Valider revient : le tutoriel repart du début. Fixe : la bulle de Valider, sans souris.",
  },
  {
    kind: "language",
    name: "Hello world!",
    detail:
      "Animée, en boucle de 8,4 s : le choix de la langue du jeu (Français, English), celui de l'accueil et de Mon compte, au-dessus de la pill Dessin (la jauge et Dessiner). Une souris choisit English : la pill passe en anglais (« Dessiner » devient « Draw ») ; puis Français : elle revient. La vignette montre les deux langues quelle que soit celle de la page. Fixe : English choisi, la pill en anglais, sans souris.",
  },
  {
    kind: "install",
    name: "App mobile",
    detail:
      "Animée, en boucle de 8,4 s : un téléphone en petit au centre de la vignette. Son écran d'accueil montre dix-neuf applis en formes grises, sans pictogramme, et l'icône de l'appli : la pastille « LP » du manifest (les mêmes teintes sombres dans les deux apparences) sous son nom, « LP ». Un doigt (un point, pas une souris) appuie sur l'icône ; l'appli s'ouvre depuis l'icône jusqu'à remplir tout l'écran, sans barre de navigateur : la fresque (un chat et un cœur), la pill Compte et la pill Dessin du jeu. Elle reste ouverte le temps de se lire, puis se referme vers son icône. Fixe : l'appli ouverte en plein écran, sans doigt.",
  },
  {
    kind: "live",
    name: "En live sur Twitch",
    detail:
      "Animée, en boucle de 8,4 s : une mini-fresque (un champignon, un chat, un cœur). Une souris clique un pixel orange du chat ; la pill Inspection s'ouvre à droite sur son auteur (Kira, la couleur et les coordonnées de la case), avec le bouton Twitch de son profil : le logo gris, seul. Puis la personne passe en live : le bouton prend la teinte violette de Twitch, son logo un rond à l'angle, et dit la catégorie du stream (« Art »). Les deux états sont superposés : la pill ne change pas de largeur. Tout s'efface en fondu. Fixe : le bouton en live avec sa catégorie, la case entourée, sans souris.",
  },
  {
    kind: "theme",
    name: "Un thème pour la fresque",
    detail:
      "Animée, en boucle de 9 s : une mini-fresque (une épée, un coffre, une potion) et, au centre, la fenêtre Fresque réduite à son champ Thème (le libellé, le champ avec son exemple « Ex. : Halloween », la phrase « Affiché en haut de la fresque, pour tout le monde. ») sur un voile. Une souris clique le champ (l'anneau de focus du jeu, le curseur d'écriture), le thème s'écrit lettre par lettre (« Aventure », « Adventure »), puis elle clique à côté, sur la phrase d'aide : le champ perd le focus, ce qui l'enregistre (il n'a pas de bouton), et le toast « Thème enregistré » paraît. La fenêtre se ferme et la pill Thème du jeu paraît en haut au centre : « Dessine sur le thème », puis le thème en gros. Elle reste le temps de se lire, puis s'efface. Fixe : la pill Thème en haut, sans fenêtre ni souris.",
  },
] as const;

export const ReleaseNotesEntry = () => (
  <Entry
    slug="nouveautes"
    components={["ReleaseList", "ReleaseShot"]}
    file="ui/release-notes/release-list.tsx"
    note="Cinq publications datées, la plus récente en haut (1er novembre, 18 octobre, 11 octobre, 4 octobre, 27 septembre), 18 lignes en tout ; chaque nouveauté a sa vignette (une ligne qui n'en aurait pas ne serait que du texte). Des lignes sous un filet dans la fenêtre. Le rôle se lit sur la fresque où l'on est : ce qui s'adresse à tous vient d'abord, sans titre de groupe ; le streamer voit ensuite Pour les modérateurs et Pour les streamers (dans cet ordre), le modérateur Pour les modérateurs ; un viewer ou un invité ne voit que ce qui s'adresse à tous, sans aucun titre de groupe. Ouvrir la section marque tout comme lu ; le point du bouton Nouveautés s'éteint. La page /nouveautes montre les trois groupes à tous les publics (le premier sans titre), sous une phrase d'accueil : chaque nouveauté y est une carte (la vignette en haut à toute la largeur de la carte, le titre et la phrase dessous), les cartes d'un groupe en 2 colonnes dès 760 px de bloc, 3 dès 1100 px, la colonne allant jusqu'à 1200 px ; sous 760 px, les cartes l'une sous l'autre."
  >
    <Block title="La section de la fenêtre">
      <StateRow
        name="Le streamer"
        detail="Ce qui s'adresse à tous, sans titre, puis Pour les modérateurs et Pour les streamers."
      >
        <InWindow>
          <ReleaseList audiences={["owner", "moderator", "viewer"]} level={3} />
        </InWindow>
      </StateRow>
      <StateRow name="Qui modère" detail="Ce qui s'adresse à tous, sans titre, puis Pour les modérateurs.">
        <InWindow>
          <ReleaseList audiences={["moderator", "viewer"]} level={3} />
        </InWindow>
      </StateRow>
      <StateRow
        name="Un viewer ou un invité"
        detail="Ce qui s'adresse à tous seulement : aucun titre de groupe."
      >
        <InWindow>
          <ReleaseList audiences={["viewer"]} level={3} />
        </InWindow>
      </StateRow>
    </Block>
    <Block title="Sur mobile">
      <StateRow name="Un viewer ou un invité" detail="La vignette reste à droite, le texte à gauche.">
        <InPhone isWindow>
          <ReleaseList audiences={["viewer"]} level={3} />
        </InPhone>
      </StateRow>
    </Block>
    <Block
      title="Les vignettes"
      note="112 × 72 px dans une ligne, sur le fond pointillé des fresques ; sur la page, elles remplissent leur carte (les pills et le classement plafonnés à 2,5 px par unité). Un clic sur l'image les agrandit, sans icône : le curseur loupe, l'anneau du survol et celui du focus sont leurs repères. Échap, un clic à côté ou Fermer les referment. Elles ne partent pas toutes ensemble : dans l'ordre de lecture, la première part à 0, la deuxième 300 ms plus tard, la troisième à 600 ms, et ainsi de suite ; l'agrandissement garde la phase de sa carte. En mouvement réduit, aucun décalage : l'image fixe."
    >
      {SHOTS.map(({ kind, name, detail }, order) => (
        <StateRow key={kind} name={name} detail={detail} isDemo>
          <ReleaseShot kind={kind} title={name} order={order} />
        </StateRow>
      ))}
    </Block>
  </Entry>
);
