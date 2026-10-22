// Le décor d'iPhone de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : l'îlot, la barre d'état (l'heure, le réseau, le wifi, la batterie) et
// la barre d'accueil, en formes seulement. Décoratif pour un lecteur d'écran. Le serveur l'écrit avec la place du téléphone ;
// home.css le masque sur un écran étroit, où le vrai téléphone du visiteur en tient lieu.

export const PhoneChrome = () => (
  <div className="lp-home-chrome" aria-hidden="true">
    <div className="lp-home-statusbar">
      <span className="lp-home-time">9:41</span>
      <span className="lp-home-status-icons">
        <svg className="lp-home-signal" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="10" y="3" width="3" height="9" rx="0.8" />
          <rect x="15" y="0" width="3" height="12" rx="0.8" />
        </svg>
        <svg className="lp-home-wifi" viewBox="0 0 17 12" fill="currentColor" aria-hidden="true">
          <path d="M8.5 2.2c2.5 0 4.7 1 6.4 2.7l-1.2 1.2C12.3 4.8 10.5 4 8.5 4S4.7 4.8 3.3 6.1L2.1 4.9C3.8 3.2 6 2.2 8.5 2.2Z" />
          <path d="M8.5 5.6c1.5 0 2.8.6 3.9 1.6l-1.2 1.2c-.7-.7-1.6-1.1-2.7-1.1s-2 .4-2.7 1.1L4.6 7.2c1.1-1 2.4-1.6 3.9-1.6Z" />
          <path d="M8.5 8.9c.7 0 1.3.3 1.8.7L8.5 11.5 6.7 9.6c.5-.4 1.1-.7 1.8-.7Z" />
        </svg>
        <svg className="lp-home-battery" viewBox="0 0 27 13" fill="currentColor" aria-hidden="true">
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="12"
            rx="3.5"
            fill="none"
            stroke="currentColor"
            opacity="0.4"
          />
          <rect x="2" y="2" width="19" height="9" rx="2" />
          <path d="M24 4.5v4c.8-.3 1.5-1.1 1.5-2s-.7-1.7-1.5-2Z" opacity="0.5" />
        </svg>
      </span>
    </div>
    <i className="lp-home-island" />
    <i className="lp-home-homebar" />
  </div>
);
