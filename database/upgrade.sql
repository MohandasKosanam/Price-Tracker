USE localprice;

-- Run this once when upgrading an existing LocalPrice database created before image uploads.
ALTER TABLE Products ADD COLUMN image_url VARCHAR(255) NULL;
