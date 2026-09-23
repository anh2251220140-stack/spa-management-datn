// setTimeout nối tiếp: không chồng request; có deadline kể cả khi mạng bị treo.
export function pollInvoice(load, onResult, { interval = 3000, timeout = 300000 } = {}) {
  const controller = new AbortController()
  let stopped = false, timer
  const stop = () => { stopped = true; clearTimeout(timer); clearTimeout(deadline); controller.abort() }
  const finish = (status, invoice) => { if (stopped) return; stop(); onResult(status, invoice) }
  const deadline = setTimeout(() => finish('timeout'), timeout)
  async function check() {
    try {
      const invoice = await load(controller.signal)
      if (stopped) return
      if (['paid', 'cancelled', 'failed'].includes(invoice.payment_status)) return finish(invoice.payment_status, invoice)
    } catch (error) {
      if (stopped) return
      if ([401, 403, 404].includes(error.response?.status)) return finish('error')
    }
    if (!stopped) timer = setTimeout(check, interval)
  }
  timer = setTimeout(check, interval)
  return stop
}
