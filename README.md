# WiFiGate

Mobile client for **firewall / captive-portal login** over Wi‑Fi. It automates the flow users currently perform in a browser (e.g. `http://10.64.4.253:8090`), with **allowed-network enforcement**, **secure credential storage**, optional **biometrics**, and **local activity logs**.

The full product specification lives in [`docs/srs.text`](docs/srs.text).

## Setup

```bash
cd WiFiGate
npm install
npx expo start
```

Use **Expo Go** or a **development build** (recommended for production-like behavior on Android).

## Configuration

- **Firewall endpoint**: Settings → Firewall endpoint (default `http://10.64.4.253:8090`).
- **Allowed Wi‑Fi**: Add SSID and/or a gateway/subnet hint (e.g. `10.64.4.`). Login is blocked unless the current connection matches an **active** entry.
- **Remember credentials**: Stores ID/password in **Expo SecureStore** (not plain AsyncStorage).
- **Biometrics**: Enable after **one successful manual login** with “Remember credentials” on.

## Permissions (Android)

- **Location (fine/coarse)**: Often required for **SSID visibility** on recent Android versions.
- **Network / Wi‑Fi state**: Connection type and diagnostics.
- **Biometric**: Optional fingerprint / face unlock.

`usesCleartextTraffic` is enabled so **HTTP** portals (typical on LAN) work.

## Firewall login flow

1. **Direct HTTP (default)**  
   `services/firewallLogin.ts` loads the portal HTML, preserves **cookies**, discovers the first **form** and **hidden fields**, then **POST**s credentials (`application/x-www-form-urlencoded`). Success heuristics inspect status and response body.

2. **WebView fallback**  
   If the portal relies on **JavaScript**, non-standard flows, or complex cookies, use **Browser login (WebView)** from the dashboard to complete login in an embedded browser.

Adjust field names or add portal-specific logic in `firewallLogin.ts` if your device uses uncommon input names.

## Wi‑Fi match logic

`services/networkService.ts` builds a **network snapshot** (Wi‑Fi vs cellular, SSID when available, IP/gateway hints). `matchAllowedWifi()` matches an **active** allowed entry when:

- **SSID** matches (case-insensitive), and/or  
- **Gateway/subnet hint** appears in the inferred gateway or device IP.

## Biometric flow

1. User signs in manually at least once with “Remember credentials”.  
2. User enables biometrics under **Settings → Biometric login**.  
3. On the login screen, **Login with biometrics** loads credentials from SecureStore after a successful local authentication prompt.

## Storage and security

| Data | Storage |
|------|---------|
| Endpoint, allowed Wi‑Fi list, preferences | AsyncStorage (`settingsService`) |
| User ID, password | Expo SecureStore (`secureCredentials`) |
| Session “authenticated” flag | SecureStore |
| Activity log | AsyncStorage (non-sensitive) |

**Logout** clears session flags and stored credentials (per current implementation).

## Expo limitations and future native work

| Area | Limitation | Practical approach |
|------|------------|-------------------|
| **Wi‑Fi SSID** | May be `null` (iOS restrictions, permissions, or OEM behavior) | Use **gateway/subnet** rules as a backup; document on-device behavior. |
| **Mobile data** | Cannot reliably **disable** cellular data from JS | Warn on Android; user may turn off mobile data manually if routing conflicts occur. |
| **Background keep-alive** | No long-lived arbitrary network tasks in standard Expo | Session state is kept in memory while the app process lives; **periodic re-auth / keep-alive** may need a **custom dev client** or native scheduling. |
| **HTTPS / certs** | Self-signed HTTPS may need native network config | Plan for certificate pinning or trust store updates in a custom build. |

## Project layout

- `app/` — Expo Router screens (`login`, `dashboard`, `settings`, `endpoint`, `wifi`, `biometric`, `logs`, `webview-login`).
- `services/` — Firewall HTTP client, Wi‑Fi/network, SecureStore, activity log, biometrics.
- `store/` — Zustand `appStore` for settings and session coordination.
- `types/`, `utils/`, `constants/` — Shared models and helpers.

## Scripts

- `npm start` — Start Metro.
- `npm run android` — Open on Android emulator/device.
