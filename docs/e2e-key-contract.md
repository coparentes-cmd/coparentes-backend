# E2E key contract (backend ↔ Flutter)

Źródło prawdy dla przechowywania i rotacji kluczy E2E. Backend **nigdy** nie interpretuje wewnętrznej struktury `privateKeyEnvelope` — traktuje go jak nieprzezroczysty string (analogicznie do `ThreadKey.encryptedKey`). Format (sól, KDF, nonce, ciphertext, wersjonowanie) jest wyłącznie sprawą klienta.

Auth: wszystkie endpointy poniżej (poza ewentualnym forgot-password) wymagają `Authorization: Bearer <sessionToken>`.

---

## Model danych (`User`)

| Pole | Typ | Opis |
|------|-----|------|
| `publicKey` | `string \| null` | X25519 public key, standard base64, dokładnie 32 bajty po dekodowaniu |
| `privateKeyEnvelope` | `string \| null` | Opaque blob klienta (max 4000 znaków). Zawiera wszystko potrzebne do lokalnego odszyfrowania klucza prywatnego hasłem użytkownika |

---

## `POST /api/user/keys`

Zapisuje (lub nadpisuje) komplet kluczy zalogowanego użytkownika. Używane przy pierwszej konfiguracji E2E oraz po resecie hasła (nowa para + nowy envelope).

### Request

```http
POST /api/user/keys
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

```json
{
  "publicKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "privateKeyEnvelope": "v1.opaque.client-defined-blob..."
}
```

| Pole | Walidacja |
|------|-----------|
| `publicKey` | niepusty string; base64 (`A–Z a–z 0–9 + /`, padding `=`, długość % 4 == 0); po dekodowaniu **dokładnie 32 bajty** |
| `privateKeyEnvelope` | string, długość **1–4000**; brak walidacji wewnętrznej struktury |

### Responses

| Status | Body | Kiedy |
|--------|------|--------|
| `200` | `{ "success": true }` | zapis OK |
| `400` | `{ "error": "invalid_public_key" }` | publicKey nie przechodzi walidacji X25519 |
| `400` | `{ "error": "invalid_request" }` | Zod (brak pól, envelope poza 1–4000, itd.) |
| `401` | (auth) | brak / nieważna sesja |

### Nadpisanie

Jeśli użytkownik miał już `publicKey` **lub** `privateKeyEnvelope`, backend loguje zdarzenie (bez wartości pól):

```
[e2e] keys overwritten userId= <id> at= <ISO8601>
```

Stare `ThreadKey` zaszyfrowane poprzednim `publicKey` stają się nieodczytywalne dla nowej pary — to oczekiwane przy utracie klucza / resecie.

---

## `GET /api/user/keys/mine`

Zwraca **wyłącznie** własne klucze `req.user.id`. **Jedyny** endpoint zwracający `privateKeyEnvelope`.

### Request

```http
GET /api/user/keys/mine
Authorization: Bearer <sessionToken>
```

### Response `200`

```json
{
  "publicKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "privateKeyEnvelope": "v1.opaque.client-defined-blob..."
}
```

Gdy pole jeszcze nie ustawione → `null`:

```json
{
  "publicKey": null,
  "privateKeyEnvelope": null
}
```

---

## `GET /api/user/:userId/public-key`

Pobiera **tylko** klucz publiczny innego członka tego samego workspace. **Nigdy** nie zwraca `privateKeyEnvelope`.

### Request

```http
GET /api/user/clxxxxxxxxxxxxxxxxxxxx/public-key
Authorization: Bearer <sessionToken>
```

### Responses

| Status | Body | Kiedy |
|--------|------|--------|
| `200` | `{ "publicKey": "<base64>" }` lub `{ "publicKey": null }` | OK / jeszcze nie ustawiony |
| `403` | `{ "error": "forbidden" }` | inny workspace / brak workspace |
| `404` | `{ "error": "not_found" }` | nieznany `userId` |

Przykład:

```json
{
  "publicKey": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
}
```

---

## `POST /api/auth/password` (zmiana hasła + rotacja envelope)

Zmiana hasła przy aktywnym E2E musi być **atomowa** z rotacją envelope (nowe hasło nie może odblokować starego envelope).

### Request

```http
POST /api/auth/password
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

```json
{
  "currentPassword": "stareHaslo123",
  "newPassword": "noweHaslo4567",
  "newPrivateKeyEnvelope": "v1.opaque.rewrapped-under-new-password..."
}
```

| Pole | Walidacja Zod | Uwagi |
|------|---------------|--------|
| `currentPassword` | `string.min(8)` | wymagane |
| `newPassword` | `string.min(8)` | wymagane |
| `newPrivateKeyEnvelope` | `string.min(1).max(4000).optional()` | **warunkowo wymagane** w logice serwisu |

### Logika serwisu

1. Weryfikacja `currentPassword` → przy błędzie `401 { "error": "invalid_credentials" }`.
2. Jeśli user **ma** już `privateKeyEnvelope` w DB:
   - brak / pusty / >4000 `newPrivateKeyEnvelope` → `400 { "error": "private_key_envelope_required" }` (hasło **nie** jest zmieniane);
   - podany envelope → `passwordHash` **oraz** `privateKeyEnvelope` w **jednej** transakcji Prisma.
3. Jeśli user **nie ma** jeszcze `privateKeyEnvelope` (konto sprzed E2E) → zmiana hasła jak dotychczas; envelope opcjonalne i ignorowane przy braku.
4. Po sukcesie: unieważnienie wszystkich sesji + artefaktów bezpieczeństwa (jak dotychczas).

### Responses

| Status | Body |
|--------|------|
| `200` | `{ "success": true }` |
| `400` | `{ "error": "private_key_envelope_required" }` |
| `400` | `{ "error": "invalid_request" }` (Zod) |
| `401` | `{ "error": "invalid_credentials" }` |

---

## `POST /api/auth/forgot-password` (reset — bez zmian)

Flow resetu hasła (tymczasowe hasło e-mailem) **nie** wymaga `newPrivateKeyEnvelope`. User i tak nie ma dostępu do starego hasła → oczekiwana utrata możliwości odszyfrowania starego envelope.

Po zalogowaniu tymczasowym hasłem klient:

1. Generuje **nową** parę X25519.
2. Buduje nowy `privateKeyEnvelope` pod nowe hasło.
3. Wywołuje `POST /api/user/keys` (nadpisanie + log `[e2e] keys overwritten`).

Stary envelope w DB zostaje nadpisany; stare wiadomości E2E zaszyfrowane poprzednim kluczem pozostają nieodczytywalne — to zamierzony trade-off „forgot password”.

---

## Rozróżnienie bezpieczeństwa (checklist dla Flutter)

| Endpoint | `publicKey` | `privateKeyEnvelope` |
|----------|-------------|----------------------|
| `GET /api/user/keys/mine` | własne | **własne** (jedyne źródło) |
| `GET /api/user/:userId/public-key` | cudze (workspace) | **nigdy** |
| `POST /api/user/keys` | zapis własnych | zapis własnych |
| `POST /api/auth/password` | — | rotacja własnego (warunkowo) |

Placeholdery w tym dokumencie (`AAA…=`, `BBB…=`, `v1.opaque…`) nie są prawdziwymi kluczami.
