CREATE DATABASE IF NOT EXISTS localprice CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE localprice;

CREATE TABLE IF NOT EXISTS Users (
  user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'shop_owner', 'admin') NOT NULL DEFAULT 'customer',
  phone VARCHAR(25),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Stores (
  store_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id INT UNSIGNED NOT NULL UNIQUE,
  store_name VARCHAR(160) NOT NULL,
  locality VARCHAR(100) NOT NULL,
  address VARCHAR(255) NOT NULL,
  phone VARCHAR(25) NOT NULL,
  approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stores_owner FOREIGN KEY (owner_id) REFERENCES Users(user_id) ON DELETE CASCADE,
  INDEX idx_stores_locality_status (locality, approval_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Categories (
  category_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Products (
  product_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  description TEXT,
  image_key VARCHAR(40) NOT NULL DEFAULT 'product',
  image_url VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES Categories(category_id) ON DELETE RESTRICT,
  INDEX idx_products_name (name),
  INDEX idx_products_brand (brand),
  UNIQUE KEY uq_product_brand_name (brand, name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Store_Products (
  listing_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_listings_store FOREIGN KEY (store_id) REFERENCES Stores(store_id) ON DELETE CASCADE,
  CONSTRAINT fk_listings_product FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
  UNIQUE KEY uq_store_product (store_id, product_id),
  INDEX idx_listings_price_available (is_available, price)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Price_History (
  history_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id INT UNSIGNED NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_listing FOREIGN KEY (listing_id) REFERENCES Store_Products(listing_id) ON DELETE CASCADE,
  INDEX idx_history_listing_date (listing_id, changed_at)
) ENGINE=InnoDB;
