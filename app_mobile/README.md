# FluxoBot Mobile

Native Expo app for the FluxoBot panel. It uses the existing Supabase project,
accounts, and row-level security policies.

The app gets the Supabase URL and publishable key from
`/api/public/mobile-config` on the existing Railway service. No separate mobile
Supabase variables are needed, and the service-role key is never sent to the
app. The backend URL is set in `src/config.ts`.

## Run locally

```sh
npm install
npm start
```

## Build an Android APK

The EAS `preview` profile is configured to create an installable APK. Sign in
to Expo first, then run this from `app_mobile`:

```sh
npx eas-cli@latest build --platform android --profile preview
```

If EAS asks to configure or link the project, follow its prompts once. When the
build finishes, download the APK from the build page or the URL printed by EAS.

The backend must also have the mobile API routes deployed before app features
can connect. It uses the existing Railway service and does not require separate
Supabase variables.
