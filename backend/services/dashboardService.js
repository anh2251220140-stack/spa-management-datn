const pool = require('../config/db');

async function getDashboard() {
  // DATETIME của project dùng giờ Việt Nam, không phụ thuộc timezone máy chủ.
  const current = new Date(Date.now() + 7 * 3600000);
  const generatedAt = current.toISOString().slice(0, 19).replace('T', ' ');
  const today = generatedAt.slice(0, 10) + ' 00:00:00';
  const tomorrow = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1)).toISOString().slice(0, 10) + ' 00:00:00';
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 5 + index, 1)).toISOString().slice(0, 7));
  const connection = await pool.getConnection();
  try {
    // Các phần thống kê cùng đọc một snapshot, không khóa/ghi dữ liệu nghiệp vụ.
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [statuses] = await connection.execute('SELECT status,COUNT(*) count FROM appointments GROUP BY status');
    const appointmentStatus = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    for (const row of statuses) appointmentStatus[row.status] = Number(row.count);
    const [[daily]] = await connection.execute("SELECT COUNT(*) count FROM appointments WHERE start_at>=? AND start_at<? AND status<>'cancelled'", [today, tomorrow]);
    const [[customers]] = await connection.execute("SELECT COUNT(*) count FROM customers c LEFT JOIN users u ON u.id=c.user_id WHERE u.id IS NULL OR u.role<>'admin'");
    const [[invoices]] = await connection.execute(`SELECT
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN total_amount ELSE 0 END),0) paid_revenue,
      COUNT(CASE WHEN payment_status='unpaid' THEN 1 END) unpaid_invoices FROM invoices`);
    const [monthly] = await connection.execute(`SELECT DATE_FORMAT(paid_at,'%Y-%m') month,SUM(total_amount) revenue
      FROM invoices WHERE payment_status='paid' AND paid_at>=? AND paid_at<=?
      GROUP BY DATE_FORMAT(paid_at,'%Y-%m') ORDER BY month`, [months[0] + '-01 00:00:00', generatedAt]);
    const [topServices] = await connection.execute(`SELECT a.service_id,s.name service_name,COUNT(*) usage_count
      FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.status='completed'
      GROUP BY a.service_id,s.name ORDER BY usage_count DESC,a.service_id ASC LIMIT 5`);
    const [recent] = await connection.execute(`SELECT a.id,c.full_name customer_name,a.service_name_snapshot,e.full_name employee_name,
      DATE_FORMAT(a.start_at,'%Y-%m-%d %H:%i:%s') start_at,DATE_FORMAT(a.end_at,'%Y-%m-%d %H:%i:%s') end_at,
      a.status,DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s') created_at
      FROM appointments a JOIN customers c ON c.id=a.customer_id JOIN employees e ON e.id=a.employee_id
      ORDER BY a.created_at DESC,a.id DESC LIMIT 5`);
    await connection.commit();
    const revenueByMonth = new Map(monthly.map(row => [row.month, String(row.revenue)]));
    return {
      summary: { total_appointments: Object.values(appointmentStatus).reduce((sum, count) => sum + count, 0),
        today_appointments: Number(daily.count), total_customers: Number(customers.count),
        paid_revenue: String(invoices.paid_revenue), unpaid_invoices: Number(invoices.unpaid_invoices) },
      appointment_status: appointmentStatus,
      monthly_revenue: months.map(month => ({ month, revenue: revenueByMonth.get(month) || '0' })),
      top_services: topServices.map(row => ({ ...row, usage_count: Number(row.usage_count) })),
      recent_appointments: recent,
      timezone: 'Asia/Ho_Chi_Minh', generated_at: generatedAt,
    };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { getDashboard };
