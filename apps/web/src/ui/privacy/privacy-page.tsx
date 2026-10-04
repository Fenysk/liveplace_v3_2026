// `/confidentialite` : politique de confidentialité (aucun script AdSense sur cette page).

import { Button } from "../design/button";
import { AdChoice } from "./ad-choice";

const CONTACT_MAIL = "fenysk.pro@gmail.com";
const SITE_URL = "https://liveplace.tv";
const SITE_HOST = "liveplace.tv";

const Todo = ({ children }: { children: string }) => <span className="lp-privacy-todo">{children}</span>;

export const PrivacyPage = () => (
  <main className="lp-privacy">
    <div className="lp-void" aria-hidden="true" />
    <header className="lp-privacy-bar">
      <a href="/" className="lp-privacy-brand lp-type-heading">
        LivePlace
      </a>
      <Button href="/" label="Retour" variant="ghost" />
    </header>
    <article className="lp-pill lp-privacy-sheet">
      <header className="lp-privacy-intro">
        <h1 className="lp-type-heading">Politique de confidentialité</h1>
        <p className="lp-type-caption lp-muted">Dernière mise à jour : 4 octobre 2026</p>
        <div className="lp-privacy-meta">
          <Button href={SITE_URL} label={SITE_HOST} isNewTab />
          <Button href={`mailto:${CONTACT_MAIL}`} label={CONTACT_MAIL} />
        </div>
      </header>

      <section className="lp-privacy-section" aria-labelledby="privacy-who">
        <h2 id="privacy-who" className="lp-type-title">
          1. Qui est responsable ?
        </h2>
        <p className="lp-type-body">
          LivePlace (<Todo>[LEGAL_ENTITY]</Todo>, <Todo>[LEGAL_ADDRESS]</Todo>) est responsable du traitement
          des données collectées via {SITE_URL}.
        </p>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-what">
        <h2 id="privacy-what" className="lp-type-title">
          2. Qu&apos;est-ce que LivePlace ?
        </h2>
        <p className="lp-type-body">
          LivePlace permet de collaborer sur un canvas de pixels associé au compte Twitch d&apos;un streamer (
          <code className="lp-type-kbd">/&#123;login&#125;</code>
          ), notamment poser des pixels, inspecter une case, et (selon les droits) modérer.
        </p>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-data">
        <h2 id="privacy-data" className="lp-type-title">
          3. Données que nous traitons
        </h2>
        <ul className="lp-type-body lp-privacy-list">
          <li>
            <strong>Identifiants Twitch</strong> (id, login, nom d&apos;affichage, avatar) — connexion OAuth —
            compte et droits sur le canvas — conservation tant que le compte existe, plus la durée de session
            (<Todo>[RETENTION_SESSION]</Todo>).
          </li>
          <li>
            <strong>Adresse e-mail Twitch</strong> (si fournie) — conservation technique ; aucun envoi sans
            consentement séparé.
          </li>
          <li>
            <strong>Session</strong> (cookie HttpOnly) — rester connecté de façon sécurisée.
          </li>
          <li>
            <strong>Contenu du canvas</strong> (pixels, auteurs, modération) — fonctionnement du jeu.
          </li>
          <li>
            <strong>Logs techniques</strong> (IP, user-agent, horodatage) — sécurité et diagnostic —{" "}
            <Todo>[RETENTION_LOGS]</Todo>.
          </li>
          <li>
            <strong>Choix de consentement publicité</strong> (accepté / refusé) — souvenir de ton choix —{" "}
            <Todo>[RETENTION_CONSENT]</Todo>, modifiable à tout moment depuis la section Publicité de cette
            page.
          </li>
          <li>
            <strong>Données liées aux publicités</strong> — Google AdSense, seulement si tu acceptes — pubs
            non personnalisées, mesure agrégée, limitation de fréquence, lutte contre la fraude.
          </li>
        </ul>
        <p className="lp-type-body lp-privacy-aside">Nous ne vendons pas tes données.</p>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-ads">
        <h2 id="privacy-ads" className="lp-type-title">
          4. Publicité (Google AdSense)
        </h2>
        <p className="lp-type-body">
          Sur les pages canvas (<code className="lp-type-kbd">/&#123;login&#125;</code>), LivePlace peut
          afficher des publicités Google AdSense uniquement si tu acceptes via le bandeau de consentement.
        </p>
        <AdChoice />
        <ul className="lp-type-body lp-privacy-list">
          <li>Les publicités sont en mode non personnalisé (pas de ciblage sur ton historique).</li>
          <li>
            Même dans ce mode, Google peut utiliser des cookies ou identifiants pour la limitation de
            fréquence, les rapports agrégés et la lutte contre la fraude.
          </li>
          <li>Si tu refuses : aucun script AdSense n&apos;est chargé, aucune pub n&apos;est affichée.</li>
          <li>
            Partenaire :{" "}
            <a
              className="lp-link"
              href="https://policies.google.com/technologies/partner-sites"
              rel="noopener noreferrer"
            >
              Comment Google utilise les données
            </a>
            .
          </li>
          <li>
            Paramètres pubs Google :{" "}
            <a className="lp-link" href="https://adssettings.google.com/" rel="noopener noreferrer">
              adssettings.google.com
            </a>
            .
          </li>
        </ul>
        <p className="lp-type-body">La vue OBS / stream n&apos;affiche pas de publicités LivePlace.</p>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-cookies">
        <h2 id="privacy-cookies" className="lp-type-title">
          5. Cookies et stockage local
        </h2>
        <ul className="lp-type-body lp-privacy-list">
          <li>
            <strong>Strictement nécessaires</strong> — cookie de session LivePlace — pas de consentement pub.
          </li>
          <li>
            <strong>Préférences</strong> — thème, choix de consentement pub.
          </li>
          <li>
            <strong>Publicité</strong> — cookies Google AdSense — consentement requis ; refus = pas de pub.
          </li>
        </ul>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-recipients">
        <h2 id="privacy-recipients" className="lp-type-title">
          6. Destinataires
        </h2>
        <p className="lp-type-body">
          Hébergeurs nécessaires au service, Twitch (authentification), et Google (AdSense) uniquement en cas
          d&apos;acceptation du consentement pub.
        </p>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-rights">
        <h2 id="privacy-rights" className="lp-type-title">
          7. Tes droits (RGPD)
        </h2>
        <p className="lp-type-body">
          Accès, rectification, effacement, limitation, opposition, portabilité (quand applicable), et retrait
          du consentement à tout moment. Pour exercer un droit :{" "}
          <a className="lp-link" href={`mailto:${CONTACT_MAIL}`}>
            {CONTACT_MAIL}
          </a>
          . Réclamation :{" "}
          <a className="lp-link" href="https://www.cnil.fr/" rel="noopener noreferrer">
            CNIL
          </a>
          .
        </p>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-minors">
        <h2 id="privacy-minors" className="lp-type-title">
          8. Mineurs
        </h2>
        <p className="lp-type-body">
          LivePlace n&apos;est pas destiné aux enfants de moins de <Todo>[AGE_MINIMUM]</Todo> ans (ou âge de
          consentement numérique applicable).
        </p>
      </section>

      <section className="lp-privacy-section" aria-labelledby="privacy-changes">
        <h2 id="privacy-changes" className="lp-type-title">
          9. Modifications
        </h2>
        <p className="lp-type-body">
          Cette politique peut évoluer. La date en tête de page fait foi. En cas de changement important, un
          nouveau consentement pourra être demandé.
        </p>
      </section>
    </article>
  </main>
);
