# EG Eloma — Tasks app (iOS / Android)

React Native (Expo) app for the **Tasks + task chat** feature. It talks to the
same live API — and therefore the same database — as the web portal. There is
no separate backend and no schema change.

## Who can sign in

| Portal | Sees |
|---|---|
| **Client** | their company's tasks (`/client/tasks`) — locked while the account is suspended, like the web |
| **Team** | every task assigned to them, across customers (`/employee/tasks`) |
| **Admin** | any customer's board, picked from a customer list (`/customers/:clientId/tasks`) |

## Screens

- **Login** — portal switch (Client / Team / Admin), same credentials as the web.
- **Tasks** — stats (open, due soon, pending approvals), search, status filters, task cards (priority, labels, checklist progress, due date, assignees, unread chat count).
- **Task detail** — change status, dates, assignees, labels, tick checklist items, description, notes thread; **Approvals** (approve / reject with feedback for clients and admins); **Files** (attachments + archive, upload a file).
- **Task chat** — the same chat as the web: replies, emoji reactions (long-press a message), @mentions (type `@`), photos / camera / files of any size (sent straight to storage), links. Polls every 3s while open.
- **Chats** — every task conversation, newest first, with unread counts (read state is kept on the phone only).
- **Profile** — account details, switch customer (admin), sign out.

Creating tasks, columns and labels, deleting chat messages, raising approval
requests and the Access Point / Schedule tabs stay on the web portal for now.

## Run it

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** (App Store / Play Store), or press `a` / `i`
for an Android emulator / iOS simulator.

Point it at a local API instead of the live one:

```bash
EXPO_PUBLIC_API_URL=http://<your-pc-ip>:4000/api npx expo start
```

## Build for the stores

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform all
```

Bundle id / package: `org.elomagroup.egdigital` (`app.json`) — change it to
match your Apple / Google developer accounts before the first store build.

## Notes

- `X-Client: mobile` on every request tells the API to hand the refresh token
  back in the response body (stored in the iOS Keychain / Android Keystore via
  `expo-secure-store`). Older API builds fall back to the native cookie jar.
- The app is not part of the root npm workspaces and its folder is outside the
  CI deploy paths, so it never affects the web/API deploys.
