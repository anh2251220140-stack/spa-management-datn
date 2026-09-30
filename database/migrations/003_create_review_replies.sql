-- Chọn spa_management hoặc spa_management_test trước khi chạy.
CREATE TABLE IF NOT EXISTS review_replies (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    message VARCHAR(2000) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_review_replies_review_created (review_id, created_at, id),
    KEY idx_review_replies_user (user_id),
    CONSTRAINT fk_review_replies_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_review_replies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_review_replies_message CHECK (CHAR_LENGTH(TRIM(message)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
