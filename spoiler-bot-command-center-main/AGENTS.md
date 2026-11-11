<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- Site branding uses the shared BrandLogo component and a favicon derived from the same asset, so logo replacements remain consistent across login and navigation.
- Panel queries reuse fresh results for 30 seconds and dashboard reads project only metric fields, avoiding redundant navigation requests and large payment payloads while explicit invalidations and polling keep updates current.
- Independent bot reads and lead persistence run concurrently with responses; await all work before webhook completion and keep payment fallback and exactly-once delivery guards sequential.

- Server-only helper modules (Telegram calls, payment adapters, bot logic) live in `src/lib/backend/*.server.ts` and `src/lib/backend/gateways/`, never under a directory named `server/` — import protection denies any `**/server/**` path from the client graph, which breaks `.functions.ts` files that dynamically import them inside server-function handlers. Client-reachable `*.functions.ts` files import them only via `await import(...)` inside `createServerFn().handler()` bodies, and every server function must be declared as a direct `createServerFn(...).middleware([...]).handler(...)` chain (helper wrappers around `createServerFn` defeat the bundler's detection).
- Telegram bots are managed in the panel: each bot's token lives in `bot_secrets` (service-role only) and every Telegram call runs inside `runWithBot()` (AsyncLocalStorage) so `tg()` uses the right token — never use a global bot token or the Telegram connector.
- NXGate "API Full" accounts send `api_key` inside the JSON body and use `/saldo` and `/pix/consultar` instead of the SDK's `/v1/*` routes, which answer 404 for those accounts.
- Multi-account: every account-owned row has `owner_id` (bots, gateways, plans, spoilers, transactions, owner_settings; withdrawals use `requested_by`) or is reached through an owned bot/gateway (`owns_bot`/`owns_gateway` row rules). Server code using `supabaseAdmin` bypasses row rules, so it must filter by the owner explicitly and check ownership with the caller's `context.supabase` first. The per-account bot limit lives in `src/lib/limits.ts` and is mirrored by the `enforce_bot_limit` database trigger.
- Profile photos live in the private `avatars` bucket under `<user id>/`; spoiler files in `bot-media` under `<user id>/`; show them via signed URLs (`useAvatarUrl`).
- Bot preview media is sent by Telegram file_id cached per bot in `spoilers.tg_file_ids` (file ids are bot-specific); files are pre-posted to the bot's media channel or cached on first send, with a fallback to a fresh storage link when a cached id fails. Layout rules (album grouping, plan button colors) live in `src/lib/bot-offer.ts` so they stay testable.
