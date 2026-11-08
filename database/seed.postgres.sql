INSERT INTO users (user_id, full_name, email, password_hash, role, phone) VALUES
(1, 'Aarav Mehta', 'customer@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'customer', '9876543210'),
(2, 'Neha Kulkarni', 'owner@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876501234'),
(3, 'LocalPrice Admin', 'admin@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'admin', '9876500000'),
(4, 'Sri Sai Owner', 'srisai@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876511122'),
(5, 'Krishna Owner', 'krishna@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876522233'),
(6, 'Green Basket Owner', 'greenbasket@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876533344')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO stores (store_id, owner_id, store_name, locality, address, phone, approval_status) VALUES
(1, 2, 'Paper & Co.', 'Koramangala', '24 5th Block, Koramangala', '9876501234', 'approved'),
(2, 4, 'Sri Sai Stationery', 'Koramangala', '11 80 Feet Road, Koramangala', '9876511122', 'approved'),
(3, 5, 'Krishna Book Store', 'HSR Layout', '7 27th Main, HSR Layout', '9876522233', 'approved'),
(4, 6, 'Green Basket', 'Indiranagar', '18 12th Main, Indiranagar', '9876533344', 'pending')
ON CONFLICT (store_id) DO NOTHING;

INSERT INTO categories (category_id, name, description) VALUES
(1, 'Stationery', 'Everyday writing and desk essentials'),
(2, 'Pantry', 'Useful pantry and kitchen staples'),
(3, 'Personal care', 'Daily care essentials'),
(4, 'Home supplies', 'Practical essentials for your home')
ON CONFLICT (category_id) DO NOTHING;

INSERT INTO products (product_id, category_id, name, brand, description, image_key) VALUES
(1, 1, 'Ball Pen Blue', 'Reynolds', 'Smooth blue ink ball pen for everyday writing.', 'pen'),
(2, 1, 'A4 Notebook', 'Classmate', 'Ruled notebook with 172 pages.', 'notebook'),
(3, 2, 'Premium Tea 250g', 'Tata Tea', 'Aromatic tea leaves for a comforting everyday cup.', 'tea'),
(4, 3, 'Hand Wash 250ml', 'Dove', 'Gentle moisturizing hand wash.', 'care'),
(5, 4, 'LED Bulb 9W', 'Philips', 'Energy efficient warm white LED bulb.', 'bulb'),
(6, 1, 'HB Pencil Pack', 'Apsara', 'Pack of ten graphite pencils.', 'pencil')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO store_products (store_id, product_id, price, is_available) VALUES
(1, 1, 5.00, TRUE), (1, 2, 58.00, TRUE), (1, 3, 135.00, FALSE), (1, 6, 45.00, TRUE),
(2, 1, 4.50, TRUE), (2, 2, 62.00, TRUE),
(3, 1, 6.00, TRUE), (3, 3, 128.00, TRUE)
ON CONFLICT (store_id, product_id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('users', 'user_id'), (SELECT COALESCE(MAX(user_id), 1) FROM users), TRUE);
SELECT setval(pg_get_serial_sequence('stores', 'store_id'), (SELECT COALESCE(MAX(store_id), 1) FROM stores), TRUE);
SELECT setval(pg_get_serial_sequence('categories', 'category_id'), (SELECT COALESCE(MAX(category_id), 1) FROM categories), TRUE);
SELECT setval(pg_get_serial_sequence('products', 'product_id'), (SELECT COALESCE(MAX(product_id), 1) FROM products), TRUE);
SELECT setval(pg_get_serial_sequence('store_products', 'listing_id'), (SELECT COALESCE(MAX(listing_id), 1) FROM store_products), TRUE);
