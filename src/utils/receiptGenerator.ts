/**
 * Generates high-fidelity fuel paper receipt images on canvas
 * to enable realistic offline receipt capture and review.
 */
export function generateSampleReceiptImage(details: {
  shiftNumber: string
  attendantName: string
  stationName: string
  fuelType: string
  litres: number
  pricePerLitre: number
  totalAmount: number
  paymentMethod: string
  dateStr?: string
}): string {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 680
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // Paper thermal background with subtle texture
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Receipt border paper tears effect
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(15, 15, canvas.width - 30, canvas.height - 30)

  // Crumple / thermal gradient shadow
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, 'rgba(0,0,0,0.01)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.04)')
  grad.addColorStop(1, 'rgba(0,0,0,0.08)')
  ctx.fillStyle = grad
  ctx.fillRect(15, 15, canvas.width - 30, canvas.height - 30)

  // Thermal ink style
  ctx.fillStyle = '#1e293b'
  ctx.textAlign = 'center'

  // Header
  ctx.font = 'bold 20px monospace'
  ctx.fillText('PETROVIEW PETROLEUM', 200, 60)
  ctx.font = '13px monospace'
  ctx.fillText(details.stationName.toUpperCase(), 200, 85)
  ctx.fillText('STATION CODE: GV-042 • TEL: +233 30 200 1234', 200, 105)
  ctx.fillText('========================================', 200, 125)

  // Metadata
  ctx.textAlign = 'left'
  ctx.font = '12px monospace'
  const date = details.dateStr || new Date().toLocaleString('en-US')
  ctx.fillText(`DATE/TIME : ${date}`, 35, 150)
  ctx.fillText(`RECEIPT NO: RCPT-${Math.floor(100000 + Math.random() * 900000)}`, 35, 170)
  ctx.fillText(`SHIFT REF : ${details.shiftNumber}`, 35, 190)
  ctx.fillText(`ATTENDANT : ${details.attendantName}`, 35, 210)
  ctx.fillText(`PUMP / NOZ: PUMP 1 / NOZZLE 1`, 35, 230)

  ctx.textAlign = 'center'
  ctx.fillText('----------------------------------------', 200, 255)

  // Items
  ctx.textAlign = 'left'
  ctx.font = 'bold 13px monospace'
  ctx.fillText('PRODUCT', 35, 280)
  ctx.textAlign = 'right'
  ctx.fillText('AMOUNT (GHS)', 365, 280)

  ctx.font = '13px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(details.fuelType, 35, 310)
  ctx.textAlign = 'right'
  ctx.fillText(details.totalAmount.toFixed(2), 365, 310)

  ctx.font = '12px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`  ${details.litres.toFixed(2)} Ltrs @ GHS ${details.pricePerLitre.toFixed(2)}/L`, 35, 335)

  ctx.textAlign = 'center'
  ctx.fillText('----------------------------------------', 200, 370)

  // Totals
  ctx.textAlign = 'left'
  ctx.font = 'bold 15px monospace'
  ctx.fillText('TOTAL DUE:', 35, 405)
  ctx.textAlign = 'right'
  ctx.fillText(`GHS ${details.totalAmount.toFixed(2)}`, 365, 405)

  ctx.textAlign = 'left'
  ctx.font = '13px monospace'
  ctx.fillText(`PAID VIA (${details.paymentMethod.toUpperCase()}):`, 35, 435)
  ctx.textAlign = 'right'
  ctx.fillText(`GHS ${details.totalAmount.toFixed(2)}`, 365, 435)

  ctx.fillText('CHANGE / BALANCE:', 35, 460)
  ctx.fillText('GHS 0.00', 365, 460)

  // Barcode / Footer
  ctx.textAlign = 'center'
  ctx.fillText('========================================', 200, 495)
  ctx.font = '11px monospace'
  ctx.fillText('OFFLINE TRANSACTION COMMITTED TO LOCAL DB', 200, 520)
  ctx.fillText('THANK YOU FOR YOUR PATRONAGE!', 200, 540)
  ctx.fillText('*** PETROVIEW FORECOURT OS ***', 200, 560)

  // Pseudo barcode
  ctx.fillStyle = '#0f172a'
  const barcodeY = 580
  for (let x = 60; x < 340; x += 4) {
    if (Math.random() > 0.3) {
      ctx.fillRect(x, barcodeY, (Math.random() > 0.5 ? 2 : 1), 40)
    }
  }

  return canvas.toDataURL('image/jpeg', 0.85)
}
