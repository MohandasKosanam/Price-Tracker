require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { initializeDatabase, getPool, isDatabaseReady, getDatabaseStatus } = require('./config/database');
const { requireRole } = require('./middleware/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const isVercelRuntime = Boolean(process.env.VERCEL);
if (isProduction && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production.');
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS || 8);
if (!Number.isFinite(sessionTtlHours) || sessionTtlHours <= 0 || sessionTtlHours > 720) {
  throw new Error('SESSION_TTL_HOURS must be greater than 0 and no more than 720.');
}
const sessionMaxAgeMs = sessionTtlHours * 60 * 60 * 1000;
const secureSessionCookie = isProduction || String(process.env.SESSION_COOKIE_SECURE || 'auto').toLowerCase() === 'true';
if (isProduction) app.set('trust proxy', 1);
const productUploadDir = isVercelRuntime
  ? path.join(require('os').tmpdir(), 'localprice', 'uploads', 'products')
  : path.join(__dirname, 'public', 'uploads', 'products');
fs.mkdirSync(productUploadDir, { recursive: true });

const productUpload = multer({
  storage: multer.diskStorage({
    destination: productUploadDir,
    filename: (req, file, callback) => {
      const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype] || '.img';
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) return callback(new Error('Only JPG, PNG, WEBP, and GIF product images are supported.'));
    callback(null, true);
  }
});

function parseProductUpload(req, res, next) {
  productUpload.single('image')(req, res, (error) => {
    if (error) {
      if (req.file) fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Product images must be 3MB or smaller.' : error.message });
    }
    if (isVercelRuntime && req.file) {
      removeUploadedFile(req.file);
      return res.status(503).json({ message: 'Product image uploads require persistent storage, which is not configured for this deployment.' });
    }
    return next();
  });
}

function removeUploadedFile(file) {
  if (file?.path) fs.rmSync(file.path, { force: true });
}

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'localprice-development-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: secureSessionCookie, maxAge: sessionMaxAgeMs }
}));
app.get('/api/health', (req, res) => {
  const status = getDatabaseStatus();
  return res.status(status.status === 'ok' ? 200 : 503).json(status);
});
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!isDatabaseReady()) return res.status(503).json(getDatabaseStatus());
  return next();
});

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/') || !req.session.user) return next();
  try {
    const [[account]] = await getPool().query('SELECT is_active FROM Users WHERE user_id = ?', [req.session.user.user_id]);
    if (account?.is_active) return next();
    req.session.destroy(() => res.status(401).json({ message: 'This account is inactive. Contact an administrator.' }));
  } catch (error) { return formatError(res, error); }
});

function publicUser(user) {
  if (!user) return null;
  return { user_id: user.user_id, full_name: user.full_name, email: user.email, role: user.role, phone: user.phone || null };
}

function cleanText(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

async function requireApprovedStore(req, res, next) {
  try {
    const [[store]] = await getPool().query('SELECT store_id, approval_status FROM Stores WHERE owner_id = ?', [req.session.user.user_id]);
    if (!store) return res.status(403).json({ message: 'Create a store profile and wait for administrator review before managing listings.' });
    if (store.approval_status !== 'approved') return res.status(403).json({ message: 'Your store must be approved before you can manage customer listings.' });
    req.store = store;
    return next();
  } catch (error) { return formatError(res, error); }
}

function formatError(res, error) {
  const code = String(error?.code || 'APPLICATION_ERROR');
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(code)) {
    console.warn(`[LocalPrice MySQL] ${code}`);
    return res.status(503).json({ code: 'mysql_unavailable', message: 'Local MySQL is unavailable or its schema is incomplete. Run npm run db:check.' });
  }
  console.error(`[LocalPrice request] ${code}`);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
}

app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.session.user) }));

app.post('/api/auth/register', async (req, res) => {
  const fullName = cleanText(req.body.fullName, 120);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role === 'shop_owner' ? 'shop_owner' : 'customer';
  const phone = cleanText(req.body.phone, 25);
  if (fullName.length < 2 || !validEmail(email) || password.length < 6) {
    return res.status(400).json({ message: 'Enter a valid name, email and password of at least 6 characters.' });
  }
  if (role === 'shop_owner' && (!cleanText(req.body.storeName) || !cleanText(req.body.locality) || !cleanText(req.body.address))) {
    return res.status(400).json({ message: 'Shop owners need a store name, locality and address.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [created] = await connection.query('INSERT INTO Users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)', [fullName, email, hash, role, phone || null]);
      if (role === 'shop_owner') {
        await connection.query('INSERT INTO Stores (owner_id, store_name, locality, address, phone) VALUES (?, ?, ?, ?, ?)', [created.insertId, cleanText(req.body.storeName), cleanText(req.body.locality, 100), cleanText(req.body.address, 255), phone || '']);
      }
      await connection.commit();
      req.session.user = { user_id: created.insertId, full_name: fullName, email, role, phone };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    return res.status(201).json({ user: publicUser(req.session.user), message: role === 'shop_owner' ? 'Account created. Your store is pending approval.' : 'Welcome to LocalPrice.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with this email already exists.' });
    return formatError(res, error);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  if (!validEmail(email) || !password) return res.status(400).json({ message: 'Enter your email and password.' });
  try {
    const [rows] = await getPool().query('SELECT user_id, full_name, email, password_hash, role, phone, is_active FROM Users WHERE email = ?', [email]);
    const user = rows[0]?.is_active && await bcrypt.compare(password, rows[0].password_hash) ? rows[0] : null;
    if (!user) return res.status(401).json({ message: 'Email or password is incorrect.' });
    req.session.user = publicUser(user);
    return res.json({ user: publicUser(user), message: 'Signed in successfully.' });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/auth/logout', (req, res) => req.session.destroy((error) => {
  if (error) return formatError(res, error);
  res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: secureSessionCookie });
  return res.json({ message: 'Signed out.' });
}));

app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT category_id, name, description FROM Categories ORDER BY name');
    return res.json({ categories: rows });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/products', async (req, res) => {
  const query = cleanText(req.query.query, 120);
  const locality = cleanText(req.query.locality, 100);
  const category = cleanText(req.query.category, 80);
  const availability = req.query.availability || 'available';
  const sort = req.query.sort === 'high' ? 'high' : 'low';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
  try {
    const sortSql = sort === 'high' ? 'DESC' : 'ASC';
    const values = [];
    const where = ['s.approval_status = \'approved\''];
    if (query) { where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ? OR c.name LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`); }
    if (locality) { where.push('s.locality LIKE ?'); values.push(`%${locality}%`); }
    if (category) { where.push('(c.category_id = ? OR c.name = ?)'); values.push(category, category); }
    if (availability !== 'all') where.push('sp.is_available = TRUE');
    const base = `FROM Store_Products sp JOIN Products p ON p.product_id = sp.product_id JOIN Categories c ON c.category_id = p.category_id JOIN Stores s ON s.store_id = sp.store_id WHERE ${where.join(' AND ')}`;
    const [[count]] = await getPool().query(`SELECT COUNT(*) AS total ${base}`, values);
    const offset = (page - 1) * limit;
    const [rows] = await getPool().query(`SELECT sp.listing_id, p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, c.category_id, c.name AS category, s.store_id, s.store_name, s.locality, s.address, s.phone, s.is_demo, sp.price, sp.is_available, sp.updated_at ${base} ORDER BY sp.price ${sortSql}, sp.updated_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    return res.json({ results: rows, total: count.total, page, pages: Math.ceil(count.total / limit), database: 'mysql' });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/owner/overview', requireRole('shop_owner'), async (req, res) => {
  try {
    const [[store]] = await getPool().query('SELECT store_id, store_name, locality, address, phone, approval_status FROM Stores WHERE owner_id = ?', [req.session.user.user_id]);
    if (!store) return res.json({ store: null, stats: { total: 0, available: 0, outOfStock: 0 }, listings: [] });
    const [listings] = await getPool().query('SELECT sp.listing_id, p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, c.name AS category, sp.price, sp.is_available, sp.updated_at FROM Store_Products sp JOIN Products p ON p.product_id = sp.product_id JOIN Categories c ON c.category_id = p.category_id WHERE sp.store_id = ? ORDER BY sp.updated_at DESC', [store.store_id]);
    return res.json({ store, listings, stats: { total: listings.length, available: listings.filter((item) => item.is_available).length, outOfStock: listings.filter((item) => !item.is_available).length } });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/owner/listings', requireRole('shop_owner'), requireApprovedStore, async (req, res) => {
  const productId = Number(req.body.productId);
  const price = Number(req.body.price);
  const isAvailable = req.body.isAvailable !== false && req.body.isAvailable !== 'false';
  if (!Number.isInteger(productId) || !Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Select a product and enter a valid price.' });
  try {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[existing]] = await connection.query('SELECT listing_id, price FROM Store_Products WHERE store_id = ? AND product_id = ? FOR UPDATE', [req.store.store_id, productId]);
      await connection.query('INSERT INTO Store_Products (store_id, product_id, price, is_available) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price), is_available = VALUES(is_available), updated_at = CURRENT_TIMESTAMP', [req.store.store_id, productId, price, isAvailable]);
      if (!existing || Number(existing.price) !== price) {
        await connection.query('INSERT INTO Price_History (listing_id, price) SELECT listing_id, price FROM Store_Products WHERE store_id = ? AND product_id = ?', [req.store.store_id, productId]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    return res.json({ message: 'Product listing saved.' });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/owner/listings/:id', requireRole('shop_owner'), requireApprovedStore, async (req, res) => {
  const listingId = Number(req.params.id);
  const price = Number(req.body.price);
  const isAvailable = req.body.isAvailable !== false && req.body.isAvailable !== 'false';
  if (!Number.isInteger(listingId) || !Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Enter a valid price.' });
  try {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[owned]] = await connection.query('SELECT sp.listing_id, sp.price FROM Store_Products sp JOIN Stores s ON s.store_id = sp.store_id WHERE sp.listing_id = ? AND s.owner_id = ? FOR UPDATE', [listingId, req.session.user.user_id]);
      if (!owned) { await connection.rollback(); return res.status(404).json({ message: 'Listing not found.' }); }
      await connection.query('UPDATE Store_Products SET price = ?, is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE listing_id = ?', [price, isAvailable, listingId]);
      if (Number(owned.price) !== price) await connection.query('INSERT INTO Price_History (listing_id, price) VALUES (?, ?)', [listingId, price]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    return res.json({ message: 'Listing updated.' });
  } catch (error) { return formatError(res, error); }
});

app.delete('/api/owner/listings/:id', requireRole('shop_owner'), requireApprovedStore, async (req, res) => {
  const listingId = Number(req.params.id);
  try {
    const [result] = await getPool().query('DELETE sp FROM Store_Products sp JOIN Stores s ON s.store_id = sp.store_id WHERE sp.listing_id = ? AND s.owner_id = ?', [listingId, req.session.user.user_id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Listing not found.' });
    return res.json({ message: 'Listing removed.' });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/owner/catalogue', requireRole('shop_owner'), async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, c.category_id, c.name AS category FROM Products p JOIN Categories c ON c.category_id = p.category_id ORDER BY p.name');
    return res.json({ products: rows });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/owner/products', requireRole('shop_owner'), requireApprovedStore, parseProductUpload, async (req, res) => {
  const name = cleanText(req.body.name, 160);
  const brand = cleanText(req.body.brand, 100);
  const description = cleanText(req.body.description, 1000);
  const categoryId = Number(req.body.categoryId);
  const price = Number(req.body.price);
  const isAvailable = req.body.isAvailable !== 'false';
  const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

  if (name.length < 2 || brand.length < 2 || description.length < 10 || !Number.isInteger(categoryId) || !Number.isFinite(price) || price < 0) {
    removeUploadedFile(req.file);
    return res.status(400).json({ message: 'Add a product name, brand, category, a useful description, and a valid price.' });
  }

  try {
    const pool = getPool();
    const [[category]] = await pool.query('SELECT category_id FROM Categories WHERE category_id = ?', [categoryId]);
    if (!category) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Choose a valid product category.' }); }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [created] = await connection.query('INSERT INTO Products (category_id, name, brand, description, image_key, image_url) VALUES (?, ?, ?, ?, ?, ?)', [categoryId, name, brand, description, 'custom', imageUrl]);
      const [listing] = await connection.query('INSERT INTO Store_Products (store_id, product_id, price, is_available) VALUES (?, ?, ?, ?)', [req.store.store_id, created.insertId, price, isAvailable]);
      await connection.query('INSERT INTO Price_History (listing_id, price) VALUES (?, ?)', [listing.insertId, price]);
      await connection.commit();
      return res.status(201).json({ message: 'Custom product added to your catalogue.', productId: created.insertId, imageUrl });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    removeUploadedFile(req.file);
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A product with this brand and name already exists.' });
    return formatError(res, error);
  }
});

app.patch('/api/owner/store', requireRole('shop_owner'), async (req, res) => {
  const storeName = cleanText(req.body.storeName, 160);
  const locality = cleanText(req.body.locality, 100);
  const address = cleanText(req.body.address, 255);
  const phone = cleanText(req.body.phone, 25);
  if (!storeName || !locality || !address) return res.status(400).json({ message: 'Store name, locality and address are required.' });
  try {
    const [[store]] = await getPool().query('SELECT store_id FROM Stores WHERE owner_id = ?', [req.session.user.user_id]);
    if (!store) return res.status(404).json({ message: 'Store profile not found.' });
    await getPool().query('UPDATE Stores SET store_name = ?, locality = ?, address = ?, phone = ? WHERE store_id = ?', [storeName, locality, address, phone, store.store_id]);
    return res.json({ message: 'Store details saved.' });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/admin/overview', requireRole('admin'), async (req, res) => {
  try {
    const [[users]] = await getPool().query('SELECT COUNT(*) AS total FROM Users');
    const [[shops]] = await getPool().query('SELECT COUNT(*) AS total FROM Stores');
    const [[pending]] = await getPool().query("SELECT COUNT(*) AS total FROM Stores WHERE approval_status = 'pending'");
    const [[listings]] = await getPool().query('SELECT COUNT(*) AS total FROM Store_Products');
    const [stores] = await getPool().query('SELECT s.store_id, s.store_name, s.locality, s.address, s.phone, s.description, s.logo_key, s.is_demo, s.approval_status, s.created_at, u.full_name AS owner_name, u.email AS owner_email FROM Stores s JOIN Users u ON u.user_id = s.owner_id ORDER BY FIELD(s.approval_status, \'pending\', \'approved\', \'rejected\'), s.created_at DESC');
    const [categories] = await getPool().query('SELECT category_id, name, description FROM Categories ORDER BY name');
    const [products] = await getPool().query('SELECT p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, p.unit, c.category_id, c.name AS category FROM Products p JOIN Categories c ON c.category_id = p.category_id ORDER BY p.created_at DESC, p.name');
    const [accounts] = await getPool().query('SELECT user_id, full_name, email, role, phone, is_active, created_at FROM Users ORDER BY created_at DESC, full_name');
    const [listingRows] = await getPool().query('SELECT sp.listing_id, p.name AS product_name, p.brand, s.store_name, s.locality, sp.price, sp.is_available, sp.updated_at FROM Store_Products sp JOIN Products p ON p.product_id = sp.product_id JOIN Stores s ON s.store_id = sp.store_id ORDER BY sp.updated_at DESC, p.name');
    return res.json({ stats: { users: users.total, shops: shops.total, pending: pending.total, listings: listings.total }, stores, categories, products, users: accounts, listings: listingRows });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/admin/users/:id/status', requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id);
  const isActive = req.body.isActive;
  if (!Number.isInteger(userId) || userId < 1 || typeof isActive !== 'boolean') return res.status(400).json({ message: 'Choose a valid account status.' });
  if (userId === Number(req.session.user.user_id) && !isActive) return res.status(400).json({ message: 'You cannot deactivate your own administrator account.' });
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[target]] = await connection.query('SELECT user_id, role, is_active FROM Users WHERE user_id = ? FOR UPDATE', [userId]);
      if (!target) { await connection.rollback(); return res.status(404).json({ message: 'Account not found.' }); }
      if (target.role === 'admin' && !isActive && target.is_active) {
        const [admins] = await connection.query("SELECT user_id FROM Users WHERE role = 'admin' AND is_active = TRUE FOR UPDATE");
        if (admins.length <= 1) { await connection.rollback(); return res.status(409).json({ message: 'The last active administrator cannot be deactivated.' }); }
      }
      await connection.query('UPDATE Users SET is_active = ? WHERE user_id = ?', [isActive, userId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    return res.json({ message: `Account ${isActive ? 'activated' : 'deactivated'}.` });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/admin/stores/:id/status', requireRole('admin'), async (req, res) => {
  const status = ['approved', 'rejected', 'pending'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ message: 'Invalid approval status.' });
  try {
    const storeId = Number(req.params.id);
    if (!Number.isInteger(storeId) || storeId < 1) return res.status(400).json({ message: 'Choose a valid store.' });
    const [result] = await getPool().query('UPDATE Stores SET approval_status = ? WHERE store_id = ?', [status, storeId]);
    if (!result.affectedRows) {
      const [[exists]] = await getPool().query('SELECT store_id FROM Stores WHERE store_id = ?', [storeId]);
      if (!exists) return res.status(404).json({ message: 'Store not found.' });
    }
    return res.json({ message: `Store marked ${status}.` });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/admin/categories/:id', requireRole('admin'), async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const description = cleanText(req.body.description, 255);
  if (!name || name.length < 2) return res.status(400).json({ message: 'Category name must be at least two characters.' });
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId) || categoryId < 1) return res.status(400).json({ message: 'Choose a valid category.' });
    const [[existing]] = await getPool().query('SELECT category_id FROM Categories WHERE category_id = ?', [categoryId]);
    if (!existing) return res.status(404).json({ message: 'Category not found.' });
    await getPool().query('UPDATE Categories SET name = ?, description = ? WHERE category_id = ?', [name, description || null, categoryId]);
    return res.json({ message: 'Category updated.' });
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That category already exists.' }); return formatError(res, error); }
});

app.post('/api/admin/categories', requireRole('admin'), async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const description = cleanText(req.body.description, 255);
  if (!name || name.length < 2) return res.status(400).json({ message: 'Enter a category name with at least two characters.' });
  try {
    await getPool().query('INSERT INTO Categories (name, description) VALUES (?, ?)', [name, description || null]);
    return res.status(201).json({ message: 'Category created.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That category already exists.' });
    return formatError(res, error);
  }
});

app.delete('/api/admin/categories/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Choose a valid category.' });
  try {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[category]] = await connection.query('SELECT category_id FROM Categories WHERE category_id = ? FOR UPDATE', [id]);
      if (!category) { await connection.rollback(); return res.status(404).json({ message: 'Category not found.' }); }
      const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM Products WHERE category_id = ?', [id]);
      if (count.total) { await connection.rollback(); return res.status(409).json({ message: 'Move or remove this category’s products before deleting it.' }); }
      await connection.query('DELETE FROM Categories WHERE category_id = ?', [id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    return res.json({ message: 'Category deleted.' });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/admin/products', requireRole('admin'), parseProductUpload, async (req, res) => {
  const name = cleanText(req.body.name, 160);
  const brand = cleanText(req.body.brand, 100);
  const description = cleanText(req.body.description, 1000);
  const unit = cleanText(req.body.unit, 80);
  const categoryId = Number(req.body.categoryId);
  if (name.length < 2 || !brand || !Number.isInteger(categoryId)) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Enter a product name, brand, and category.' }); }
  const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;
  try {
    const [[category]] = await getPool().query('SELECT category_id FROM Categories WHERE category_id = ?', [categoryId]);
    if (!category) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Choose a valid category.' }); }
    await getPool().query('INSERT INTO Products (category_id, name, brand, description, image_key, image_url, unit) VALUES (?, ?, ?, ?, ?, ?, ?)', [categoryId, name, brand, description || null, 'product', imageUrl, unit || null]);
    return res.status(201).json({ message: 'Product created.' });
  } catch (error) {
    removeUploadedFile(req.file);
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That product and brand already exist.' });
    return formatError(res, error);
  }
});

app.delete('/api/admin/products/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Choose a valid product.' });
  try {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[product]] = await connection.query('SELECT product_id FROM Products WHERE product_id = ? FOR UPDATE', [id]);
      if (!product) { await connection.rollback(); return res.status(404).json({ message: 'Product not found.' }); }
      const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM Store_Products WHERE product_id = ?', [id]);
      if (count.total) { await connection.rollback(); return res.status(409).json({ message: 'This product has store listings. Remove or reassign its listings before deleting it.' }); }
      await connection.query('DELETE FROM Products WHERE product_id = ?', [id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    return res.json({ message: 'Product deleted.' });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/admin/products/:id', requireRole('admin'), parseProductUpload, async (req, res) => {
  const productId = Number(req.params.id);
  const name = cleanText(req.body.name, 160);
  const brand = cleanText(req.body.brand, 100);
  const description = cleanText(req.body.description, 1000);
  const categoryId = Number(req.body.categoryId);
  const unit = cleanText(req.body.unit, 80);
  if (!Number.isInteger(productId) || productId < 1 || name.length < 2 || !brand || !Number.isInteger(categoryId)) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Enter a product name, brand, and category.' }); }
  try {
    const pool = getPool();
    const [[category]] = await pool.query('SELECT category_id FROM Categories WHERE category_id = ?', [categoryId]);
    if (!category) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Choose a valid category.' }); }
    const [[product]] = await pool.query('SELECT product_id FROM Products WHERE product_id = ?', [productId]);
    if (!product) { removeUploadedFile(req.file); return res.status(404).json({ message: 'Product not found.' }); }
    if (req.file) {
      await pool.query('UPDATE Products SET name = ?, brand = ?, description = ?, category_id = ?, unit = ?, image_url = ? WHERE product_id = ?', [name, brand, description || null, categoryId, unit || null, `/uploads/products/${req.file.filename}`, productId]);
    } else {
      await pool.query('UPDATE Products SET name = ?, brand = ?, description = ?, category_id = ?, unit = ? WHERE product_id = ?', [name, brand, description || null, categoryId, unit || null, productId]);
    }
    return res.json({ message: 'Catalogue product updated.' });
  } catch (error) {
    removeUploadedFile(req.file);
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A product with this brand and name already exists.' });
    return formatError(res, error);
  }
});

app.get('/__dev/liquid-glass-lab', (req, res, next) => {
  if (isProduction) return res.sendStatus(404);
  return res.sendFile(path.join(__dirname, 'development', 'liquid-glass-lab.html'), (error) => { if (error) next(error); });
});
app.use('/__dev/assets', (req, res, next) => {
  if (isProduction) return res.sendStatus(404);
  return express.static(path.join(__dirname, 'development'))(req, res, next);
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  return formatError(res, error);
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeDatabase().finally(() => {
  app.listen(PORT, () => {
    console.log(`LocalPrice is running at http://localhost:${PORT}`);
    if (isDatabaseReady()) console.log('LocalPrice persistence: MySQL ready.');
    else console.warn('LocalPrice persistence is unavailable. Run npm run db:check after configuring MySQL.');
  });
});

module.exports = { app };
