-- Chạy một lần trên database hiện có; không chạy lại schema.sql.
-- Chọn spa_management (hoặc spa_management_test) trước khi nhập file.
ALTER TABLE customers ADD COLUMN avatar_url VARCHAR(255) NULL AFTER phone;
