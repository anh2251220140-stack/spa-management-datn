-- Schema cho hệ thống quản lý và đặt lịch Spa.
-- Database spa_management cần được tạo trước khi nhập file.
-- Tương thích MySQL 8.0.16+ và MariaDB 10.5 đang dùng trong XAMPP.
-- Chạy một lần trên database trống; không xóa hoặc ghi đè bảng có sẵn.
-- Không chứa dữ liệu mẫu, trigger hoặc stored procedure.
SET NAMES utf8mb4;
USE spa_management;

-- 1. Tài khoản đăng nhập.
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    status ENUM('active', 'locked') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    CONSTRAINT chk_users_email CHECK (CHAR_LENGTH(TRIM(email)) > 0),
    CONSTRAINT chk_users_password CHECK (CHAR_LENGTH(password_hash) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Khách trực tiếp có thể chưa có tài khoản.
CREATE TABLE customers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    avatar_url VARCHAR(255) NULL,
    gender ENUM('male', 'female', 'other') NULL,
    date_of_birth DATE NULL,
    address VARCHAR(255) NULL,
    skin_type ENUM('normal', 'dry', 'oily', 'combination', 'sensitive') NULL,
    care_needs TEXT NULL,
    preferences TEXT NULL,
    budget DECIMAL(12,0) NULL,
    notes TEXT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customers_user (user_id),
    CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_customers_name CHECK (CHAR_LENGTH(TRIM(full_name)) > 0),
    CONSTRAINT chk_customers_phone CHECK (CHAR_LENGTH(TRIM(phone)) > 0),
    CONSTRAINT chk_customers_budget CHECK (budget IS NULL OR budget >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Danh mục dịch vụ.
CREATE TABLE service_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_categories_name (name),
    CONSTRAINT chk_categories_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Giá và thời lượng hiện tại của dịch vụ.
CREATE TABLE services (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id INT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    benefits TEXT NULL,
    suitability_notes TEXT NULL,
    price DECIMAL(12,0) NOT NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL,
    image_url VARCHAR(500) NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_services_category_name (category_id, name),
    KEY idx_services_category_status (category_id, status),
    CONSTRAINT fk_services_category FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_services_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
    CONSTRAINT chk_services_description CHECK (CHAR_LENGTH(TRIM(description)) > 0),
    CONSTRAINT chk_services_price CHECK (price >= 0),
    CONSTRAINT chk_services_duration CHECK (duration_minutes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Hồ sơ nhân viên; không có tài khoản nhân viên trong phạm vi hiện tại.
CREATE TABLE employees (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NULL,
    specialty VARCHAR(255) NULL,
    experience_years TINYINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_employees_name CHECK (CHAR_LENGTH(TRIM(full_name)) > 0),
    CONSTRAINT chk_employees_phone CHECK (CHAR_LENGTH(TRIM(phone)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Quan hệ nhiều-nhiều nhân viên và dịch vụ.
CREATE TABLE employee_services (
    employee_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (employee_id, service_id),
    KEY idx_employee_services_service_status (service_id, status),
    CONSTRAINT fk_employee_services_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_employee_services_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Một ngày có thể có nhiều ca; ca không qua ngày.
CREATE TABLE employee_schedules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id INT UNSIGNED NOT NULL,
    work_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status ENUM('working', 'off') NOT NULL DEFAULT 'working',
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_schedules_employee_date_start (employee_id, work_date, start_time),
    KEY idx_schedules_employee_date_status (employee_id, work_date, status),
    CONSTRAINT fk_schedules_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_schedules_time CHECK (start_time >= '00:00:00' AND start_time < end_time AND end_time < '24:00:00')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Lịch hẹn giữ giá, tên và khoảng thời gian tại lúc đặt.
CREATE TABLE appointments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    employee_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    start_at DATETIME NOT NULL,
    end_at DATETIME NOT NULL,
    service_name_snapshot VARCHAR(150) NOT NULL,
    booked_price DECIMAL(12,0) NOT NULL,
    status ENUM('pending', 'confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    note TEXT NULL,
    cancel_reason VARCHAR(255) NULL,
    cancelled_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_appointments_assignment (employee_id, service_id),
    KEY idx_appointments_employee_status_start (employee_id, status, start_at),
    KEY idx_appointments_customer_start (customer_id, start_at),
    KEY idx_appointments_status_start (status, start_at),
    CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_appointments_assignment FOREIGN KEY (employee_id, service_id) REFERENCES employee_services(employee_id, service_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_appointments_time CHECK (start_at < end_at AND DATE(start_at) = DATE(end_at)),
    CONSTRAINT chk_appointments_price CHECK (booked_price >= 0),
    CONSTRAINT chk_appointments_name CHECK (CHAR_LENGTH(TRIM(service_name_snapshot)) > 0),
    CONSTRAINT chk_appointments_cancel CHECK (
        (status = 'cancelled' AND cancelled_at IS NOT NULL)
        OR (status <> 'cancelled' AND cancelled_at IS NULL AND cancel_reason IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Mã giảm giá; một hóa đơn dùng tối đa một mã.
CREATE TABLE promotions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    discount_type ENUM('percentage', 'fixed') NOT NULL,
    discount_value DECIMAL(12,2) NOT NULL,
    minimum_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
    max_discount_amount DECIMAL(12,0) NULL,
    start_at DATETIME NOT NULL,
    end_at DATETIME NOT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_promotions_code (code),
    CONSTRAINT chk_promotions_code CHECK (CHAR_LENGTH(TRIM(code)) > 0),
    CONSTRAINT chk_promotions_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
    CONSTRAINT chk_promotions_time CHECK (start_at < end_at),
    CONSTRAINT chk_promotions_minimum CHECK (minimum_amount >= 0),
    CONSTRAINT chk_promotions_discount CHECK (
        discount_value > 0 AND (
            (discount_type = 'percentage' AND discount_value <= 100 AND (max_discount_amount IS NULL OR max_discount_amount > 0))
            OR (discount_type = 'fixed' AND discount_value = FLOOR(discount_value) AND max_discount_amount IS NULL)
        )
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Hóa đơn; khách được xác định qua lịch hẹn, không lưu lặp customer_id.
CREATE TABLE invoices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_code VARCHAR(30) NOT NULL,
    appointment_id INT UNSIGNED NOT NULL,
    promotion_id INT UNSIGNED NULL,
    promotion_code_snapshot VARCHAR(50) NULL,
    discount_type_snapshot ENUM('percentage', 'fixed') NULL,
    discount_value_snapshot DECIMAL(12,2) NULL,
    max_discount_snapshot DECIMAL(12,0) NULL,
    promotion_applied_at DATETIME NULL,
    subtotal DECIMAL(12,0) NOT NULL,
    discount_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,0) NOT NULL,
    payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
    payment_method ENUM('cash', 'bank_transfer') NULL,
    paid_at DATETIME NULL,
    note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invoices_code (invoice_code),
    UNIQUE KEY uq_invoices_appointment (appointment_id),
    KEY idx_invoices_promotion (promotion_id),
    KEY idx_invoices_payment_date (payment_status, paid_at),
    CONSTRAINT fk_invoices_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_invoices_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_invoices_code CHECK (CHAR_LENGTH(TRIM(invoice_code)) > 0),
    CONSTRAINT chk_invoices_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal AND total_amount = subtotal - discount_amount),
    CONSTRAINT chk_invoices_payment CHECK (
        (payment_status = 'paid' AND payment_method IS NOT NULL AND paid_at IS NOT NULL)
        OR (payment_status = 'unpaid' AND payment_method IS NULL AND paid_at IS NULL)
    ),
    CONSTRAINT chk_invoices_promotion CHECK (
        (promotion_id IS NULL AND promotion_code_snapshot IS NULL AND discount_type_snapshot IS NULL
            AND discount_value_snapshot IS NULL AND max_discount_snapshot IS NULL
            AND promotion_applied_at IS NULL AND discount_amount = 0)
        OR (promotion_id IS NOT NULL AND promotion_code_snapshot IS NOT NULL
            AND CHAR_LENGTH(TRIM(promotion_code_snapshot)) > 0
            AND discount_type_snapshot IS NOT NULL AND discount_value_snapshot IS NOT NULL
            AND promotion_applied_at IS NOT NULL AND discount_value_snapshot > 0
            AND (
                (discount_type_snapshot = 'percentage' AND discount_value_snapshot <= 100
                    AND (max_discount_snapshot IS NULL OR max_discount_snapshot > 0))
                OR (discount_type_snapshot = 'fixed' AND discount_value_snapshot = FLOOR(discount_value_snapshot)
                    AND max_discount_snapshot IS NULL)
            ))
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Thành tiền tự tính; không nhập trực tiếp total_price.
CREATE TABLE invoice_details (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    service_name_snapshot VARCHAR(150) NOT NULL,
    quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,0) NOT NULL,
    total_price DECIMAL(12,0) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_invoice_details_invoice (invoice_id),
    KEY idx_invoice_details_service (service_id),
    CONSTRAINT fk_invoice_details_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_invoice_details_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_invoice_details_quantity CHECK (quantity > 0),
    CONSTRAINT chk_invoice_details_price CHECK (unit_price >= 0),
    CONSTRAINT chk_invoice_details_name CHECK (CHAR_LENGTH(TRIM(service_name_snapshot)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Một review cho một lịch; khách và dịch vụ suy ra qua lịch.
CREATE TABLE reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment TEXT NULL,
    content_version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reviews_appointment (appointment_id),
    CONSTRAINT fk_reviews_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_reviews_version CHECK (content_version >= 1),
    CONSTRAINT chk_reviews_comment CHECK (comment IS NULL OR CHAR_LENGTH(TRIM(comment)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Một bản ghi cho mỗi lần đề xuất; ID dịch vụ trong JSON được kiểm tra ở Backend.
CREATE TABLE ai_recommendations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    input_data JSON NOT NULL,
    recommended_services JSON NULL,
    status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
    model_name VARCHAR(100) NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_recommendations_customer_created (customer_id, created_at),
    CONSTRAINT fk_recommendations_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_recommendations_input CHECK (JSON_TYPE(input_data) = 'OBJECT'),
    CONSTRAINT chk_recommendations_result CHECK (
        (status = 'success' AND recommended_services IS NOT NULL AND JSON_TYPE(recommended_services) = 'ARRAY')
        OR (status IN ('pending', 'failed') AND recommended_services IS NULL)
    ),
    CONSTRAINT chk_recommendations_error CHECK (
        (status = 'failed' AND error_message IS NOT NULL AND CHAR_LENGTH(TRIM(error_message)) > 0)
        OR (status <> 'failed' AND error_message IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Một kết quả hiện hành cho mỗi review.
CREATE TABLE ai_review_analysis (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id INT UNSIGNED NOT NULL,
    review_version INT UNSIGNED NOT NULL,
    status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
    sentiment ENUM('positive', 'neutral', 'negative') NULL,
    positive_points JSON NULL,
    negative_points JSON NULL,
    topics JSON NULL,
    summary TEXT NULL,
    model_name VARCHAR(100) NULL,
    analyzed_at DATETIME NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_analysis_review (review_id),
    KEY idx_analysis_status_sentiment (status, sentiment),
    CONSTRAINT fk_analysis_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_analysis_version CHECK (review_version >= 1),
    CONSTRAINT chk_analysis_result CHECK (
        (status = 'success' AND sentiment IS NOT NULL AND analyzed_at IS NOT NULL
            AND positive_points IS NOT NULL AND JSON_TYPE(positive_points) = 'ARRAY'
            AND negative_points IS NOT NULL AND JSON_TYPE(negative_points) = 'ARRAY'
            AND topics IS NOT NULL AND JSON_TYPE(topics) = 'ARRAY')
        OR (status IN ('pending', 'failed') AND sentiment IS NULL AND analyzed_at IS NULL
            AND positive_points IS NULL AND negative_points IS NULL AND topics IS NULL AND summary IS NULL)
    ),
    CONSTRAINT chk_analysis_error CHECK (
        (status = 'failed' AND error_message IS NOT NULL AND CHAR_LENGTH(TRIM(error_message)) > 0)
        OR (status <> 'failed' AND error_message IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Các quy tắc cần triển khai ở bước nghiệp vụ, không được CHECK/FK thay thế:
-- 1. Chuẩn hóa email/mã khuyến mãi; kiểm tra ngày sinh không ở tương lai.
-- 2. Đặt/đổi lịch: kiểm tra trạng thái, ca làm, thời lượng và chồng lấn.
--    Kiểm tra và ghi lịch trong cùng giao dịch, phối hợp khóa nhân viên/khách.
-- 3. Chỉ lập hóa đơn và review cho lịch completed, đúng quyền sở hữu.
-- 4. Hóa đơn có ít nhất một dòng; subtotal khớp tổng chi tiết.
--    Không sửa hóa đơn paid; kiểm tra hiệu lực và tính giảm giá khi áp dụng.
-- 5. Tăng content_version khi sửa nhận xét; chỉ nhận kết quả AI đúng phiên bản.
-- 6. Kiểm tra ID dịch vụ, thứ hạng và điểm phù hợp trong JSON đề xuất.
