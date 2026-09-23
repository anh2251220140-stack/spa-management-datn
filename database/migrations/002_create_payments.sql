-- Chọn spa_management hoặc spa_management_test trước khi chạy.
-- Chỉ thêm bảng mới; không cập nhật hóa đơn hoặc dữ liệu hiện có.
-- Nếu bảng đã tồn tại, không ghi đè; kiểm tra SHOW CREATE TABLE trước khi tiếp tục.
CREATE TABLE IF NOT EXISTS payments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    provider VARCHAR(30) NOT NULL DEFAULT 'payos',
    provider_transaction_id VARCHAR(255) COLLATE utf8mb4_bin NULL,
    order_code BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(12,0) NOT NULL,
    status ENUM('pending', 'paid', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
    payment_method ENUM('bank_transfer') NULL,
    checkout_url TEXT NULL,
    qr_code TEXT NULL,
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_payments_invoice (invoice_id),
    UNIQUE KEY uq_payments_order_code (order_code),
    UNIQUE KEY uq_payments_provider_transaction (provider, provider_transaction_id),
    CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_payments_provider CHECK (CHAR_LENGTH(TRIM(provider)) > 0),
    CONSTRAINT chk_payments_transaction CHECK (provider_transaction_id IS NULL OR CHAR_LENGTH(TRIM(provider_transaction_id)) > 0),
    -- Giới hạn mã trong miền số nguyên an toàn của JavaScript; không dùng invoice_id làm mã.
    CONSTRAINT chk_payments_order_code CHECK (order_code BETWEEN 1 AND 9007199254740991),
    CONSTRAINT chk_payments_amount CHECK (amount > 0),
    CONSTRAINT chk_payments_paid CHECK (
        (status = 'paid' AND paid_at IS NOT NULL AND payment_method IS NOT NULL)
        OR (status <> 'paid' AND paid_at IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bước nghiệp vụ sau phải kiểm tra amount = invoices.total_amount khi tạo lần thử.
-- Khóa hóa đơn khi xác nhận thanh toán, xử lý thông báo lặp và ngăn ghi nhận paid hai lần.
-- Không tạo lần thử chuyển tiền cho hóa đơn tổng 0; chưa triển khai xử lý tại đây.
