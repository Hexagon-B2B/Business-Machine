/** Company logo for quotation PDF — prefers Settings upload, else public asset */
export const DEFAULT_LOGO_PATH = '/quote-logo.jpg'
export const LOGO_STORAGE_KEY = 'hexagon_quote_logo'

/** Synchronous read for PDF/print. Returns data URL or same-origin path. */
export function getQuoteLogoUrl() {
  try {
    const stored = localStorage.getItem(LOGO_STORAGE_KEY)
    if (stored && (stored.startsWith('data:image') || stored.startsWith('http') || stored.startsWith('/'))) {
      return stored
    }
  } catch (_) {}
  return DEFAULT_LOGO_PATH
}

/** @deprecated use getQuoteLogoUrl — kept for existing imports */
export const HEXAGON_LOGO_DATA_URL = DEFAULT_LOGO_PATH

/**
 * Resize image file to fit PDF use (max width/height), return JPEG data URL.
 * Accepts any size; output is constrained for storage and print clarity.
 */
export function resizeLogoFile(file, { maxW = 900, maxH = 280, quality = 0.88 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file (PNG, JPG, WebP, etc.).'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let w = img.naturalWidth || img.width
        let h = img.naturalHeight || img.height
        if (!w || !h) { reject(new Error('Invalid image.')); return }
        const scale = Math.min(1, maxW / w, maxH / h)
        const tw = Math.max(1, Math.round(w * scale))
        const th = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = tw
        canvas.height = th
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, tw, th)
        ctx.drawImage(img, 0, 0, tw, th)
        try {
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (e) {
          reject(e)
        }
      }
      img.onerror = () => reject(new Error('Could not load image.'))
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function saveQuoteLogo(dataUrl) {
  localStorage.setItem(LOGO_STORAGE_KEY, dataUrl)
}

export function clearQuoteLogo() {
  localStorage.removeItem(LOGO_STORAGE_KEY)
}
