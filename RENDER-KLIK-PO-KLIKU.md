# Coparentes backend — Render krok po kroku prostymi słowami

## Co masz w tej paczce
To jest mała paczka tylko do backendu.
Wrzucasz ją do osobnego repo na GitHub, a potem podłączasz do Render.

W środku są tylko rzeczy potrzebne do backendu:
- `src/`
- `package.json`
- `package-lock.json`
- `Dockerfile`
- `.dockerignore`
- `render.yaml`
- `.env.production.example`

---

## Co zrobisz po kolei
1. rozpakujesz paczkę
2. wrzucisz ją na GitHub
3. połączysz repo z Render
4. utworzysz nową usługę Web Service
5. dodasz dysk
6. wpiszesz zmienne środowiskowe
7. uruchomisz deploy
8. skopiujesz adres backendu
9. wkleisz ten adres do Netlify z `/api` na końcu

---

# Część 1 — GitHub
## Krok 1
Pobierz i rozpakuj paczkę.

## Krok 2
Wejdź na GitHub i utwórz nowe repo, na przykład:
`coparentes-backend`

## Krok 3
Wrzuć do repo **wszystkie pliki z wnętrza tej paczki**.

Po wrzuceniu, na głównym poziomie repo powinieneś widzieć od razu:
- `render.yaml`
- `Dockerfile`
- `package.json`
- folder `src`

Jeśli to widzisz, wszystko jest dobrze.

---

# Część 2 — Render
## Krok 1
Wejdź na:
`https://dashboard.render.com`
i zaloguj się.

## Krok 2
Kliknij:
**New +**

## Krok 3
Kliknij:
**Web Service**

## Krok 4
Połącz GitHub z Render, jeśli Render o to poprosi.

## Krok 5
Wybierz repozytorium z backendem, czyli to które przed chwilą utworzyłeś.

---

# Część 3 — ustawienia usługi w Render
Na ekranie tworzenia usługi ustaw:

## Name
Wpisz:
`coparentes-backend`

## Region
Zostaw domyślne albo wybierz region najbliżej Europy.

## Branch
Wybierz:
`main`

## Runtime
Jeśli Render sam wykryje Docker, zostaw jak jest.

## Root Directory
Zostaw puste.

---

# Część 4 — zmienne środowiskowe
Musisz dodać te wartości.
W Render klikaj **Environment** albo sekcję zmiennych.

Dodaj po kolei:

## 1
Key:
`NODE_ENV`
Value:
`production`

## 2
Key:
`HOST`
Value:
`0.0.0.0`

## 3
Key:
`PORT`
Value:
`4000`

## 4
Key:
`COPARENTES_PUBLIC_BASE_URL`
Value:
Tutaj wpiszesz później własny adres Render, gdy już usługa powstanie.
Na start możesz tymczasowo wpisać:
`https://coparentes-backend.onrender.com`

Jeśli Render nada inny adres, potem to poprawisz.

## 5
Key:
`COPARENTES_ALLOWED_ORIGINS`
Value:
Tutaj wpisz adres swojego frontendu z Netlify.
Przykład:
`https://keen-sunburst-6e5083.netlify.app`

Jeśli masz też własną domenę, możesz wpisać kilka adresów oddzielonych przecinkiem.
Przykład:
`https://keen-sunburst-6e5083.netlify.app,https://coparentes.ai,https://www.coparentes.ai`

## 6
Key:
`COPARENTES_DB_PATH`
Value:
`/var/lib/coparentes/coparentes.db`

## 7
Key:
`COPARENTES_SEED_DEMO_DATA`
Value:
`false`

## 8
Key:
`COPARENTES_TRUST_PROXY`
Value:
`true`

## 9
Key:
`COPARENTES_JSON_LIMIT`
Value:
`1mb`

## 10
Key:
`COPARENTES_SESSION_TTL_DAYS`
Value:
`30`

## 11
Key:
`COPARENTES_LOG_REQUESTS`
Value:
`false`

---

# Część 5 — dysk
To ważne.
Ta wersja backendu używa SQLite, więc w Render trzeba dodać dysk.

## Kliknij sekcję Disk
Dodaj dysk z takimi wartościami:

### Name
`coparentes-data`

### Mount path
`/var/lib/coparentes`

### Size
`1 GB`

---

# Część 6 — deploy
Po zapisaniu ustawień kliknij:
**Create Web Service**
albo
**Deploy Web Service**

Poczekaj aż Render skończy budowanie.

---

# Część 7 — znajdź adres backendu
Po udanym deployu Render pokaże publiczny adres usługi.
Będzie wyglądał mniej więcej tak:
`https://coparentes-backend-xxxx.onrender.com`

Skopiuj ten adres.

Potem dopisz na końcu:
`/api`

Czyli finalnie do Netlify wpiszesz na przykład:
`https://coparentes-backend-xxxx.onrender.com/api`

---

# Część 8 — test backendu
Otwórz w przeglądarce:
`https://TWOJ-ADRES.onrender.com/api/health`

Jeśli zobaczysz odpowiedź JSON albo status, to znaczy że backend działa.

Możesz też sprawdzić:
`https://TWOJ-ADRES.onrender.com/api/ready`

---

# Część 9 — co wpisać potem do Netlify
W Netlify, w zmiennej:
`COPARENTES_API_BASE_URL`
wpisujesz:
`https://TWOJ-ADRES.onrender.com/api`

To jest bardzo ważne: z `/api` na końcu.

---

# Najkrótsza wersja
1. wrzuć paczkę backendu na GitHub
2. w Render kliknij New + -> Web Service
3. wybierz repo
4. dodaj env vars
5. dodaj dysk
6. kliknij deploy
7. skopiuj adres Render
8. dopisz `/api`
9. wklej do Netlify
