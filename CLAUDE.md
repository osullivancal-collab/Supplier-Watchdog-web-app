# Wholesaler Watchdog — rules for Claude

## SoleTasker is off limits. Absolutely.

Callan's standing instruction: **nothing belonging to SoleTasker is ever touched or edited.**
That covers its code (`osullivancal-collab/soletasker-app`), its Vercel project, its Supabase
project and organisation, its Stripe, Resend and any other account, data or setting.

- Reading SoleTasker's code to copy ideas into this repo is allowed. Changing anything there is not.
- Never run SQL, migrations, deploys, env-var changes or settings changes against a SoleTasker
  project. If a tool only offers SoleTasker's project or organisation, stop and ask.
- Watchdog never shares a Supabase project, organisation, database, keys, Stripe account or
  users with SoleTasker.
- If a Watchdog task seems to need a change in SoleTasker, report it to Callan and leave it.

## Working rules

- Never commit or push to `main`; work on a task branch. Merging to `main` deploys production
  and needs Callan's yes.
- Creating cloud resources, running migrations against a real database, changing env vars or
  secrets: say what and why first, unless Callan has already said yes to that exact step.
- Never print or commit secret values. `.env.example` holds names only.
- A change only shows on screen after the database accepted it (`src/lib/remote.js`).
- Before pushing: `npm test`, `npm run test:db`, `npm run build && npm run smoke`.
- Plain language with Callan.

See [BACKEND.md](BACKEND.md) for the backend and setup state.
