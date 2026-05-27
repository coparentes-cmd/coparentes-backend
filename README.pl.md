# Coparentes — uruchomienie lokalne (PL)

Instrukcja krok po kroku dla **backendu** (Node.js) i **aplikacji Flutter Web** na Macu.

---

## Wymagania

| Narzędzie | Wersja |
|-----------|--------|
| Node.js | 20+ |
| PostgreSQL | 14+ (lub Docker przez `npm run db:up`) |
| Flutter | 3.x (SDK Dart 3+) |
| Chrome | do testów web |

Opcjonalnie: Git, Docker Desktop (dla bazy).

---

## Część 1 — Backend API

### 1. Sklonuj / otwórz projekt

```bash
cd ~/Desktop/coparentes-backend-main
```

### 2. Konfiguracja środowiska

```bash
cp .env.example .env
```

Edytuj `.env` — minimum:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/coparentes
FRONTEND_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
PORT=3000
NODE_ENV=development
ALLOW_SEED=true
SEED_DEMO_DATA=true
```

> W produkcji **nie ustawiaj** `ALLOW_SEED` ani `SEED_DEMO_DATA`.

### 3. Zależności i baza

```bash
npm install
npm run db:up          # uruchamia PostgreSQL w Dockerze (jeśli masz Docker)
npm run db:migrate     # migracje Prisma (w tym ExportJob.expiresAt)
```

Jeśli nie używasz Dockera, utwórz bazę ręcznie i ustaw `DATABASE_URL`.

### 4. Uruchom serwer

```bash
npm run dev
```

Powinieneś zobaczyć: `Coparentes API listening on port 3000`.

### 5. Sprawdź, czy działa

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl http://localhost:3000/api/health
# {"status":"ok","service":"coparentes-backend",...}
```

Testy automatyczne:

```bash
npm test
# 20 testów (contract + security) — wszystkie powinny przejść
```

### 6. Konta demo (gdy SEED_DEMO_DATA=true)

| Email | Hasło | Rola |
|-------|-------|------|
| anna@coparentes.app | Coparentes!123 | parentA |
| marek@coparentes.app | Coparentes!123 | parentB |

Kod workspace (demo): `KOWALSCY2026`

---

## Część 2 — Aplikacja Flutter (Web)

### 1. Otwórz projekt

```bash
cd ~/Desktop/Coparentes-App-vol-2-main
```

### 2. Zależności

```bash
flutter pub get
flutter analyze
flutter test
```

### 3. Uruchom z backendem lokalnym

W **trybie debug** aplikacja domyślnie łączy się z `http://localhost:3000/api` — backend musi działać (Część 1).

```bash
flutter run -d chrome
```

Alternatywnie stały port (zgodny z CORS):

```bash
flutter run -d web-server --web-port=8080
```

Otwórz: http://localhost:8080

### 4. Build pod Netlify / produkcję

```bash
flutter build web \
  --dart-define=COPARENTES_API_BASE_URL=https://TWOJ-BACKEND.up.railway.app/api
```

Backend musi mieć w `CORS_ORIGINS` adres Twojej aplikacji web.

---

## Część 3 — Szybki test ręczny (happy path)

1. Zarejestruj nową przestrzeń (Parent A).
2. Dodaj dziecko w onboardingu.
3. Skopiuj **kod zaproszenia** z ustawień.
4. Wyloguj się → **Dołącz** jako Parent B (inny email).
5. Dodaj wydatek w Finansach — sprawdź podział Parent A / B.
6. Wyślij wiadomość w wątku.
7. Utwórz eksport — status powinien pochodzić z API.

---

## Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---------|-------------|
| CORS w konsoli przeglądarki | Dodaj URL frontu do `CORS_ORIGINS` i `FRONTEND_URL` |
| `Can't reach database` | Sprawdź `DATABASE_URL`, uruchom `npm run db:up` |
| 401 po odświeżeniu | Wyloguj i zaloguj ponownie; wyczyść localStorage |
| `npm test` pada | `npm run db:generate`; sprawdź Node 20+ |
| Flutter nie widzi API | Backend na porcie 3000; firewall; `curl /health` |

---

## CI (GitHub Actions)

Po pushu na GitHub workflow `.github/workflows/test.yml` uruchamia `npm test` automatycznie.

---

## Powiązane pliki

- Konfiguracja env: [`.env.example`](.env.example)
- API (EN): [`README.md`](README.md)
- Aplikacja Flutter: `../Coparentes-App-vol-2-main/README.pl.md`
