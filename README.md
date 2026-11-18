# Homelab Hub

Dashboard intranet leggera per la rete di casa (**Next.js 16** + **React 19** + SQLite). Pensata per girare su **Raspberry Pi** (arm64) dietro Docker, con collegamenti raggruppati in cartelle, icone e analisi host/porte usati dai link.

## Avvertenza sicurezza (LAN)

Questa applicazione **non include ancora login o autenticazione**. È progettata per l'uso **solo nella LAN**. **Non esporla su Internet** senza un reverse proxy con autenticazione e TLS.

## Requisiti

- Docker e Docker Compose
- **Node.js 22** (LTS) per sviluppo locale; immagine Docker `node:22-bookworm-slim` (build rapida su arm64)
- Porta **5000** libera sull'host (mappata alla 3000 del container)

## Avvio rapido (produzione)

```bash
cp .env.example .env   # opzionale: personalizza DATABASE_URL e UID/GID
docker compose build
docker compose up -d
```

Apri `http://<ip-del-pi>:5000`.

### Permessi su Raspberry Pi

Il container gira come utente **`node`** (default **UID/GID 1000**). Se `./data` o `./public/uploads` esistono già con permessi root:

```bash
sudo chown -R 1000:1000 ./data ./public/uploads
```

Se usi un altro UID/GID, imposta `APP_UID` / `APP_GID` in `.env` prima di `docker compose build` (il Dockerfile rimappa l'utente `node` con `usermod`/`groupmod`).

## Database

- Percorso predefinito: **`./data/intranet.db`** (`DATABASE_URL=file:./data/intranet.db`)
- Modalità **WAL**, timeout busyness 5s, **foreign keys** attive dopo le migrazioni
- **Migrazioni versionate** (`PRAGMA user_version`): alla partenza, se ci sono migrazioni in sospeso, viene creato un backup in `./data/backups/intranet-YYYYMMDD-HHMMSS.db` (mantenuti gli ultimi 10)

Le migrazioni sono additive e **non cancellano** tabelle o dati esistenti.

### Database legacy (`database.db` nella root del progetto)

Versioni precedenti potevano usare `./database.db` invece di `./data/intranet.db`. Prima dell'aggiornamento:

```bash
docker compose down
cp -a data data.bak.$(date +%Y%m%d)   # backup della cartella data, se esiste
cp -a database.db database.db.bak.$(date +%Y%m%d) 2>/dev/null || true
mkdir -p data
# Solo se data/intranet.db non esiste o è vuoto (0 byte):
if [ ! -s data/intranet.db ] && [ -f database.db ]; then
  cp -a database.db data/intranet.db
fi
# Lascia database.db.bak originale; non cancellare database.db finché non hai verificato l'app
```

## Sviluppo locale

```bash
npm ci
npm run dev
```

Build di produzione:

```bash
npm run build
npm run start
```

Test migrazioni:

```bash
npm run test:migrations
```

## Aggiornamento su Raspberry Pi

1. **Backup** obbligatorio (vedi sopra per `data/` e eventuale `database.db`).
2. `docker compose down`
3. `git pull origin main`
4. Migra il DB legacy se necessario (comandi nella sezione Database).
5. `sudo chown -R 1000:1000 ./data ./public/uploads`
6. `docker compose build --no-cache && docker compose up -d`
7. Verifica: `curl -s http://localhost:5000/api/health`

Al primo avvio dopo un upgrade con nuove migrazioni SQLite, viene creato un backup automatico in `data/backups/`.

### Upgrade a Next.js 16 (da 14.x)

- API route con `dynamic = 'force-dynamic'` (nessuna cache implicita delle GET).
- Le fetch client verso `/api/*` usano `cache: 'no-store'`.
- Immagine Docker: **Node 22 Alpine**; runtime come utente `node`.

## Upload icone

Le immagini caricate finiscono in `./public/uploads` (volume montato). Tipi ammessi: PNG, JPEG, WebP, GIF, ICO (max 2 MB; SVG non ammesso). Al caricamento vengono **ridimensionate a max 128px** e salvate in **WebP** (se Sharp fallisce, si conserva l’originale validato).

In modalità **standalone**, i file aggiunti a runtime non sono serviti come statici: le richieste `/uploads/...` passano dalla route dinamica `/api/uploads/...`.

Per trovare icone rotte (0 byte o mancanti sul disco):

```bash
npm run audit:uploads
# sul Pi: docker compose exec homelab-hub npm run audit:uploads
```

### Ottimizzazione favicon e icone esistenti

Dopo il deploy (o in sviluppo, con `npm ci`):

```bash
# In locale sul repository
npm run optimize:icons
```

Sul **Raspberry Pi** (con container già avviato e volume `./public/uploads` montato):

```bash
docker compose exec homelab-hub npm run optimize:icons
```

Se `npm` non è disponibile nel container standalone:

```bash
docker compose exec homelab-hub sh -c "node scripts/optimize-favicon.mjs && node scripts/optimize-uploads.mjs"
```

Cosa fa:

- **`optimize:favicon`**: da `public/favicon.png` genera `public/icons/favicon-{32,180,192,512}.{png,webp}` e aggiorna `favicon.ico` (usati da `metadata.icons` in Next.js).
- **`optimize:uploads`**: backup in `data/backups/uploads-*`, comprime i file in `public/uploads` (stesso percorso; GIF/ICO convertiti in WebP con aggiornamento automatico del campo `links.icon` nel DB).

Non committare `data/` né il database di produzione.

## Ambienti di accesso

Ogni collegamento può avere **fino a tre URL** (esterno, FQDN locale, IP LAN) e un **tipo di risorsa**:

| Tipo | Comportamento |
|------|----------------|
| **Solo locale** | Raggiungibile solo dalla LAN/VPN; fuori rete locale la tile è visibile ma bloccata (lucchetto). |
| **Solo VPN** | Come sopra, pensato per indirizzi Tailscale/vpn. |
| **Locale esposta** | In LAN usa URL locale/IP; da Internet usa l’URL esterno. |
| **Esterna** | Usa solo l’URL esterno quando sei «esterno». |

### Rilevamento automatico

Il server deduce l’ambiente dal header **`Host`** (o **`X-Forwarded-Host`** dietro reverse proxy):

- IPv4 privata (RFC1918, loopback) → rete **IP**
- Suffissi locali (default `.lan`, `.home.arpa`, `.local`, `.internal`; variabile `LOCAL_SUFFIXES`)
- Range VPN (default **Tailscale** `100.64.0.0/10`; variabile `VPN_RANGES`)
- Tutto il resto → **esterno**

Nella dashboard, un chip in header mostra l’ambiente rilevato; puoi forzarlo (**Auto / Esterno / Locale / IP / VPN**) con un override salvato in cookie.

### Migrazioni 003–004

All’avvio, la migrazione **003** aggiunge le colonne URL multipli e **copia** l’`url` legacy nel campo coerente (euristica su IP/FQDN locale/esterno), **senza modificare** la colonna `url` originale (rimane fallback).

La migrazione **004** corregge i record con `url_external` valorizzato ma `access_type` ancora `local_only`/`vpn_only` (dedotti dalla 003): diventano `local_exposed` o `external`. In modalità **Esterno**, se esiste `url_external` il link non viene mai bloccato.

### Test

```bash
npm test                  # migrazioni + ambienti
npm run test:environment
```

## Licenza

MIT — Copyright Marco Piccinni (vedi [LICENSE](LICENSE)).