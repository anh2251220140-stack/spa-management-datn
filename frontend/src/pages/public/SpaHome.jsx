import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Leaf, Sparkles, Users, CalendarDays } from 'lucide-react'
import { getServices } from '../../services/serviceApi'
import { getActivePromotions } from '../../services/promotionApi'
import { formatPrice, serviceImageUrl } from '../../utils/serviceDisplay'
import { formatDiscount, formatPromotionDate } from '../../utils/promotionDisplay'
import './SpaHome.css'
// Ảnh Home do người dùng cung cấp, lưu local để dễ thay thế.
const homeImage = '/images/home-massage.jpg'
function ServiceImage({ service }) {
  const [failed, setFailed] = useState(false)
  if (!service.image_url || failed) return <div className="flex h-full items-center justify-center bg-[#F3EBDD] text-[#786859]"><span className="text-sm">Ảnh dịch vụ đang cập nhật</span></div>
  return <img className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" src={!service.image_url || failed ? homeImage : serviceImageUrl(service.image_url)} alt={service.name} loading="lazy" onError={() => setFailed(true)} />
}
const features = [[Leaf,'Không gian thư giãn','Lắng nghe cơ thể trong một khoảng yên.'],[Sparkles,'Liệu trình đa dạng','Chăm sóc theo nhu cầu của bạn.'],[Users,'Nhân viên phù hợp từng dịch vụ','Đồng hành trong từng liệu trình.'],[CalendarDays,'Đặt lịch thuận tiện','Chủ động dành thời gian cho bản thân.']]
export default function SpaHome() {
  const [services, setServices] = useState(null), [promotions, setPromotions] = useState(null)
  const [serviceError, setServiceError] = useState(false), [promotionError, setPromotionError] = useState(false)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    getServices({}, controller.signal).then(({ data }) => { if (active) setServices(data.data.slice(0,4)) }).catch(() => { if (active) setServiceError(true) })
    function loadPromotions() {
      getActivePromotions().then(({ data }) => { if (active) { setPromotions(data.data.slice(0,3)); setPromotionError(false) } }).catch(() => { if (active) { setPromotions([]); setPromotionError(true) } })
    }
    loadPromotions()
    const timer = setInterval(loadPromotions,60000)
    return () => { active = false; controller.abort(); clearInterval(timer) }
  }, [])
  return <div className="spa-home">
    <section className="home-hero relative isolate overflow-hidden bg-[#F3EBDD]">
      <img src={homeImage} alt="Liệu trình massage body thư giãn" className="absolute inset-0 -z-10 h-full w-full object-cover object-[65%_center]" /><div className="home-image-shade absolute inset-0 -z-10" />
      <div className="home-section flex min-h-[580px] items-center lg:min-h-[680px]"><div className="home-hero-copy"><p className="home-eyebrow">AN NHIÊN SPA</p><h1 className="mt-7 text-[clamp(40px,5vw,68px)] leading-[1.12] tracking-tight">Chạm vào sự thư giãn<br /><em>Đánh thức vẻ đẹp tự nhiên</em></h1><p className="mt-7 max-w-sm leading-7">Không gian chăm sóc và thư giãn dành riêng cho bạn.</p></div></div>
    </section>
    <section className="home-intro">
      <img src="/images/home-facial-wide.jpg" alt="Chăm sóc da mặt trong không gian Spa thư giãn" loading="lazy" />
      <div className="home-intro-shade" />
      <div className="home-section home-intro-copy"><div className="home-intro-text"><p className="home-eyebrow">Một khoảng lặng cho riêng bạn</p><h2 className="home-title">Thả lỏng cơ thể<br /><em>Tìm lại sự cân bằng</em></h2><p>An Nhiên mang đến những liệu trình chăm sóc nhẹ nhàng giúp bạn tạm rời nhịp sống bận rộn và dành thời gian cho chính mình.</p><div className="home-actions"><Link to="/services" className="home-button">Khám phá dịch vụ <ArrowUpRight size={16} /></Link><Link to="/booking" className="home-button home-button-secondary">Đặt lịch ngay</Link></div></div></div>
    </section>
    <section className="home-about"><div className="home-section home-about-editorial">
      <p className="home-eyebrow">TRIẾT LÝ AN NHIÊN</p>
      <h2 className="home-title mt-5">Nơi mỗi khoảnh khắc<br /><em>đều dành cho bạn.</em></h2>
      <div className="home-about-body"><p>Đôi khi, điều bạn cần chỉ là một khoảng lặng.<br />Lắng nghe cơ thể, thả lỏng tâm trí và chăm sóc bản thân theo cách nhẹ nhàng hơn.</p><p>Tìm một liệu trình phù hợp, chọn một khoảng thời gian riêng<br />và để An Nhiên đồng hành cùng bạn.</p></div>
      <p className="home-about-quote">“Sự cân bằng bắt đầu từ những điều thật giản dị.”</p>
    </div></section>
    <section className="home-section home-services"><div className="home-services-heading"><h2 className="home-title">Dịch vụ được yêu thích</h2><Link to="/services" className="home-button home-services-all">Xem tất cả dịch vụ ↗</Link></div>
      {serviceError ? <p role="alert">Chưa tải được dịch vụ. Vui lòng xem lại tại trang Dịch vụ.</p> : !services ? <p role="status">Đang tải dịch vụ…</p> : !services.length ? <p>Dịch vụ đang được cập nhật.</p> : <div className="home-service-grid grid sm:grid-cols-2 lg:grid-cols-4">{services.map(service => <article key={service.id} className="home-service-card group min-w-0"><Link to={`/services/${service.id}`} className="home-service-image"><div className="home-service-photo"><ServiceImage service={service} /></div><div className="home-service-copy"><p className="home-eyebrow">{service.category_name}</p><h3>{service.name}</h3><p className="home-service-meta">{formatPrice(service.price)} · {service.duration_minutes} phút</p><span className="home-service-link">Xem chi tiết →</span></div></Link></article>)}</div>}
    </section>
    <section className="home-features border-y border-[#E8D9C6] bg-[#FFF9F1]"><div className="home-section"><p className="home-eyebrow text-center">Vì sao chọn An Nhiên</p><h2 className="home-title mt-4 text-center">Không chỉ là một buổi chăm sóc</h2><div className="mt-12 grid gap-9 sm:grid-cols-2 lg:grid-cols-4">{features.map(([Icon,title,text]) => <article key={title}><Icon size={19} strokeWidth={1.4} className="mb-5 text-[#647653]" /><h3 className="text-xl">{title}</h3><p className="mt-3 text-sm leading-7">{text}</p></article>)}</div></div></section>
    <section className="home-section home-promotions"><p className="home-eyebrow">Thêm một chút yêu thương</p><h2 className="home-title mt-4 mb-9">Ưu đãi dành cho bạn</h2>{promotionError ? <p role="alert">Chưa tải được ưu đãi. Vui lòng xem lại tại trang Khuyến mãi.</p> : !promotions ? <p role="status">Đang tải ưu đãi…</p> : !promotions.length ? <p>Hiện chưa có chương trình khuyến mãi đang hiệu lực.</p> : <div className="home-promotion-grid">{promotions.map(item => <article key={item.id} className="home-promotion"><p className="home-eyebrow break-words">{item.code}</p><h3 className="mt-4 text-2xl">{item.name}</h3><p className="mt-5 text-xl text-[#596D49]">Giảm {formatDiscount(item)}</p><p className="mt-4 text-sm leading-6">Đơn tối thiểu: {formatPrice(item.minimum_amount)}</p>{item.max_discount_amount && <p className="text-sm leading-6">Giảm tối đa: {formatPrice(item.max_discount_amount)}</p>}<p className="mt-3 text-xs leading-6 text-[#786859]">{formatPromotionDate(item.start_at)} – {formatPromotionDate(item.end_at)}</p><Link className="home-button home-promotion-link" to="/promotions">Xem ưu đãi ↗</Link></article>)}</div>}</section>
    <section className="home-closing bg-[#C9D6C1]/65"><div className="home-section text-center"><Leaf className="mx-auto mb-6 text-[#596D49]" size={28} /><h2 className="home-title mx-auto max-w-2xl">Dành một khoảng thời gian<br /><em>cho chính bạn.</em></h2><p className="mt-6 leading-7">Chọn liệu trình phù hợp và đặt lịch tại An Nhiên Spa.</p><Link to="/booking" className="home-button mt-8">Đặt lịch ngay <ArrowUpRight size={16} /></Link></div></section>
  </div>
}





