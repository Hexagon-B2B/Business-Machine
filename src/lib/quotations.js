import { supabase } from '../supabase'
import { logActivity } from './activityLog'

export const DEFAULT_TAX_PCT = 18

export function emptyItem(overrides = {}) {
  return {
    id: 'tmp_' + Math.random().toString(36).slice(2, 9),
    line_type: 'product',
    parent_id: null,
    product_name: '',
    specification: '',
    brand: '',
    model_part_no: '',
    vendor: '',
    quantity: 1,
    transfer_price: '',
    customer_price: '',
    margin_pct: '',
    min_margin_pct: '',
    billing: 'on_bill',
    charge_kind: '',
    notes: '',
    optionality: 'mandatory',
    ...overrides,
  }
}

export function emptyUpgrade(parentId, quantity = 1) {
  return emptyItem({ line_type: 'upgrade', parent_id: parentId, quantity: quantity || 1 })
}

export function emptyCharge(kind) {
  const k = typeof kind === 'string' && kind ? kind : 'other'
  return emptyItem({
    line_type: 'charge',
    charge_kind: k,
    product_name: k === 'installation' ? 'Installation' : k === 'warranty' ? 'Warranty' : k === 'transport' ? 'Transport' : '',
    quantity: 1,
    billing: 'on_bill',
  })
}

export function lineTransferTotal(item) {
  const q = Number(item.quantity) || 0
  const p = Number(item.transfer_price ?? item.cost_price) || 0
  return Math.round(q * p * 100) / 100
}

export function childUpgrades(items, parentId) {
  return (items || []).filter(it => it.line_type === 'upgrade' && String(it.parent_id) === String(parentId))
}

export function groupRollup(base, items) {
  const ups = childUpgrades(items, base.id)
  const qty = Number(base.quantity) || 1
  const baseUnitTP = Number(base.transfer_price ?? base.cost_price) || 0
  let unitUpTP = 0
  let unitUpSell = 0
  let upgradeStdExtra = 0
  for (const u of ups) {
    const uUnitTP = Number(u.transfer_price ?? u.cost_price) || 0
    const perBaseUnitTP = uUnitTP
    unitUpTP += perBaseUnitTP
    let std = null
    if (u.margin_pct !== '' && u.margin_pct != null) {
      const n = Number(u.margin_pct)
      if (!Number.isNaN(n)) std = n
    }
    if (std == null && u.min_margin_pct !== '' && u.min_margin_pct != null) {
      const n = Number(u.min_margin_pct)
      if (!Number.isNaN(n)) std = n
    }
    const sell = std != null ? perBaseUnitTP * (1 + std / 100) : perBaseUnitTP
    unitUpSell += sell
    upgradeStdExtra += sell - perBaseUnitTP
  }
  unitUpTP = Math.round(unitUpTP * 100) / 100
  unitUpSell = Math.round(unitUpSell * 100) / 100
  upgradeStdExtra = Math.round(upgradeStdExtra * 100) / 100
  const baseXfer = Math.round(baseUnitTP * qty * 100) / 100
  const upXfer = Math.round(unitUpTP * qty * 100) / 100
  const transferTotal = Math.round((baseXfer + upXfer) * 100) / 100
  const parts = []
  const baseName = (base.product_name || '').trim() || 'Product'
  const baseSpec = [base.brand, base.specification].filter(Boolean).join(' ')
  parts.push(baseSpec ? `${baseName} (${baseSpec})` : baseName)
  for (const u of ups) {
    const un = (u.product_name || '').trim()
    if (!un) continue
    const us = [u.brand, u.specification].filter(Boolean).join(' ')
    parts.push(us ? `${un} (${us})` : un)
  }
  const mergedDescription =
    ups.length > 0
      ? `${parts[0]} + ${parts.slice(1).join(' + ')} [additional to base: ${ups.length} upgrade${ups.length > 1 ? 's' : ''}]`
      : parts[0]
  let minMarginPct = null
  if (base.min_margin_pct !== '' && base.min_margin_pct != null) {
    const m = Number(base.min_margin_pct)
    if (!Number.isNaN(m)) minMarginPct = m
  }
  let markupPct = null
  if (base.margin_pct !== '' && base.margin_pct != null) {
    const m = Number(base.margin_pct)
    if (!Number.isNaN(m)) markupPct = m
  }
  const packageUnitBeforeMin = Math.round((baseUnitTP + unitUpSell) * 100) / 100
  let packageUnit = packageUnitBeforeMin
  if (minMarginPct != null) {
    packageUnit = packageUnit * (1 + minMarginPct / 100)
  }
  const packageUnitAfterMin = Math.round(packageUnit * 100) / 100
  let unitCustomer
  if (markupPct != null || minMarginPct != null) {
    unitCustomer = markupPct != null ? packageUnit * (1 + markupPct / 100) : packageUnit
  } else if (base.customer_price !== '' && base.customer_price != null && !Number.isNaN(Number(base.customer_price))) {
    unitCustomer = Number(base.customer_price)
  } else {
    unitCustomer = packageUnitBeforeMin
  }
  unitCustomer = Math.round(unitCustomer * 100) / 100
  let customerTotal = Math.round(unitCustomer * qty * 100) / 100
  if (base.billing === 'off_invoice') customerTotal = 0
  const effectiveMargin =
    transferTotal > 0 ? Math.round(((customerTotal - transferTotal) / transferTotal) * 1000) / 10 : 0
  const belowMin = minMarginPct != null && effectiveMargin < minMarginPct - 0.05
  const displayMargin = markupPct != null ? markupPct : effectiveMargin
  return {
    base, upgrades: ups, transferTotal, customerTotal, upgradeStdExtra,
    marginPct: displayMargin != null && !Number.isNaN(displayMargin) ? displayMargin : effectiveMargin,
    minMarginPct, markupPct, belowMin, mergedDescription, qty, unitCustomer,
    packageUnitBeforeMin, packageUnitAfterMin, unitUpSell, baseUnitTP,
    isOptional: (base.optionality || 'mandatory') === 'optional',
  }
}

export function quoteGroups(items) {
  const products = (items || []).filter(it => (it.line_type || 'product') === 'product')
  return products.map(p => groupRollup(p, items))
}

export function lineCustomerTotal(item) {
  if (item.line_type === 'upgrade') return 0
  if (item.billing === 'off_invoice') return 0
  const q = Number(item.quantity) || 0
  const p = Number(item.customer_price ?? item.unit_price) || 0
  return Math.round(q * p * 100) / 100
}

export function quoteCustomerTotal(items) {
  const groups = quoteGroups(items)
  const productCust = groups.reduce((s, g) => s + (g.customerTotal || 0), 0)
  const charges = (items || []).filter(it => it.line_type === 'charge')
  const chargeCust = charges.reduce((s, c) => s + lineCustomerTotal(c), 0)
  return Math.round((productCust + chargeCust) * 100) / 100
}

export function quoteTransferTotal(items) {
  return Math.round((items || []).reduce((s, it) => s + lineTransferTotal(it), 0) * 100) / 100
}

export function quoteMargin(items) {
  const cust = quoteCustomerTotal(items)
  const xfer = quoteTransferTotal(items)
  const amount = Math.round((cust - xfer) * 100) / 100
  const pct = xfer > 0 ? Math.round((amount / xfer) * 1000) / 10 : 0
  return { amount, pct }
}

function normalizeItem(it) {
  return {
    ...emptyItem(), ...it,
    id: it.id || 'tmp_' + Math.random().toString(36).slice(2, 9),
    transfer_price: it.transfer_price ?? it.cost_price ?? '',
    customer_price: it.customer_price ?? it.unit_price ?? '',
    margin_pct: it.margin_pct ?? '',
    min_margin_pct: it.min_margin_pct ?? '',
    line_type: it.line_type || 'product',
    billing: it.billing || 'on_bill',
    optionality: it.optionality === 'optional' ? 'optional' : 'mandatory',
  }
}

function nextQuoteNo(quotes) {
  const year = new Date().getFullYear()
  const prefix = `HQ-${year}-`
  let max = 0
  for (const q of quotes || []) {
    const no = String(q.quotation_no || '')
    if (no.startsWith(prefix)) {
      const n = parseInt(no.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return prefix + String(max + 1).padStart(4, '0')
}

export function customerQuoteNo(quote) {
  if (!quote) return ''
  const base = quote.quotation_no || ''
  if (!base) return ''
  const ver = Number(quote.version) || 1
  return base + '-V' + ver
}
