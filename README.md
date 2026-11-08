# LocalPrice

LocalPrice compares prices at nearby local stores. The frontend uses the existing HTML, CSS, and JavaScript. Express provides the API, and MySQL 8.4 stores accounts, stores, products, listings, and price history.

## Run locally on Windows

Requirements: Node.js 18 or later and MySQL 8.4 running at `127.0.0.1:3306`.

From the project folder in PowerShell:

```powershell
npm.cmd install
npm.cmd run db:provision
npm.cmd run db:setup
npm.cmd run db:check
npm.cmd run db:seed
npm.cmd test
npm.cmd start
```

Open [http://localhost:3000](http://localhost:3000). Stop the server with Ctrl+C.

`db:provision` prompts for the local MySQL password without echoing it. It tests the credentials before writing `.env`, which is ignored by Git. Defaults are MySQL root, port 3306, and database `localprice`. If your MySQL account uses another username, set `DB_USER` in `.env` before provisioning. Never commit `.env`.

`db:setup` runs the idempotent MySQL schema and adds any compatibility columns needed by the current LocalPrice screens. It creates missing tables and does not drop tables or delete records. `db:check` verifies the connection, required tables, and foreign keys.

`db:seed` loads the original demo records only when all six project tables are empty. It refuses to change a populated database. Seeded accounts use bcrypt hashes and the demo password `demo123`:

- Customer: `customer@localprice.test`
- Shop owner: `owner@localprice.test`
- Administrator: `admin@localprice.test`

The shop-owner account is linked to an approved sample store. Newly registered shop owners create a pending store; an administrator must approve it before listings can be managed.

## Persistence and authentication

Registration, account roles, store approval, catalogue products, store listings, prices, and price history are stored in MySQL. Passwords are stored only as bcrypt hashes. Role checks use the existing Express authentication middleware. Sessions use the existing Express session mechanism; after restarting the server, sign in again. Database records remain in MySQL.

When MySQL is unavailable, `/api/health` reports an unavailable status and database-backed operations return an error. The app does not silently switch to temporary in-memory catalogue data.

## Database commands

- `npm.cmd run db:provision` verifies local MySQL credentials and writes ignored local settings.
- `npm.cmd run db:setup` creates the database and schema safely, then ensures additive compatibility columns.
- `npm.cmd run db:check` checks MySQL connectivity and schema presence without modifying records.
- `npm.cmd run db:seed` inserts original demo data only into empty tables; it never overwrites existing data.
- `npm.cmd test` runs local diagnostics and, when `.env` is configured, an integration workflow covering registration, role authorization, store approval and edits, owner product/price management, comparison, and persistence after an Express restart. The integration test removes only records it created. If its MySQL workflow is skipped, it has not passed.

## Authentication character

The authentication mascot uses the supplied MP4 clips through a reusable two-video controller and a single canvas display. The green background is removed in-canvas; pre-rendered clips map to idle, curious, focus/blink, happy, and concerned states. Reactions return to the looping idle clip. Reduced motion and playback failure use the static PNG. The clips do not provide independent eye or tail tracking.

## Liquid Glass

The interface uses a shared CSS material layer plus an optional shared WebGL2 renderer. The renderer shades registered surfaces from a controlled Silver Cloud / Obsidian environment texture, using rounded surface normals, thickness-based screen-space refraction, restrained dispersion, Fresnel edge response, specular lighting, absorption, and roughness. A GPU height/velocity field runs only while a click, touch, modal, or navigation interaction is settling. HTML remains above the canvas for accessible text and controls.

The environment texture is procedural; it does not capture arbitrary live DOM, product photography, or cross-origin content. WebGL2 or floating-point render-target failure leaves the CSS glass treatment in place. A development-only laboratory is served at `/__dev/liquid-glass-lab` when `NODE_ENV=development`.
