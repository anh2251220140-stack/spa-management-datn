# Frontend Spa

## Chạy local

- Bật MySQL trong XAMPP.
- Terminal Backend: chạy npm run dev trong backend.
- Terminal Frontend: chạy npm run dev trong frontend.
- Mở http://localhost:5173.
- Cấu hình API: VITE_API_URL trong .env (mẫu ở .env.example). Khởi động lại Vite sau khi sửa .env.

## Kiểm tra

- /register: nhập họ tên, email, điện thoại, mật khẩu và xác nhận; thành công chuyển /login.
- /login: đăng nhập; User đến /user, Admin đến /admin.
- Refresh: gọi /auth/me để khôi phục tài khoản từ token.
- User truy cập /admin: hiển thị không có quyền.
- Đăng xuất: xóa token, rời trang được bảo vệ.
- Dùng tài khoản Admin đã có để kiểm tra quyền Admin; đăng ký công khai không tạo Admin.
- Database development: spa_management; kiểm tra users và customers sau đăng ký.

## Lệnh kiểm tra mã nguồn

- npm run build
- npm run lint

Chưa có test Frontend. Chưa có module nghiệp vụ hoặc AI. App.css và tài nguyên mẫu Vite được giữ lại nhưng không còn được import.
