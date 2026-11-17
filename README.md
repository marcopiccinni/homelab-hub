# Homelab Hub

Dashboard intranet leggera per la rete di casa (Next.js 14 + SQLite). Pensata per girare su **Raspberry Pi** (arm64) dietro Docker, con collegamenti raggruppati in cartelle, icone e analisi host/porte usati dai link.

## Avvertenza sicurezza (LAN)

Questa applicazione **non include ancora login o autenticazione**. È progettata per l'uso **solo nella LAN**. **Non esporla su Internet** senza un reverse proxy con autenticazione e TLS.

## Requisiti

- Docker e Docker Compose
- Porta **5000** libera sull'host (mappata alla 3000 del container)

## Avvio rapido (produzione)

```bash
cp .env.example .env   # opzionale: personalizza DATABASE_URL e UID/GID
docker compose build
docker compose up -d
```

Apri `http://<ip-del-pi>:5000`.

### Permessi su Raspberry Pi

Il container gira come utente non-root (default **UID/GID 1000**, utente `pi`). Se `./data` o `./public/uploads` esistono già con permessi root:

```bash
sudo chown -R 1000:1000 ./data ./public/uploads
```

Se usi un altro UID/GID, imposta `APP_UID` / `APP_GID` in `.env` prima di `docker compose build`.

## Database

- Percorso predefinito: `./data/intranet.db` (`DATABASE_URL=file:./data/intranet.db`)
- Modalità **WAL**, timeout busyness 5s, **foreign keys** attive dopo le migrazioni
- **Migrazioni versionate** (`PRAGMA user_version`): alla partenza, se ci sono migrazioni in sospeso, viene creato un backup in `./data/backups/intranet-YYYYMMDD-HHMMSS.db` (mantenuti gli ultimi 10)

Le migrazioni sono additive e **non cancellano** tabelle o dati esistenti.

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

## Aggiornamento dal vecchio container di sviluppo

1. **Backup** obbligatorio: copia `./data` (almeno `intranet.db`) in un posto sicuro.
2. Ferma il vecchio stack: `docker compose down`.
3. Aggiorna il repository (`git pull`).
4. Sistemando i permessi: `sudo chown -R 1000:1000 ./data ./public/uploads`.
5. Ricostruisci e avvia: `docker compose build --no-cache && docker compose up -d`.
6. Al primo avvio le migrazioni aggiornano `user_version` e, se necessario, correggono `folder_id` orfani; viene creato un backup automatico se servono migrazioni nuove.

## Upload icone

Le immagini caricate finiscono in `./public/uploads` (volume montato). Tipi ammessi: PNG, JPEG, WebP, GIF, ICO (max 2 MB; SVG non ammesso).

## Licenza

MIT — Copyright Marco Piccinni (vedi [LICENSE](LICENSE)).