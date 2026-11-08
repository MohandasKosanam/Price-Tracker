USE localprice;

INSERT INTO Users (user_id, full_name, email, password_hash, role, phone) VALUES
(1, 'Aarav Mehta', 'customer@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'customer', '9876543210'),
(2, 'Neha Kulkarni', 'owner@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876501234'),
(3, 'LocalPrice Admin', 'admin@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'admin', '9876500000'),
(4, 'Sri Sai Owner', 'srisai@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876511122'),
(5, 'Krishna Owner', 'krishna@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876522233'),
(6, 'Green Basket Owner', 'greenbasket@localprice.test', '$2b$10$L4HFVZCZ5wp8sDAxxV.d5.31pQ1QgVr4mxhIro5qDhorBivVjkwLi', 'shop_owner', '9876533344')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO Stores (store_id, owner_id, store_name, locality, address, phone, approval_status) VALUES
(1, 2, 'Paper & Co.', 'Koramangala', '24 5th Block, Koramangala', '9876501234', 'approved'),
(2, 4, 'Sri Sai Stationery', 'Koramangala', '11 80 Feet Road, Koramangala', '9876511122', 'approved'),
(3, 5, 'Krishna Book Store', 'HSR Layout', '7 27th Main, HSR Layout', '9876522233', 'approved'),
(4, 6, 'Green Basket', 'Indiranagar', '18 12th Main, Indiranagar', '9876533344', 'pending')
ON DUPLICATE KEY UPDATE store_name = VALUES(store_name);

INSERT INTO Categories (category_id, name, description) VALUES
(1, 'Stationery', 'Everyday writing and desk essentials'),
(2, 'Pantry', 'Useful pantry and kitchen staples'),
(3, 'Personal care', 'Daily care essentials'),
(4, 'Home supplies', 'Practical essentials for your home')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO Products (product_id, category_id, name, brand, description, image_key) VALUES
(1, 1, 'Ball Pen Blue', 'Reynolds', 'Smooth blue ink ball pen for everyday writing.', 'pen'),
(2, 1, 'A4 Notebook', 'Classmate', 'Ruled notebook with 172 pages.', 'notebook'),
(3, 2, 'Premium Tea 250g', 'Tata Tea', 'Aromatic tea leaves for a comforting everyday cup.', 'tea'),
(4, 3, 'Hand Wash 250ml', 'Dove', 'Gentle moisturizing hand wash.', 'care'),
(5, 4, 'LED Bulb 9W', 'Philips', 'Energy efficient warm white LED bulb.', 'bulb'),
(6, 1, 'HB Pencil Pack', 'Apsara', 'Pack of ten graphite pencils.', 'pencil')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO Store_Products (store_id, product_id, price, is_available) VALUES
(1, 1, 5.00, TRUE), (1, 2, 58.00, TRUE), (1, 3, 135.00, FALSE), (1, 6, 45.00, TRUE),
(2, 1, 4.50, TRUE), (2, 2, 62.00, TRUE),
(3, 1, 6.00, TRUE), (3, 3, 128.00, TRUE)
ON DUPLICATE KEY UPDATE price = VALUES(price), is_available = VALUES(is_available);
