require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { initializeDatabase, getPool, isDatabaseReady } = require('./config/database');
const { requireAuth, requireRole } = require('./middleware/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const productUploadDir = path.join(__dirname, 'public', 'uploads', 'products');
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
    if (!error) return next();
    if (req.file) fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Product images must be 3MB or smaller.' : error.message });
  });
}

function removeUploadedFile(file) {
  if (file?.path) fs.rmSync(file.path, { force: true });
}

const demoUsers = [
  { user_id: 1, full_name: 'Aarav Mehta', email: 'customer@localprice.test', role: 'customer', phone: '9876543210', password: 'demo123' },
  { user_id: 2, full_name: 'Neha Kulkarni', email: 'owner@localprice.test', role: 'shop_owner', phone: '9876501234', password: 'demo123' },
  { user_id: 3, full_name: 'LocalPrice Admin', email: 'admin@localprice.test', role: 'admin', phone: '9876500000', password: 'demo123' }
];

const demoStores = [
  { store_id: 1, owner_id: 2, store_name: 'Paper & Co.', locality: 'Koramangala', address: '24 5th Block, Koramangala', phone: '9876501234', approval_status: 'approved' },
  { store_id: 2, owner_id: 4, store_name: 'Sri Sai Stationery', locality: 'Koramangala', address: '11 80 Feet Road, Koramangala', phone: '9876511122', approval_status: 'approved' },
  { store_id: 3, owner_id: 5, store_name: 'Krishna Book Store', locality: 'HSR Layout', address: '7 27th Main, HSR Layout', phone: '9876522233', approval_status: 'approved' },
  { store_id: 4, owner_id: 6, store_name: 'Green Basket', locality: 'Indiranagar', address: '18 12th Main, Indiranagar', phone: '9876533344', approval_status: 'pending' }
];

const demoProducts = [
  { product_id: 1, category_id: 1, category: 'Stationery', name: 'Ball Pen Blue', brand: 'Reynolds', description: 'Smooth blue ink ball pen for everyday writing.', image_key: 'pen' },
  { product_id: 2, category_id: 1, category: 'Stationery', name: 'A4 Notebook', brand: 'Classmate', description: 'Ruled notebook with 172 pages.', image_key: 'notebook' },
  { product_id: 3, category_id: 2, category: 'Pantry', name: 'Premium Tea 250g', brand: 'Tata Tea', description: 'Aromatic tea leaves for a comforting everyday cup.', image_key: 'tea' },
  { product_id: 4, category_id: 3, category: 'Personal care', name: 'Hand Wash 250ml', brand: 'Dove', description: 'Gentle moisturizing hand wash.', image_key: 'care' },
  { product_id: 5, category_id: 4, category: 'Home supplies', name: 'LED Bulb 9W', brand: 'Philips', description: 'Energy efficient warm white LED bulb.', image_key: 'bulb' },
  { product_id: 6, category_id: 1, category: 'Stationery', name: 'HB Pencil Pack', brand: 'Apsara', description: 'Pack of ten graphite pencils.', image_key: 'pencil' }
];

const demoListings = [
  { listing_id: 1, store_id: 1, product_id: 1, price: 5, is_available: true, updated_at: '2026-10-31T10:20:00.000Z' },
  { listing_id: 2, store_id: 2, product_id: 1, price: 4.5, is_available: true, updated_at: '2026-10-30T15:10:00.000Z' },
  { listing_id: 3, store_id: 3, product_id: 1, price: 6, is_available: true, updated_at: '2026-10-29T09:45:00.000Z' },
  { listing_id: 4, store_id: 1, product_id: 2, price: 58, is_available: true, updated_at: '2026-10-30T12:00:00.000Z' },
  { listing_id: 5, store_id: 2, product_id: 2, price: 62, is_available: true, updated_at: '2026-10-28T12:00:00.000Z' },
  { listing_id: 6, store_id: 3, product_id: 3, price: 128, is_available: true, updated_at: '2026-10-27T12:00:00.000Z' },
  { listing_id: 7, store_id: 1, product_id: 3, price: 135, is_available: false, updated_at: '2026-10-25T12:00:00.000Z' },
  { listing_id: 8, store_id: 1, product_id: 6, price: 45, is_available: true, updated_at: '2026-10-26T12:00:00.000Z' }
];

const demoCategories = [
  { category_id: 1, name: 'Stationery', description: 'Everyday writing and desk essentials' },
  { category_id: 2, name: 'Pantry', description: 'Useful pantry and kitchen staples' },
  { category_id: 3, name: 'Personal care', description: 'Daily care essentials' },
  { category_id: 4, name: 'Home supplies', description: 'Practical essentials for your home' }
];

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'localprice-development-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
}));

function publicUser(user) {
  if (!user) return null;
  return { user_id: user.user_id, full_name: user.full_name, email: user.email, role: user.role, phone: user.phone || null };
}

function cleanText(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

function demoResults({ query = '', locality = '', category = '', availability = 'available', sort = 'low' }) {
  const q = query.toLowerCase().trim();
  const loc = locality.toLowerCase().trim();
  let rows = demoListings.map((listing) => {
    const product = demoProducts.find((item) => item.product_id === listing.product_id);
    const store = demoStores.find((item) => item.store_id === listing.store_id);
    return { ...listing, ...product, ...store, listing_id: listing.listing_id, price: Number(listing.price) };
  }).filter((item) => {
    const matchesQuery = !q || [item.name, item.brand, item.category, item.description].some((field) => String(field || '').toLowerCase().includes(q));
    const matchesLocality = !loc || item.locality.toLowerCase().includes(loc);
    const matchesCategory = !category || String(item.category_id) === String(category) || item.category.toLowerCase() === category.toLowerCase();
    const matchesAvailability = availability !== 'available' || item.is_available;
    return matchesQuery && matchesLocality && matchesCategory && matchesAvailability && item.approval_status === 'approved';
  });
  rows.sort((a, b) => sort === 'high' ? b.price - a.price : a.price - b.price);
  return rows;
}

function formatError(res, error) {
  console.error(error);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: isDatabaseReady() ? 'mysql' : 'demo' }));

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
    if (isDatabaseReady()) {
      const pool = getPool();
      const [existing] = await pool.query('SELECT user_id FROM Users WHERE email = ?', [email]);
      if (existing.length) return res.status(409).json({ message: 'An account with this email already exists.' });
      const hash = await bcrypt.hash(password, 10);
      const connection = await pool.getConnection();
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
    } else {
      if (demoUsers.some((user) => user.email === email)) return res.status(409).json({ message: 'An account with this email already exists.' });
      const user = { user_id: demoUsers.length + 10, full_name: fullName, email, role, phone, password };
      demoUsers.push(user);
      if (role === 'shop_owner') demoStores.push({ store_id: demoStores.length + 1, owner_id: user.user_id, store_name: cleanText(req.body.storeName), locality: cleanText(req.body.locality, 100), address: cleanText(req.body.address, 255), phone, approval_status: 'pending' });
      req.session.user = user;
    }
    return res.status(201).json({ user: publicUser(req.session.user), message: role === 'shop_owner' ? 'Account created. Your store is pending approval.' : 'Welcome to LocalPrice.' });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/auth/login', async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  if (!validEmail(email) || !password) return res.status(400).json({ message: 'Enter your email and password.' });
  try {
    let user;
    if (isDatabaseReady()) {
      const [rows] = await getPool().query('SELECT user_id, full_name, email, password_hash, role, phone FROM Users WHERE email = ?', [email]);
      if (rows[0] && await bcrypt.compare(password, rows[0].password_hash)) user = rows[0];
    } else {
      const found = demoUsers.find((item) => item.email === email);
      if (found && (found.password === password || await bcrypt.compare(password, found.password_hash || '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid'))) user = found;
    }
    if (!user) return res.status(401).json({ message: 'Email or password is incorrect.' });
    req.session.user = publicUser(user);
    return res.json({ user: publicUser(user), message: 'Signed in successfully.' });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ message: 'Signed out.' })));

app.get('/api/categories', async (req, res) => {
  try {
    if (isDatabaseReady()) {
      const [rows] = await getPool().query('SELECT category_id, name, description FROM Categories ORDER BY name');
      return res.json({ categories: rows });
    }
    return res.json({ categories: demoCategories });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/products', async (req, res) => {
  const query = cleanText(req.query.query, 120);
  const locality = cleanText(req.query.locality, 100);
  const category = cleanText(req.query.category, 80);
  const availability = req.query.availability || 'available';
  const sort = req.query.sort === 'high' ? 'high' : 'low';
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 24)));
  try {
    if (isDatabaseReady()) {
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
      const [rows] = await getPool().query(`SELECT sp.listing_id, p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, c.category_id, c.name AS category, s.store_id, s.store_name, s.locality, s.address, s.phone, sp.price, sp.is_available, sp.updated_at ${base} ORDER BY sp.price ${sortSql}, sp.updated_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      return res.json({ results: rows, total: count.total, page, pages: Math.ceil(count.total / limit), database: 'mysql' });
    }
    const results = demoResults({ query, locality, category, availability, sort });
    const offset = (page - 1) * limit;
    return res.json({ results: results.slice(offset, offset + limit), total: results.length, page, pages: Math.ceil(results.length / limit), database: 'demo' });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/owner/overview', requireRole('shop_owner'), async (req, res) => {
  try {
    if (isDatabaseReady()) {
      const [[store]] = await getPool().query('SELECT store_id, store_name, locality, address, phone, approval_status FROM Stores WHERE owner_id = ?', [req.session.user.user_id]);
      if (!store) return res.json({ store: null, stats: { total: 0, available: 0, outOfStock: 0 }, listings: [] });
      const [listings] = await getPool().query('SELECT sp.listing_id, p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, c.name AS category, sp.price, sp.is_available, sp.updated_at FROM Store_Products sp JOIN Products p ON p.product_id = sp.product_id JOIN Categories c ON c.category_id = p.category_id WHERE sp.store_id = ? ORDER BY sp.updated_at DESC', [store.store_id]);
      return res.json({ store, listings, stats: { total: listings.length, available: listings.filter((item) => item.is_available).length, outOfStock: listings.filter((item) => !item.is_available).length } });
    }
    const store = demoStores.find((item) => item.owner_id === req.session.user.user_id) || demoStores[0];
    const listings = demoListings.filter((item) => item.store_id === store.store_id).map((item) => ({ ...item, ...demoProducts.find((product) => product.product_id === item.product_id) }));
    return res.json({ store, listings, stats: { total: listings.length, available: listings.filter((item) => item.is_available).length, outOfStock: listings.filter((item) => !item.is_available).length } });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/owner/listings', requireRole('shop_owner'), async (req, res) => {
  const productId = Number(req.body.productId);
  const price = Number(req.body.price);
  const isAvailable = req.body.isAvailable !== false;
  if (!Number.isInteger(productId) || !Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Select a product and enter a valid price.' });
  try {
    if (isDatabaseReady()) {
      const [[store]] = await getPool().query('SELECT store_id FROM Stores WHERE owner_id = ?', [req.session.user.user_id]);
      if (!store) return res.status(400).json({ message: 'Create a store profile before adding products.' });
      await getPool().query('INSERT INTO Store_Products (store_id, product_id, price, is_available) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price), is_available = VALUES(is_available)', [store.store_id, productId, price, isAvailable]);
      await getPool().query('INSERT INTO Price_History (listing_id, price) SELECT listing_id, price FROM Store_Products WHERE store_id = ? AND product_id = ?', [store.store_id, productId]);
    } else {
      const store = demoStores.find((item) => item.owner_id === req.session.user.user_id) || demoStores[0];
      const existing = demoListings.find((item) => item.store_id === store.store_id && item.product_id === productId);
      if (existing) { existing.price = price; existing.is_available = isAvailable; existing.updated_at = new Date().toISOString(); }
      else demoListings.push({ listing_id: demoListings.length + 1, store_id: store.store_id, product_id: productId, price, is_available: isAvailable, updated_at: new Date().toISOString() });
    }
    return res.json({ message: 'Product listing saved.' });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/owner/listings/:id', requireRole('shop_owner'), async (req, res) => {
  const listingId = Number(req.params.id);
  const price = Number(req.body.price);
  const isAvailable = Boolean(req.body.isAvailable);
  if (!Number.isInteger(listingId) || !Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Enter a valid price.' });
  try {
    if (isDatabaseReady()) {
      const [result] = await getPool().query('UPDATE Store_Products sp JOIN Stores s ON s.store_id = sp.store_id SET sp.price = ?, sp.is_available = ? WHERE sp.listing_id = ? AND s.owner_id = ?', [price, isAvailable, listingId, req.session.user.user_id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Listing not found.' });
    } else {
      const store = demoStores.find((item) => item.owner_id === req.session.user.user_id);
      const listing = demoListings.find((item) => item.listing_id === listingId && item.store_id === store?.store_id);
      if (!listing) return res.status(404).json({ message: 'Listing not found.' });
      listing.price = price; listing.is_available = isAvailable; listing.updated_at = new Date().toISOString();
    }
    return res.json({ message: 'Listing updated.' });
  } catch (error) { return formatError(res, error); }
});

app.delete('/api/owner/listings/:id', requireRole('shop_owner'), async (req, res) => {
  const listingId = Number(req.params.id);
  try {
    if (isDatabaseReady()) {
      const [result] = await getPool().query('DELETE sp FROM Store_Products sp JOIN Stores s ON s.store_id = sp.store_id WHERE sp.listing_id = ? AND s.owner_id = ?', [listingId, req.session.user.user_id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Listing not found.' });
    } else {
      const store = demoStores.find((item) => item.owner_id === req.session.user.user_id);
      const index = demoListings.findIndex((item) => item.listing_id === listingId && item.store_id === store?.store_id);
      if (index < 0) return res.status(404).json({ message: 'Listing not found.' });
      demoListings.splice(index, 1);
    }
    return res.json({ message: 'Listing removed.' });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/owner/catalogue', requireRole('shop_owner'), async (req, res) => {
  try {
    if (isDatabaseReady()) {
      const [rows] = await getPool().query('SELECT p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, c.category_id, c.name AS category FROM Products p JOIN Categories c ON c.category_id = p.category_id ORDER BY p.name');
      return res.json({ products: rows });
    }
    return res.json({ products: demoProducts });
  } catch (error) { return formatError(res, error); }
});

app.post('/api/owner/products', requireRole('shop_owner'), parseProductUpload, async (req, res) => {
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
    if (isDatabaseReady()) {
      const pool = getPool();
      const [[store]] = await pool.query('SELECT store_id FROM Stores WHERE owner_id = ?', [req.session.user.user_id]);
      const [[category]] = await pool.query('SELECT category_id FROM Categories WHERE category_id = ?', [categoryId]);
      if (!store) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Create a store profile before adding products.' }); }
      if (!category) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Choose a valid product category.' }); }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [created] = await connection.query('INSERT INTO Products (category_id, name, brand, description, image_key, image_url) VALUES (?, ?, ?, ?, ?, ?)', [categoryId, name, brand, description, 'custom', imageUrl]);
        const [listing] = await connection.query('INSERT INTO Store_Products (store_id, product_id, price, is_available) VALUES (?, ?, ?, ?)', [store.store_id, created.insertId, price, isAvailable]);
        await connection.query('INSERT INTO Price_History (listing_id, price) VALUES (?, ?)', [listing.insertId, price]);
        await connection.commit();
        return res.status(201).json({ message: 'Custom product added to your catalogue.', productId: created.insertId, imageUrl });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    }

    const category = demoCategories.find((item) => item.category_id === categoryId);
    const store = demoStores.find((item) => item.owner_id === req.session.user.user_id) || demoStores[0];
    if (!category) { removeUploadedFile(req.file); return res.status(400).json({ message: 'Choose a valid product category.' }); }
    const productId = Math.max(...demoProducts.map((item) => item.product_id)) + 1;
    const listingId = Math.max(...demoListings.map((item) => item.listing_id)) + 1;
    const product = { product_id: productId, category_id: categoryId, category: category.name, name, brand, description, image_key: 'custom', image_url: imageUrl };
    demoProducts.push(product);
    demoListings.push({ listing_id: listingId, store_id: store.store_id, product_id: productId, price, is_available: isAvailable, updated_at: new Date().toISOString() });
    return res.status(201).json({ message: 'Custom product added to your catalogue.', productId, imageUrl });
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
    if (isDatabaseReady()) {
      const [result] = await getPool().query('UPDATE Stores SET store_name = ?, locality = ?, address = ?, phone = ? WHERE owner_id = ?', [storeName, locality, address, phone, req.session.user.user_id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Store profile not found.' });
    } else {
      const store = demoStores.find((item) => item.owner_id === req.session.user.user_id);
      if (!store) return res.status(404).json({ message: 'Store profile not found.' });
      Object.assign(store, { store_name: storeName, locality, address, phone });
    }
    return res.json({ message: 'Store details saved.' });
  } catch (error) { return formatError(res, error); }
});

app.get('/api/admin/overview', requireRole('admin'), async (req, res) => {
  try {
    if (isDatabaseReady()) {
      const [[users]] = await getPool().query('SELECT COUNT(*) AS total FROM Users');
      const [[shops]] = await getPool().query('SELECT COUNT(*) AS total FROM Stores');
      const [[pending]] = await getPool().query("SELECT COUNT(*) AS total FROM Stores WHERE approval_status = 'pending'");
      const [[listings]] = await getPool().query('SELECT COUNT(*) AS total FROM Store_Products');
      const [stores] = await getPool().query('SELECT s.store_id, s.store_name, s.locality, s.address, s.phone, s.approval_status, s.created_at, u.full_name AS owner_name, u.email AS owner_email FROM Stores s JOIN Users u ON u.user_id = s.owner_id ORDER BY FIELD(s.approval_status, \'pending\', \'approved\', \'rejected\'), s.created_at DESC');
      const [categories] = await getPool().query('SELECT category_id, name, description FROM Categories ORDER BY name');
      const [products] = await getPool().query('SELECT p.product_id, p.name, p.brand, p.description, p.image_key, p.image_url, c.category_id, c.name AS category FROM Products p JOIN Categories c ON c.category_id = p.category_id ORDER BY p.created_at DESC, p.name');
      return res.json({ stats: { users: users.total, shops: shops.total, pending: pending.total, listings: listings.total }, stores, categories, products });
    }
    return res.json({ stats: { users: demoUsers.length + 3, shops: demoStores.length, pending: demoStores.filter((item) => item.approval_status === 'pending').length, listings: demoListings.length }, stores: demoStores.map((store) => ({ ...store, owner_name: demoUsers.find((user) => user.user_id === store.owner_id)?.full_name || 'Store owner', owner_email: demoUsers.find((user) => user.user_id === store.owner_id)?.email || 'owner@localprice.test' })), categories: demoCategories, products: demoProducts });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/admin/stores/:id/status', requireRole('admin'), async (req, res) => {
  const status = ['approved', 'rejected', 'pending'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ message: 'Invalid approval status.' });
  try {
    if (isDatabaseReady()) await getPool().query('UPDATE Stores SET approval_status = ? WHERE store_id = ?', [status, Number(req.params.id)]);
    else { const store = demoStores.find((item) => item.store_id === Number(req.params.id)); if (store) store.approval_status = status; }
    return res.json({ message: `Store marked ${status}.` });
  } catch (error) { return formatError(res, error); }
});

app.patch('/api/admin/categories/:id', requireRole('admin'), async (req, res) => {
  const name = cleanText(req.body.name, 80);
  if (!name) return res.status(400).json({ message: 'Category name is required.' });
  try {
    if (isDatabaseReady()) await getPool().query('UPDATE Categories SET name = ? WHERE category_id = ?', [name, Number(req.params.id)]);
    else { const category = demoCategories.find((item) => item.category_id === Number(req.params.id)); if (category) category.name = name; }
    return res.json({ message: 'Category updated.' });
  } catch (error) { return formatError(res, error); }
});

app.get('/vendor/motion.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'motion', 'dist', 'motion.js')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeDatabase().finally(() => {
  app.listen(PORT, () => console.log(`LocalPrice is running at http://localhost:${PORT}`));
});
