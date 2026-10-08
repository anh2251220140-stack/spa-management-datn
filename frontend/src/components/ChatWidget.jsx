import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, X, Send } from 'lucide-react'
import { sendChat } from '../services/aiApi'
import { getChatError } from '../utils/chatError'
const suggestions = ['Spa có dịch vụ nào?', 'Khuyến mãi hiện tại?', 'Cách đặt lịch?', 'Mình muốn thư giãn thì nên chọn dịch vụ nào?']
export default function ChatWidget() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false), [messages, setMessages] = useState([])
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [failedRequest, setFailedRequest] = useState(null)
  const request = useRef(null), bottom = useRef(null), field = useRef(null), toggle = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { if (open) { bottom.current?.scrollIntoView({ block: 'nearest' }); } }, [messages, busy, open])
  useEffect(() => { if (open) field.current?.focus() }, [open])
  const hidden = /^\/(login|register|payment|booking|invoices)(\/|$)/.test(pathname)
  function close() { setOpen(false); toggle.current?.focus() }
  async function submit(event) {
    event.preventDefault()
    if (request.current) return
    const message = input.trim()
    if (!message || message.length > 1000) return
    const history = []
    let length = 0
    for (const item of messages.slice(-6).reverse()) {
      // Không cắt nội dung cũ; chỉ gửi đoạn history vừa giới hạn Backend.
      if (item.content.length > 2000 || length + item.content.length > 6000) break
      history.unshift(item); length += item.content.length
    }
    // History không chứa câu hỏi hiện tại; retry dùng lại đúng payload này.
    const payload = { message, history }
    setMessages(current => [...current, { role: 'user', content: message }])
    setInput('')
    await send(payload)
  }
  async function send(payload) {
    if (request.current) return
    const controller = new AbortController(); request.current = controller
    setBusy(true); setError(''); setFailedRequest(null)
    try {
      const response = await sendChat(payload, controller.signal)
      if (!controller.signal.aborted) { setMessages(current => [...current, {role:'assistant',content:response.data.data.reply}]) }
    } catch (err) {
      if (!controller.signal.aborted) {
        const chatError = getChatError(err)
        setError(chatError.message)
        setFailedRequest(chatError.canRetry ? payload : null)
      }
    }
    finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); field.current?.focus() } }
  }
  if (hidden) return null
  return <div className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 text-[#5A4638]">
    {open && <section role="dialog" aria-label="An Nhiên Spa AI" onKeyDown={event => { if(event.key==='Escape') close() }} className="mb-3 flex h-[560px] max-h-[75dvh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[20px] border border-[#E8D9C6] bg-[#FFFDF8] shadow-[0_12px_40px_rgba(90,70,56,0.12)] sm:w-[390px]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E8D9C6]/60 bg-[#FFF9F1] px-4 py-4">
        <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-[#C9D6C1]/60 text-[#526747]"><Bot size={22} aria-hidden="true" /></span><div><h2 className="font-semibold">An Nhiên Spa AI</h2><p className="mt-0.5 text-xs text-[#786859]">Tư vấn dịch vụ và ưu đãi</p></div></div>
        <button type="button" onClick={close} aria-label="Đóng trò chuyện" className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#786859] transition-colors hover:bg-[#E8D9C6]/40"><X size={18} /></button>
      </header>
      <p className="shrink-0 px-4 pt-3 text-[11px] leading-relaxed text-[#786859]">AI có thể trả lời chưa chính xác. Vui lòng kiểm tra thông tin quan trọng trước khi đặt lịch.</p>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4" role="log" aria-label="Hội thoại">
        {!messages.length && <div className="space-y-3"><p className="text-sm leading-relaxed">Mình có thể giúp bạn tìm hiểu dịch vụ Spa.</p><div className="flex flex-wrap gap-2">{suggestions.map(text => <button type="button" key={text} disabled={busy} onClick={() => {setInput(text);field.current?.focus()}} className="rounded-2xl border border-[#E8D9C6] bg-white px-3 py-2 text-left text-xs leading-relaxed transition-colors hover:border-[#8FA17F] hover:bg-[#C9D6C1]/25">{text}</button>)}</div></div>}
        {messages.map((item,index) => <p key={index} className={`w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-7 ${item.role==='user'?'ml-auto rounded-br-md bg-[#C9D6C1] text-[#3F5038]':'mr-auto rounded-bl-md border border-[#E8D9C6]/60 bg-white text-[#5A4638]'}`}><span className="sr-only">{item.role==='user'?'Bạn: ':'Trợ lý: '}</span>{item.content}</p>)}
        {busy && <div role="status" className="mr-auto flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md border border-[#E8D9C6]/60 bg-white px-4 py-4 text-[#788D69]"><span className="sr-only">Trợ lý đang trả lời…</span>{[0, 150, 300].map(delay => <span key={delay} aria-hidden="true" className="size-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: `${delay}ms`, animationDuration: '1.2s' }} />)}</div>}
        <div ref={bottom} />
      </div>
      <form onSubmit={submit} className="shrink-0 space-y-2 border-t border-[#E8D9C6]/60 bg-[#FFF9F1] p-3">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">{error}</p>}
        {failedRequest && <button type="button" disabled={busy} onClick={() => send(failedRequest)} className="rounded-full border border-[#E8D9C6] bg-white px-3 py-1.5 text-xs font-medium text-[#526747] hover:bg-[#C9D6C1]/25">Thử lại</button>}
        <label className="sr-only" htmlFor="spa-chat-message">Câu hỏi cho Spa</label>
        <div className="flex items-end gap-2">
          <textarea ref={field} id="spa-chat-message" rows={2} maxLength={1000} disabled={busy} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => {if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing) {event.preventDefault();event.currentTarget.form.requestSubmit()}}} className="min-w-0 flex-1 resize-none rounded-2xl border border-[#E8D9C6] bg-white px-3 py-2.5 text-base leading-6 placeholder:text-[#978A7E] focus:border-[#8FA17F] focus:outline-none focus:ring-2 focus:ring-[#C9D6C1]/60 disabled:opacity-60 sm:text-sm" placeholder="Nhập câu hỏi…" />
          <button type="submit" disabled={busy||!input.trim()} aria-label={busy?'Đang gửi…':'Gửi câu hỏi'} className="mb-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-[#526747] text-white transition-colors hover:bg-[#43563A] disabled:opacity-40"><Send size={18} aria-hidden="true" /></button>
        </div>
      </form>
    </section>}
    <button ref={toggle} onClick={() => setOpen(value=>!value)} aria-label={open?'Đóng trợ lý Spa':'Mở trợ lý Spa'} aria-expanded={open} className="ml-auto flex size-14 items-center justify-center rounded-full border border-[#C9D6C1] bg-[#526747] text-white shadow-[0_4px_16px_rgba(90,70,56,0.16)] transition-colors hover:bg-[#43563A]"><Bot size={24} aria-hidden="true" /></button>
  </div>
}
