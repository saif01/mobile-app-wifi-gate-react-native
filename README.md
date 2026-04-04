# WiFiGate

**WiFiGate** is an **Expo (React Native) + TypeScript** app that automates **captive-portal / firewall login** over Wi‑Fi—replacing the manual browser flow (e.g. Sophos **httpclient** on `http://…:8090`). It enforces **Wi‑Fi policy** with two lists: networks that **require portal login** (allowlist) and networks **without a captive portal** (no auto/manual firewall login and **no server logout** on that Wi‑Fi). It uses **secure credential storage**, runs an **auto-login agent** when enabled, supports **biometric unlock**, **Web Portal (WebView)** fallback, **activity logging**, and **HTTP portal logout** on sign-out where the gateway supports it (skipped on no-portal networks).

The original product specification is in [`docs/srs.text`](docs/srs.text).

---

## Features

| Area | What the app does |
|------|-------------------|
| **Wi‑Fi gate** | Login attempts are only on **Wi‑Fi** (not cellular-only). **No-portal Wi‑Fi** entries mark networks with **no captive portal**: the app skips firewall login/logout there. **Portal (allowed) Wi‑Fi** is the allowlist for captive portal use: if it has **no** active entries, **any** Wi‑Fi may use the portal flow; otherwise the current network must match an active portal entry—or a no-portal entry—by **SSID** and/or **IP / gateway**. The same network cannot appear in both lists. |
| **Direct HTTP login** | Loads the portal page with a **browser-like User-Agent**, keeps **cookies**, then either uses **Sophos/Cyberoam-style** `login.xml` (`mode=191`, hidden fields from the page) or a **generic HTML form** POST. |
| **Failure messages** | Maps portal/network outcomes into clear UI copy (timeout, unreachable, invalid credentials, unexpected response, etc.). |
| **Concurrent login** | Manual login can **preempt** auto-login; auto-login **defers** while a manual attempt is in progress (no “another login in progress” deadlock). |
| **Secure credentials** | After a **successful** manual (or configured WebView) login, **user ID and password** are stored in **Expo SecureStore** (not plain AsyncStorage). |
| **Auto-login agent** | When **Auto Login Agent** is on, **NetInfo** + **app foreground** trigger a sync: probe portal session, then call direct login with saved credentials if needed. |
| **Startup** | Splash hydrates settings, waits for the **first auth/network sync**, then routes to **Home** or **Session** based on session state. |
| **Web Portal** | Modal **Web Portal** screen: full-screen **WebView** to the resolved portal URL; optional **injected script** auto-fills Sophos `#username` / `#password` and calls `submitRequest()` when opened from the fallback flow. |
| **Logout** | **Logout** calls the portal **`logout.xml`** (e.g. Sophos `mode=193`) when possible **and** the current network is **not** on the no-portal list; then clears the **in-app session** flag and last-login time. **Saved credentials are not removed** so auto-login can run again after the next successful portal sign-in. |
| **Biometrics** | After at least one successful manual login, user can enable **Fingerprint Login** in Settings; Session screen can sign in via biometrics + stored credentials. |
| **Session (Login)** | Sign-in (or **Continue** on no-portal Wi‑Fi), optional fingerprint, **WiFi status**, and **Continue in Portal** when the agent requires the WebView. Footer: **Powered By CPB-IT** and app **version**. Firewall URL and other options live under **Settings** (no Settings shortcut on this screen). |
| **Settings** | Firewall endpoint editor, **Wi‑Fi lists** (portal allowlist + no-portal list), **Auto Login Agent**, **Warn about mobile data**, biometric toggle, link to **About**. |
| **Dashboard (Home)** | Wi‑Fi/access/session overview, **credentials** / **auto-login** chips, **last login**, refresh, reconnect, **Web Portal**, logout. |
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

## Publish & build with Expo (EAS)

The project includes [`eas.json`](eas.json) with **development**, **preview** (internal APK), and **production** (Android App Bundle) profiles. Uploading happens on **Expo’s servers** when you run **EAS Build** (and optionally **EAS Submit** for the stores).

### One-time setup

1. Create an account at [expo.dev](https://expo.dev) if you don’t have one.
2. In the project folder:

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

   `eas init` links the app to your Expo account and adds `"extra": { "eas": { "projectId": "…" } }` to `app.json` (merge carefully if you already use `extra`).

3. If the slug **`WiFiGate`** is taken globally, change `expo.slug` in `app.json` to something unique (e.g. `wifigate-yourorg`).

### Build in the cloud (uploads your project to Expo)

```bash
# Shareable APK for testing (internal distribution)
npx eas-cli@latest build --platform android --profile preview

# Play Store–ready AAB
npx eas-cli@latest build --platform android --profile production

# iOS (requires Apple Developer account + credentials setup)
npx eas-cli@latest build --platform ios --profile production
```

Follow the CLI prompts; builds appear on [expo.dev](https://expo.dev) under your project → **Builds**. Download the artifact or install via the link EAS provides.

### Store submission (optional)

After a successful production build:

```bash
npx eas-cli@latest submit --platform android
npx eas-cli@latest submit --platform ios
```

Configure Play Console / App Store Connect credentials when prompted.

### Over-the-air updates (optional)

With EAS Update configured for the project:

```bash
npx eas-cli@latest update --branch production --message "Describe change"
```

---

## Navigation overview

- **Splash** (`app/index.tsx`) → **Tabs** main UI or legacy stack routes as configured.
- **Tabs** (`app/(tabs)/`): **Home** (dashboard), **WiFi** (portal + no-portal lists), **Session** (login), **Logs**, **Settings**. The **browser** tab is hidden from the bar but routes exist for **Web Portal** (`/(tabs)/browser` re-exports `webview-login`).
- **Stack** (see `app/_layout.tsx`): **Firewall Endpoint**, **About**, **Biometric Login**, **Web Portal** (modal, title **Web Portal**), plus hidden routes for **login** / **dashboard** / **logs** / **settings** / **wifi** as needed by deep links.

---

## Configuration (Settings)

| Setting | Purpose |
|---------|---------|
| **Firewall Endpoint** | Base URL for the portal; normalized in `settingsService` (default includes `httpclient.html` where applicable). Edited on **Firewall Endpoint** screen with validation. |
| **WiFi lists** | **No portal**: networks without captive portal—no firewall auto-login, Session screen offers **Continue to app**, and logout skips **`logout.xml`**. **Portal login required**: same allowlist rules as before (SSID and/or gateway/IP; active/paused). **Empty active portal list** ⇒ portal login allowed on **any Wi‑Fi** (still must be Wi‑Fi, not cellular-only). A network cannot be in both lists. |
| **Auto Login Agent** | When enabled, background sync runs **probe + login** on portal-eligible Wi‑Fi with saved credentials; no-portal Wi‑Fi is marked authenticated locally without calling the portal. |
| **Warn About Mobile Data** | Surfaces a warning on the Session screen when Android may have **cellular + Wi‑Fi** (dual transport). |
| **Fingerprint Login** | Tied to **manual login completed** + hardware; enabling prompts biometric auth. |

---

## Flows (how it works)

### 1. Manual login (Session tab)

1. **Wi‑Fi gate** (`services/wifiGateAuth.ts`): must be on Wi‑Fi and satisfy policy (portal allowlist if configured, or a **no-portal** match). On no-portal Wi‑Fi, the Session screen skips direct portal login and can continue without credentials. The Session UI (`app/login.tsx`) is intentionally minimal: network hint and portal fallback only, not a duplicate settings or agent dashboard.
2. **Direct login** (`services/firewallLogin.ts`): Sophos XML path first when URL/HTML matches, else generic form POST; detailed errors via `describeFirewallLoginFailure`.
3. On success: **SecureStore** credentials + session flag, optional biometric offer, navigate **Home**.

If direct login fails, the app can offer **Web Portal** continuation (WebView) for the same credentials.

### 2. Auto-login (`services/authAgent.tsx`)

On network change and when the app becomes **active**:

1. Build network snapshot; if offline / not Wi‑Fi / not allowed ⇒ update **auth agent** state and clear in-app session if needed. If the network matches **no-portal** list ⇒ set session locally authenticated **without** portal calls.
2. If auto-login disabled or paused ⇒ **ready** / **paused** messages.
3. If no saved credentials ⇒ **needs_credentials**.
4. Else **inspectFirewallSession**; if already authenticated ⇒ sync session.
5. Else **performFirewallLogin** with `initiator: 'auto'`. **Deferred** if manual login is active. **Cancelled** if superseded without treating as a hard failure where appropriate.

### 3. Web Portal (`app/webview-login.tsx`)

- Loads `resolvePortalEntryUrl(endpoint)` in a **WebView** (no URL chrome in the body; nav title **Web Portal**).
- With **pending portal login** from the store, injected JS drives Sophos-style **`submitRequest()`** and listens for **`getState()`** to detect **signed_in** / **rejected**.

### 4. Logout (Dashboard)

1. **`performFirewallLogout`** (`firewallLogin.ts`): best-effort **POST `logout.xml`** (e.g. `mode=193`) with username when known—**skipped** when the current network is on the **no-portal** list.
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
| Network | `services/networkService.ts` | Snapshot, portal + no-portal list matching, SSID (with Android location permission) |
| Auto-login | `services/authAgent.tsx` | NetInfo + AppState → `syncAuthAgent` |
| Credentials | `services/secureCredentials.ts` | SecureStore keys for user/pass, session, biometric flags |
| Settings | `services/settingsService.ts` | AsyncStorage JSON for endpoint, Wi‑Fi lists (`allowedWifi`, `noLoginWifi`), toggles |
| Biometrics | `services/biometricService.ts` | Local auth prompts |
| Logs | `services/activityLog.ts` | AsyncStorage ring buffer |
| Models | `types/models.ts` | Shared types |
| Defaults | `constants/defaults.ts` | Default endpoint, timeouts, storage keys |

---

## Storage and security

| Data | Storage |
|------|---------|
| Endpoint, portal + no-portal Wi‑Fi lists, toggles, `lastLoginId` (display), `lastLoginAt` | AsyncStorage (`settingsService`) |
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
- Adjust **Wi‑Fi matching / lists** in **`services/networkService.ts`** / **`wifiGateAuth.ts`** (`app/wifi.tsx` for UI).
- Product copy and support contacts for end users: **`app/about.tsx`**.
