import {
  quoteGroups, lineCustomerTotal, customerQuoteNo, DEFAULT_TAX_PCT,
} from './quotationMath'

function formatDisplayDate(iso) {
  if (!iso) return '—'
  const raw = String(iso).slice(0, 10)
  const d = new Date(raw + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return String(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear()
}
export function formatQuotePrintHtml(quote, opts = {}) {
  if (!quote) return ''
  const items = quote.quotation_items || []
  const groups = quoteGroups(items)
  const signatory = opts.signatory || {
    name: 'Praveen Barthur', title: 'Hexagon B2B Solutions', phone: '9035698889',
    email: 'praveen@hexagonb2b.com', company: 'Hexagon B2B Solutions',
    tagline: 'IT Infrastructure | Security | Networking | Managed Services',
  }
  function resolveAssetUrl(u) {
    if (!u) return ''
    const s = String(u)
    if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('blob:')) return s
    try { return new URL(s, typeof window !== 'undefined' ? window.location.origin : 'https://hexagon-b2b-os.vercel.app').href } catch (_) { return s }
  }
  const logo = resolveAssetUrl(opts.logoDataUrl || '')
  const partners = resolveAssetUrl(opts.partnersDataUrl || '')
  const companyName = opts.companyName || 'Customer'
  const companyCity = opts.companyCity || ''
  const attentionTo = opts.attentionTo || ''
  const oppName = opts.opportunityName || ''
  const deliveryLocation = opts.deliveryLocation || quote.delivery_location || quote.delivery_loc || ''
  const qno = customerQuoteNo(quote)
  const dated = formatDisplayDate(quote.created_at || new Date().toISOString())
  const validityDisp = formatDisplayDate(quote.validity_date)
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"')
  }
  let sl = 0
  let bodyRows = ''
  for (const g of groups.filter(x => !x.isOptional)) {
    sl += 1
    const rate = g.unitCustomer != null ? g.unitCustomer : (g.qty ? Math.round((g.customerTotal / g.qty) * 100) / 100 : 0)
    const name = (g.base.product_name || 'Product').trim()
    const spec = [g.base.brand, g.base.specification].filter(Boolean).join(' · ')
    const ups = (g.upgrades || []).map(u => (u.product_name || '').trim()).filter(Boolean)
    bodyRows += '<tr><td class="sl">' + sl + '</td><td class="desc"><div class="pname">' + esc(name) + '</div>' +
      (spec ? '<div class="pspec">' + esc(spec) + '</div>' : '') +
      (ups.length ? '<div class="pinc"><strong>Additional to base configuration:</strong> ' + esc(ups.join('; ')) + '</div>' : '') +
      '</td><td class="num">' + g.qty + '</td><td class="num">' + Number(rate).toLocaleString('en-IN') +
      '</td><td class="num amt">' + Number(g.customerTotal || 0).toLocaleString('en-IN') + '</td></tr>'
  }
  const optional = groups.filter(x => x.isOptional)
  if (optional.length) {
    bodyRows += '<tr class="sec"><td colspan="5">Optional items</td></tr>'
    for (const g of optional) {
      sl += 1
      const rate = g.unitCustomer != null ? g.unitCustomer : (g.qty ? Math.round((g.customerTotal / g.qty) * 100) / 100 : 0)
      const name = (g.base.product_name || 'Product').trim()
      const spec = [g.base.brand, g.base.specification].filter(Boolean).join(' · ')
      bodyRows += '<tr><td class="sl">' + sl + '</td><td class="desc"><div class="pname">' + esc(name) +
        ' <span class="opt">(Optional)</span></div>' + (spec ? '<div class="pspec">' + esc(spec) + '</div>' : '') +
        '</td><td class="num">' + g.qty + '</td><td class="num">' + Number(rate).toLocaleString('en-IN') +
        '</td><td class="num amt">' + Number(g.customerTotal || 0).toLocaleString('en-IN') + '</td></tr>'
    }
  }
  for (const c of items.filter(it => it.line_type === 'charge')) {
    sl += 1
    const amt = (Number(c.quantity) || 1) * (Number(c.customer_price) || 0)
    bodyRows += '<tr><td class="sl">' + sl + '</td><td class="desc"><div class="pname">' +
      esc(c.product_name || c.charge_kind || 'Charge') + '</div></td><td class="num">' + (c.quantity || 1) +
      '</td><td class="num">' + Number(c.customer_price || 0).toLocaleString('en-IN') +
      '</td><td class="num amt">' + Number(amt).toLocaleString('en-IN') + '</td></tr>'
  }
  const total = Number(quote.total_value || 0).toLocaleString('en-IN')
  const tcHtml =
    '<div class="tc-block"><h3>Terms & Conditions</h3><ol class="tc-list">' +
    '<li><strong>Validity:</strong> This quotation is valid for the period stated above, unless withdrawn earlier by written notice.</li>' +
    '<li><strong>Prices:</strong> Prices are in INR and exclusive of applicable taxes unless stated otherwise. Taxes will be charged extra as per prevailing rates.</li>' +
    '<li><strong>PO & Acceptance:</strong> A firm PO quoting the HEXAGON B2B SOLUTIONS quotation reference is required for order processing, along with complete Bill To/Ship To, GST/PAN and contact details.</li>' +
    '<li><strong>Delivery:</strong> Delivery timelines are indicative and subject to OEM/vendor stock and logistics. Risk passes on delivery to the carrier or customer location as agreed.</li>' +
    '<li><strong>Payment:</strong> As per payment terms stated in this quotation. Delayed payment may attract interest and/or hold on support/services.</li>' +
    '<li><strong>Warranty:</strong> Manufacturer/OEM warranty applies as offered by the OEM unless a separate Hexagon warranty is expressly stated in writing.</li>' +
    '<li><strong>Compatibility:</strong> Products/solutions are supplied as per the customer\'s specified requirement. HEXAGON B2B SOLUTIONS shall not be responsible for incompatibility arising from customer requirements or third-party products.</li>' +
    '<li><strong>Returns:</strong> Returns are subject to OEM policy and prior written approval. Opened software licenses are non-returnable.</li>' +
    '<li><strong>Ownership:</strong> Goods/materials/licenses remain the property of HEXAGON B2B SOLUTIONS until full payment of the applicable invoice.</li>' +
    '<li><strong>Terms:</strong> In case of conflict, the T&C stated in this quotation shall prevail unless otherwise agreed and accepted in writing by HEXAGON B2B SOLUTIONS.</li>' +
    '<li><strong>Force Majeure:</strong> HEXAGON B2B SOLUTIONS shall not be liable for delays/non-performance due to circumstances beyond its reasonable control, including OEM/vendor delays, government restrictions, natural calamities, strikes, war or other force majeure events.</li>' +
    '</ol></div>'
  const payHtml =
    '<div class="pay-block"><h3>Payment Information</h3><div class="pay-grid">' +
    '<div><span class="k">Account Name</span><span class="v">HEXAGON B2B SOLUTIONS</span></div>' +
    '<div><span class="k">Bank</span><span class="v">Canara Bank</span></div>' +
    '<div><span class="k">Branch</span><span class="v">Jayanagar 4th Block, Bengaluru</span></div>' +
    '<div><span class="k">Account No.</span><span class="v">120002221123</span></div>' +
    '<div><span class="k">IFSC</span><span class="v">CNRB0000426</span></div>' +
    '<div><span class="k">GSTIN</span><span class="v">29AAGFH1234A1Z5</span></div>' +
    '</div></div>'
  const partnersHtml = partners
    ? '<div class="partners"><div class="partners-label">Trusted Technology Partners — enquire with us for these brands</div>' +
      '<img src="' + partners + '" alt="Trusted Technology Partners"/></div>'
    : ''
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Quotation ' + esc(qno) + '</title><style>' +
    'body{font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:24px;font-size:12.5px;line-height:1.45}' +
    '.doc{max-width:720px;margin:0 auto}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;border-bottom:2px solid #0f172a;padding-bottom:12px}' +
    '.logo-wrap{flex:0 0 auto;max-width:280px;max-height:72px}' +
    '.logo-wrap img,.logo{max-width:280px;max-height:72px;width:auto;height:auto;object-fit:contain;object-position:left center;display:block}' +
    '.doc-title{text-align:right}.doc-title .label{font-size:10px;letter-spacing:.14em;font-weight:700;color:#64748b;text-transform:uppercase}' +
    '.doc-title h1{margin:2px 0 0;font-size:22px;letter-spacing:.04em}' +
    '.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;margin-bottom:12px}' +
    '.box{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc}' +
    '.box h3{margin:0 0 6px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#64748b}' +
    '.box .v{font-size:14px;font-weight:700}' +
    '.terms{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}' +
    '.term{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}.term label{display:block;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:2px}' +
    'table{width:100%;border-collapse:collapse;margin-top:4px}th{background:#f1f5f9;text-align:left;padding:7px 8px;font-size:11px;border-bottom:1px solid #cbd5e1}' +
    'td{padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.sl{width:36px;color:#64748b}.num{text-align:right;white-space:nowrap}.amt{font-weight:600}' +
    '.pname{font-weight:600}.pspec{font-size:11px;color:#475569;margin-top:2px}.pinc{font-size:11px;color:#64748b;margin-top:3px}' +
    '.sec td{background:#f8fafc;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#475569}' +
    '.opt{font-size:11px;color:#b45309;font-weight:600}' +
    '.totals{margin-top:12px;margin-left:auto;width:280px}.totals div{display:flex;justify-content:space-between;padding:3px 0}.totals .grand{font-weight:800;font-size:14px;border-top:2px solid #0f172a;margin-top:6px;padding-top:8px}' +
    '.foot{display:flex;justify-content:space-between;margin-top:22px;gap:20px}.sig{text-align:right}.muted{color:#64748b;font-size:11px;margin-top:8px}' +
    '.tc-block{margin-top:22px;page-break-inside:avoid}.tc-block h3,.pay-block h3{margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #0f172a;padding-bottom:4px}' +
    '.tc-list{margin:0;padding-left:18px;font-size:10.5px;color:#334155}.tc-list li{margin-bottom:4px}' +
    '.pay-block{margin-top:16px;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;page-break-inside:avoid}' +
    '.pay-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:11px}.pay-grid .k{color:#64748b;display:block;font-size:9px;text-transform:uppercase;letter-spacing:.06em}.pay-grid .v{font-weight:600}' +
    '.partners{margin-top:18px;text-align:center;page-break-inside:avoid}.partners-label{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin-bottom:8px}' +
    '.partners img{max-width:100%;height:auto;max-height:110px;object-fit:contain}' +
    '</style></head><body><div class="doc">' +
    '<div class="top"><div>' + (logo ? '<div class="logo-wrap"><img class="logo" src="' + logo + '" alt="Hexagon B2B Solutions"/></div>' : '<div style="font-weight:800;font-size:18px;color:#1e3a8a">HEXAGON B2B SOLUTIONS</div>') +
    '</div><div class="doc-title"><div class="label">Commercial document</div><h1>QUOTATION</h1><div style="margin-top:6px;font-size:12px;color:#475569">Dated ' + esc(dated) + '</div></div></div>' +
    '<div class="meta"><div class="box"><h3>Prepared for</h3><div class="v">' + esc(companyName) + '</div>' +
    (companyCity ? '<div style="margin-top:2px;color:#475569;font-size:12px">' + esc(companyCity) + '</div>' : '') +
    (attentionTo ? '<div style="margin-top:6px;font-size:12.5px"><strong>Kind Attention to:</strong> ' + esc(attentionTo) + '</div>' : '') +
    (oppName ? '<div style="margin-top:4px;color:#64748b;font-size:11.5px">Ref: ' + esc(oppName) + '</div>' : '') +
    '</div><div class="box"><h3>Quotation details</h3><div><strong>Quote No.:</strong> ' + esc(qno) +
    '</div><div><strong>Status:</strong> ' + esc((quote.status || 'draft').toUpperCase()) + '</div></div></div>' +
    '<div class="terms">' +
    '<div class="term"><label>Validity</label>' + esc(validityDisp) + '</div>' +
    '<div class="term"><label>Delivery TAT</label>' + esc(quote.delivery_tat || '—') + '</div>' +
    '<div class="term"><label>Payment terms</label>' + esc(quote.payment_terms || '—') + '</div>' +
    '<div class="term"><label>Delivery location</label>' + esc(deliveryLocation || quote.transport_terms || '—') + '</div></div>' +
    '<table><thead><tr><th class="sl">SL</th><th>Description</th><th class="num">Qty</th><th class="num">Unit rate (₹)</th><th class="num">Amount (₹)</th></tr></thead><tbody>' +
    bodyRows + '</tbody></table>' +
    '<div class="totals"><div><span>Subtotal (ex-tax)</span><span>₹ ' + total + '</span></div>' +
    '<div class="grand"><span>Quoted value</span><span>₹ ' + total + '</span></div></div>' +
    (quote.revision_reason ? '<div style="margin-top:14px"><strong>Revision</strong><div class="muted">' + esc(quote.revision_reason) + '</div></div>' : '') +
    '<div class="foot"><div><div>For ' + esc(companyName) + '</div><div class="muted" style="margin-top:36px">Authorised signatory</div></div>' +
    '<div class="sig"><div>For ' + esc(signatory.company) + '</div><div style="font-weight:700;margin-top:8px">' + esc(signatory.name) + '</div>' +
    '<div>' + esc(signatory.title) + '</div><div>M: ' + esc(signatory.phone) + '</div><div>' + esc(signatory.email) + '</div></div></div>' +
    tcHtml + payHtml + partnersHtml +
    '<div class="muted" style="margin-top:12px;text-align:center">This is a computer-generated quotation from Hexagon B2B Solutions.</div>' +
    '</div></body></html>'
}
