# LocalPrice

LocalPrice is a DBMS mini project for comparing product prices at nearby local stores. It uses a vanilla HTML/CSS/JavaScript frontend, an Express backend, and MySQL for persistent data.

## Run locally

1. Create a MySQL database with `database/schema.sql` and load `database/seed.sql`. Existing installations can use `database/upgrade.sql` for the product image column.
2. Copy `.env.example` to `.env` and set the database credentials.
3. Run `npm install` and then `npm start`.
4. Open `http://localhost:3000`.

If MySQL is not configured, the server uses a small in-memory demonstration catalogue so the interface can be reviewed immediately. Database-backed queries are used automatically as soon as a valid MySQL connection is available.

### Demo accounts

When using the fallback catalogue:

- Customer: `customer@localprice.test` / `demo123`
- Shop owner: `owner@localprice.test` / `demo123`
- Administrator: `admin@localprice.test` / `demo123`

The seed SQL contains the same accounts with bcrypt-compatible hashes.

Shop owners can create custom catalogue products with a name, brand, category, description, price, stock state, and an optional product image. Uploaded images are stored locally in `public/uploads/products` and the path is recorded in MySQL.
