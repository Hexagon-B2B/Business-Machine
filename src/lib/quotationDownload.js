import { formatQuotePrintHtml } from './quotationPrintHtml'
import { customerQuoteNo } from './quotationMath'

/**
 * Compact PDF for email (target: typically 80–250 KB for 1–3 page quotes).
 * Uses scale 1.0 + JPEG quality 0.52 + jsPDF compress.
 */
export async function downloadQuotePdf(quote, opts = {}) {
  const html = formatQuotePrintHtml(quote, opts)
  if (!html) return { error: { message: 'Nothing to export' } }
  const qno = customerQuoteNo(quote) || 'quotation'
  const safeName = String(qno).replace(/[^\w.\-]+/g, '_') + '.pdf'
  try {
    const host = document.createElement('div')
    host.id = 'hexagon-quote-pdf-host'
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;pointer-events:none;opacity:0;'
    document.body.appendChild(host)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'width:794px;height:1123px;border:0;'
    host.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()
    await new Promise((resolve) => {
      const imgs = Array.from(doc.images || [])
      if (!imgs.length) { setTimeout(resolve, 150); return }
      let left = imgs.length
      const done = () => { left -= 1; if (left <= 0) setTimeout(resolve, 80) }
      imgs.forEach((img) => { if (img.complete) done(); else { img.onload = done; img.onerror = done } })
      setTimeout(resolve, 1800)
    })
    if (!window.__hexagonPdfLibs) {
      const [hcMod, jpMod] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm'),
        import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'),
      ])
      window.__hexagonPdfLibs = {
        html2canvas: hcMod.default || hcMod,
        jsPDF: jpMod.jsPDF || jpMod.default?.jsPDF || jpMod.default,
      }
    }
    const { html2canvas, jsPDF } = window.__hexagonPdfLibs
    if (!html2canvas || !jsPDF) throw new Error('PDF libraries failed to load')

    // Low scale + aggressive JPEG for email size (KB range on short quotes)
    const canvas = await html2canvas(doc.body, {
      scale: 1.0,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      imageTimeout: 2500,
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.52)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    let heightLeft = imgH
    let position = 0
    // 'SLOW' = better compression in jsPDF
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'SLOW')
    heightLeft -= pageH
    while (heightLeft > 0.5) {
      position = heightLeft - imgH
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'SLOW')
      heightLeft -= pageH
    }
    pdf.save(safeName)
    try { host.remove() } catch (_) {}
    return { error: null }
  } catch (e) {
    try {
      const host = document.getElementById('hexagon-quote-pdf-host')
      if (host) host.remove()
    } catch (_) {}
    return { error: { message: e?.message || 'PDF export failed' } }
  }
}

export function openQuotePrintWindow(quote, opts = {}) {
  return downloadQuotePdf(quote, opts)
}
