# WiFiGate

**WiFiGate** is an **Expo (React Native) + TypeScript** app that automates **captive-portal / firewall login** over Wi‑Fi—replacing the manual browser flow (e.g. Sophos **httpclient** on `http://…:8090`). It enforces **Wi‑Fi policy** (optional allowlist), uses **secure credential storage**, runs an **auto-login agent** when enabled, supports **biometric unlock**, **Web Portal (WebView)** fallback, **activity logging**, and **HTTP portal logout** on sign-out where the gateway supports it.

The original product specification is in [`docs/srs.text`](docs/srs.text).

---

## Features

| Area | What the app does |
|------|-------------------|
| **Wi‑Fi gate** | Login is allowed only on **Wi‑Fi** (not cellular-only). If **Allowed Wi‑Fi** has no active entries, **any** Wi‑Fi is allowed; otherwise the current network must match an active entry by **SSID** and/or **IP / gateway substring**. |
| **Direct HTTP login** | Loads the portal page with a **browser-like User-Agent**, keeps **cookies**, then either uses **Sophos/Cyberoam-style** `login.xml` (`mode=191`, hidden fields from the page) or a **generic HTML form** POST. |
| **Failure messages** | Maps portal/network outcomes into clear UI copy (timeout, unreachable, invalid credentials, unexpected response, etc.). |
| **Concurrent login** | Manual login can **preempt** auto-login; auto-login **defers** while a manual attempt is in progress (no “another login in progress” deadlock). |
| **Secure credentials** | After a **successful** manual (or configured WebView) login, **user ID and password** are stored in **Expo SecureStore** (not plain AsyncStorage). |
| **Auto-login agent** | When **Auto Login Agent** is on, **NetInfo** + **app foreground** trigger a sync: probe portal session, then call direct login with saved credentials if needed. |
| **Startup** | Splash hydrates settings, waits for the **first auth/network sync**, then routes to **Home** or **Session** based on session state. |
| **Web Portal** | Modal **Web Portal** screen: full-screen **WebView** to the resolved portal URL; optional **injected script** auto-fills Sophos `#username` / `#password` and calls `submitRequest()` when opened from the fallback flow. |
| **Logout** | **Logout** calls the portal **`logout.xml`** (e.g. Sophos `mode=193`) when possible, then clears the **in-app session** flag and last-login time. **Saved credentials are not removed** so auto-login can run again after the next successful portal sign-in. |
| **Biometrics** | After at least one successful manual login, user can enable **Fingerprint Login** in Settings; Session screen can sign in via biometrics + stored credentials. |
| **Settings** | Firewall endpoint editor, allowed Wi‑Fi list, **Auto Login Agent**, **Warn about mobile data**, biometric toggle, link to **About**. |
| **Dashboard (Home)** | Wi‑Fi/access/session overview, **saved credentials** / **auto-login** status, reconnect, **Web Portal**, logout. |
| **Activity logs** | Local **append-only style** log (info/warn/error/success) with a cap (see `constants/defaults.ts`). |
| **About** | In-app version, capability summary, company/support links (`app/about.tsx`). |

---

## Tech stack

- **Expo SDK ~54**, **expo-router** (file-based routes), **React 19**, **TypeScript**
- **Zustand** (`store/appStore.ts`) for session + settings + auth agent UI state
- **Axios** for portal HTTP, **react-native-webview** for Web Portal
- **NetInfo** + **expo-network** for connection snapshot
- **expo-secure-store**, **AsyncStorage** (settings + logs)
- **expo-local-authentication** (biometrics), **expo-location** (Android SSID)
- **react-hook-form** + **zod** on login form

---

## Setup

```bash
cd WiFiGate
npm install
npx expo start
```

Use **Expo Go** or a **development build** (recommended on Android for production-like networking and permissions).

```bash
npm run android   # Run on emulator / device
npm run ios
npm start         # Metro only
```

---

## Navigation overview

- **Splash** (`app/index.tsx`) → **Tabs** main UI or legacy stack routes as configured.
- **Tabs** (`app/(tabs)/`): **Home** (dashboard), **WiFi** (allowlist), **Session** (login), **Logs**, **Settings**. The **browser** tab is hidden from the bar but routes exist for **Web Portal** (`/(tabs)/browser` re-exports `webview-login`).
- **Stack** (see `app/_layout.tsx`): **Firewall Endpoint**, **About**, **Biometric Login**, **Web Portal** (modal, title **Web Portal**), plus hidden routes for **login** / **dashboard** / **logs** / **settings** / **wifi** as needed by deep links.

---

## Configuration (Settings)

| Setting | Purpose |
|---------|---------|
| **Firewall Endpoint** | Base URL for the portal; normalized in `settingsService` (default includes `httpclient.html` where applicable). Edited on **Firewall Endpoint** screen with validation. |
| **Allowed WiFi List** | CRUD for SSID and/or gateway/IP substring; entries can be **active** or inactive. **Empty active list** ⇒ login allowed on **any Wi‑Fi** (still must be Wi‑Fi, not cellular-only). |
| **Auto Login Agent** | When enabled, background sync attempts **probe + login** on allowed Wi‑Fi with saved credentials. |
| **Warn About Mobile Data** | Surfaces a warning on the Session screen when Android may have **cellular + Wi‑Fi** (dual transport). |
| **Fingerprint Login** | Tied to **manual login completed** + hardware; enabling prompts biometric auth. |

---

## Flows (how it works)

### 1. Manual login (Session tab)

1. **Wi‑Fi gate** (`services/wifiGateAuth.ts`): must be on Wi‑Fi and satisfy allowlist (if any).
2. **Direct login** (`services/firewallLogin.ts`): Sophos XML path first when URL/HTML matches, else generic form POST; detailed errors via `describeFirewallLoginFailure`.
3. On success: **SecureStore** credentials + session flag, optional biometric offer, navigate **Home**.

If direct login fails, the app can offer **Web Portal** continuation (WebView) for the same credentials.

### 2. Auto-login (`services/authAgent.tsx`)

On network change and when the app becomes **active**:

1. Build network snapshot; if offline / not Wi‑Fi / not allowed ⇒ update **auth agent** state and clear in-app session if needed.
2. If auto-login disabled or paused ⇒ **ready** / **paused** messages.
3. If no saved credentials ⇒ **needs_credentials**.
4. Else **inspectFirewallSession**; if already authenticated ⇒ sync session.
5. Else **performFirewallLogin** with `initiator: 'auto'`. **Deferred** if manual login is active. **Cancelled** if superseded without treating as a hard failure where appropriate.

### 3. Web Portal (`app/webview-login.tsx`)

- Loads `resolvePortalEntryUrl(endpoint)` in a **WebView** (no URL chrome in the body; nav title **Web Portal**).
- With **pending portal login** from the store, injected JS drives Sophos-style **`submitRequest()`** and listens for **`getState()`** to detect **signed_in** / **rejected**.

### 4. Logout (Dashboard)

1. **`performFirewallLogout`** (`firewallLogin.ts`): best-effort **POST `logout.xml`** (e.g. `mode=193`) with username when known.
2. **`clearSession`** (`appStore`): clears **session** SecureStore flag, **lastLoginAt** in settings, sets **auto-login paused until network change**; **does not** erase stored ID/password.

---

## Portal compatibility

- **Sophos / Cyberoam-style** (`httpclient`, `login.xml` / `logout.xml`, `mode=191` / `193`): primary path for direct login/logout; hidden fields from the HTML are merged into XML posts.
- **Other vendors**: may work via **generic form** discovery; otherwise use **Web Portal** or extend `services/firewallLogin.ts`.
- **HTTP**: `usesCleartextTraffic` is enabled on Android for typical LAN portals.

---

## Architecture (code map)

| Layer | Location | Role |
|-------|----------|------|
| UI | `app/` | Screens, Expo Router |
| State | `store/appStore.ts` | Hydration, session, settings, auth agent snapshot, portal fallback payload |
| Portal HTTP | `services/firewallLogin.ts` | Login, logout, session probe, Cyberoam + generic form |
| Wi‑Fi policy gate | `services/wifiGateAuth.ts` | Single place for “allowed to attempt login?” messaging |
| Network | `services/networkService.ts` | Snapshot, allowlist matching, SSID (with Android location permission) |
| Auto-login | `services/authAgent.tsx` | NetInfo + AppState → `syncAuthAgent` |
| Credentials | `services/secureCredentials.ts` | SecureStore keys for user/pass, session, biometric flags |
| Settings | `services/settingsService.ts` | AsyncStorage JSON for endpoint, allowlist, toggles |
| Biometrics | `services/biometricService.ts` | Local auth prompts |
| Logs | `services/activityLog.ts` | AsyncStorage ring buffer |
| Models | `types/models.ts` | Shared types |
| Defaults | `constants/defaults.ts` | Default endpoint, timeouts, storage keys |

---

## Storage and security

| Data | Storage |
|------|---------|
| Endpoint, allowed Wi‑Fi, toggles, `lastLoginId` (display), `lastLoginAt` | AsyncStorage (`settingsService`) |
| User ID, password, session flag, biometric flags, “manual login done” | Expo SecureStore (`secureCredentials`) |
| Activity log | AsyncStorage (non-sensitive), capped (`ACTIVITY_LOG_MAX`) |

Passwords are **not** written to AsyncStorage or the activity log.

---

## Permissions (Android)

Declared in **`app.json`**: network/Wi‑Fi state, **fine/coarse location** (SSID on many devices), **nearby Wi‑Fi devices**, biometric. Copy is configured for **expo-location** and **expo-local-authentication**.

---

## Known limitations (Expo / OS)

| Topic | Note |
|-------|------|
| **SSID** | May be missing without permission or on some OEMs; use **IP/gateway** allowlist hints. |
| **Mobile data** | JS cannot reliably force traffic only over Wi‑Fi; optional warning only. |
| **Background** | No long-lived portal keep-alive in stock Expo; session follows app process + agent while foregrounded / network events. |
| **HTTPS / custom certs** | Self-signed portals may need native network security config in a custom build. |

---

## Project layout (concise)

```
app/                 # Routes: splash, tabs, login, dashboard, settings, endpoint, wifi, biometric, logs, webview-login, about
components/          # UI primitives, AboutCard
constants/           # theme, defaults
services/            # firewall, network, auth agent, credentials, settings, logs, biometrics, wifiGateAuth
store/               # Zustand app store
types/               # Shared TypeScript models
utils/               # e.g. endpoint normalization
docs/srs.text        # Full SRS / product prompt
```

---

## Contributing / extending

- Adjust **portal-specific** behavior in **`services/firewallLogin.ts`** (field names, extra modes, new vendor adapter).
- Adjust **allowlist rules** in **`services/networkService.ts`** / **`wifiGateAuth.ts`**.
- Product copy and support contacts for end users: **`app/about.tsx`**.
