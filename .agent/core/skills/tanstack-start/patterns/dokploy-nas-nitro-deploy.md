# Déployer Start sur Dokploy (sur un NAS only)

> **Règle :** Start n’est pas un SPA — build Nitro Node + Dockerfile + volume données + host Traefik **et** route du reverse-proxy NAS → chaîne complète jusqu’au navigateur.

### ❌ Avant — Nixpacks / static / domaine Dokploy seul
```ts
// vite.config.ts — pas de Nitro
plugins: [tanstackStart(), viteReact()]

// package.json — pas de start production
"build": "vite build"
// Dokploy : buildType = nixpacks | static
// Domaine Traefik OK, mais Caddy NAS (nas-router) sans route pour monapp.nas
```
Pas de `.output/server` · Nixpacks casse Start · `nas-router: no route` malgré hosts OK · SQLite effacée à chaque redeploy.

**Le faux ami** — ouvrir `http://IP_LAN/` ou générer un `*.sslip.io` :
```text
http://192.168.1.98/          # ⚠️ Traefik route sur Host, pas sur l’IP seule
https://xxx.sslip.io          # ⚠️ IP publique · contraire à un usage LAN-only
```

### ✅ Après — Nitro + Docker + volume + double routage
```ts
// vite.config.ts
plugins: [tanstackStart(), nitro(), viteReact()]

// package.json
"build": "vite build",
"start": "node .output/server/index.mjs"
```
```dockerfile
# Dockerfile (multi-stage) — build Linux = binaires natifs corrects
CMD ["node", ".output/server/index.mjs"]
# ENV: HOST=0.0.0.0 PORT=3000  + volume /app/data
```
```text
# Dokploy
buildType=dockerfile · domaine monapp.nas → :3000 · volume nommé → /app/data

# NAS (devant Traefik) — même pattern que dokploy.nas
# /home/.../dns-router/Caddyfile
monapp.nas { reverse_proxy <cible-traefik> }

# Client
IP_LAN_NAS  monapp.nas   # hosts ou dnsmasq local
```
Artefact Node portable · persistance SQLite · Host résolu **et** routé jusqu’à l’app.

### Les 5 changements qui font tout
| Quoi | Où | Rôle |
|---|---|---|
| `nitro()` + script `start` | `vite.config.ts` / `package.json` | produit `.output/server/index.mjs` |
| Dockerfile multi-stage | racine repo | build reproductible sur le NAS (Linux) |
| Volume nommé → `/app/data` | Dokploy mounts | SQLite survit aux redeploys |
| Domaine Traefik `monapp.nas` | Dokploy domains | route Host → conteneur `:3000` |
| Bloc Caddy `monapp.nas` | `dns-router/Caddyfile` | nas-router laisse passer vers Traefik |

### Pourquoi ça marche
- Nitro est la couche d’hébergement Node de Start ; sans lui, Dokploy n’a pas de serveur démarrable.
- Sur ce NAS, Caddy (`nas-router`) occupe `:80` **avant** Traefik : un domaine Dokploy sans entrée Caddy = 404 `no route`.
- Le volume découple le cycle de vie du conteneur de celui du fichier SQLite.

### Gotchas
- Hosts / DNS seuls ne suffisent pas si `nas-router` n’a pas la route (erreur vue : `nas-router: no route for journal.nas`).
- Builder l’image **sur le NAS** (Dockerfile) : un `.output` tracé sous Windows embarque les natifs `win32` (libsql) → cassé en Linux.
- Pas de port host publié si Traefik + Caddy suffisent ; l’IP nue sans Host n’atteint pas l’app.
- Middleware LAN Traefik ≠ firewall NAS : la couche Caddy/DNS reste hors Dokploy.
