/** Brand assets for quotation PDF / print */
function brandUrl(path) {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return window.location.origin + path
    }
  } catch (_) {}
  return path
}

export const HEXAGON_LOGO_DATA_URL = brandUrl('/quote-logo.jpg')
export const HEXAGON_PARTNERS_DATA_URL = brandUrl('/quote-partners.jpg')
export const HEXAGON_SIGNATURE_DATA_URL = ''

export const QUOTE_SIGNATORY = {
  name: 'Praveen Barthur',
  title: 'Hexagon B2B Solutions',
  phone: '9035698889',
  email: 'praveen@hexagonb2b.com',
  company: 'Hexagon B2B Solutions',
  tagline: 'IT Infrastructure | Security | Networking | Managed Services',
}
