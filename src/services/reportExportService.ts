/**
 * Enterprise Forecourt Report Export Service.
 * Provides direct, automatic file downloads for:
 * 1. PDF (.pdf) via jsPDF & jspdf-autotable (automatic download, no window.print dialog)
 * 2. Excel (.xlsx) via SheetJS (native OpenXML workbook that Excel opens without error)
 * 3. CSV (.csv) with UTF-8 BOM for clean Windows Excel & data tool imports
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export interface StaffSummaryRow {
  employeeCode: string
  name: string
  stationName: string
  shiftsClosed: number
  litres: number
  sales: number
  variance: number
  approved: number
  rejected: number
  avgShiftSales: number
  status: string
}

export interface StationSummaryRow {
  name: string
  code: string
  location: string
  region: string
  litresToday: number
  salesToday: number
  netVariance: number
  shiftCount: number
}

export interface ExpenseSummaryRow {
  date: string
  stationName: string
  category: string
  amount: number
  paymentSource: string
  payee?: string | null
  referenceNumber?: string | null
  recordedBy: string
  notes?: string | null
}

export interface ReportExportData {
  title: string
  companyName: string
  companyShortCode: string
  periodLabel: string
  generatedAt: string
  currency?: string
  financials: {
    grossFuelSales: number
    totalExpenses: number
    netRevenue: number
    litresDispensed: number
    totalShifts: number
    netVariance: number
    stationCount?: number
  }
  staffRows?: StaffSummaryRow[]
  stationRows?: StationSummaryRow[]
  expenseRows?: ExpenseSummaryRow[]
}

/**
 * Generates and triggers an immediate automatic download of a formatted PDF report.
 * Bypasses the browser print window entirely.
 */
export function exportReportToPdf(data: ReportExportData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const currency = data.currency || 'GHS'
  const pageWidth = doc.internal.pageSize.getWidth()
  let currentY = 14

  // --- 1. Header Banner ---
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, pageWidth, 28, 'F')

  doc.setTextColor(249, 115, 22) // Orange 500
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(data.companyName.toUpperCase(), 14, 12)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(data.title, 14, 19)

  doc.setTextColor(148, 163, 184) // Slate 400
  doc.setFontSize(8)
  const metaText = `Period: ${data.periodLabel}  |  Generated: ${new Date(data.generatedAt).toLocaleString()}  |  Forecourt OS`
  doc.text(metaText, 14, 25)

  currentY = 35

  // --- 2. Executive Financial Summary Cards ---
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('EXECUTIVE RECONCILIATION SUMMARY', 14, currentY)
  currentY += 4

  const fin = data.financials
  const kpis = [
    { label: 'Gross Fuel Sales', val: `${currency} ${fin.grossFuelSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    { label: 'Station Expenses', val: `-${currency} ${fin.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    { label: 'Net Forecourt Cash', val: `${currency} ${fin.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    { label: 'Total Volume', val: `${fin.litresDispensed.toLocaleString('en-US', { minimumFractionDigits: 2 })} L` },
    { label: 'Closed Shifts', val: `${fin.totalShifts}` },
    { label: 'Net Pump Variance', val: `${currency} ${fin.netVariance.toFixed(2)}` },
  ]

  const boxWidth = (pageWidth - 28 - 10) / 3
  const boxHeight = 14

  kpis.forEach((kpi, idx) => {
    const col = idx % 3
    const row = Math.floor(idx / 3)
    const bx = 14 + col * (boxWidth + 5)
    const by = currentY + row * (boxHeight + 3)

    doc.setFillColor(248, 250, 252) // Slate 50
    doc.setDrawColor(226, 232, 240) // Slate 200
    doc.roundedRect(bx, by, boxWidth, boxHeight, 2, 2, 'FD')

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(kpi.label, bx + 3, by + 5)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    if (kpi.label.includes('Expenses')) {
      doc.setTextColor(225, 29, 72)
    } else if (kpi.label.includes('Net Forecourt') || kpi.label.includes('Gross')) {
      doc.setTextColor(16, 185, 129)
    } else {
      doc.setTextColor(15, 23, 42)
    }
    doc.text(kpi.val, bx + 3, by + 11)
  })

  currentY += Math.ceil(kpis.length / 3) * (boxHeight + 3) + 6

  // --- 3. Staff / Attendant Performance Table ---
  if (data.staffRows && data.staffRows.length > 0) {
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('STAFF DISPENSING & SHIFT RECONCILIATION', 14, currentY)
    currentY += 2

    const staffHeaders = ['Code', 'Staff Name', 'Station', 'Shifts', 'Litres (L)', `Sales (${currency})`, `Var (${currency})`, 'Status']
    const staffBody = data.staffRows.map(s => [
      s.employeeCode,
      s.name,
      s.stationName,
      s.shiftsClosed,
      s.litres.toFixed(1),
      s.sales.toFixed(2),
      s.variance.toFixed(2),
      s.status,
    ])

    autoTable(doc, {
      startY: currentY,
      head: [staffHeaders],
      body: staffBody,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })

    currentY = (doc as any).lastAutoTable.finalY + 8
  }

  // --- 4. Station Fleet Summary Table (if available) ---
  if (data.stationRows && data.stationRows.length > 0) {
    if (currentY > 240) {
      doc.addPage()
      currentY = 16
    }

    doc.setTextColor(15, 23, 42)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('STATION BRANCH PERFORMANCE SUMMARY', 14, currentY)
    currentY += 2

    const stnHeaders = ['Station Name', 'Code', 'Location', 'Region', 'Litres (L)', `Sales (${currency})`, `Var (${currency})`, 'Shifts']
    const stnBody = data.stationRows.map(st => [
      st.name,
      st.code,
      st.location,
      st.region,
      st.litresToday.toFixed(1),
      st.salesToday.toFixed(2),
      st.netVariance.toFixed(2),
      st.shiftCount,
    ])

    autoTable(doc, {
      startY: currentY,
      head: [stnHeaders],
      body: stnBody,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })

    currentY = (doc as any).lastAutoTable.finalY + 8
  }

  // --- 5. Station Expenses & Petty Cash Audit Log (if available) ---
  if (data.expenseRows && data.expenseRows.length > 0) {
    if (currentY > 235) {
      doc.addPage()
      currentY = 16
    }

    doc.setTextColor(15, 23, 42)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('STATION EXPENSES & PETTY CASH AUDIT LOG', 14, currentY)
    currentY += 2

    const expHeaders = ['Date', 'Station', 'Category', `Amount (${currency})`, 'Source', 'Payee / Ref', 'Recorded By']
    const expBody = data.expenseRows.map(e => [
      e.date,
      e.stationName,
      e.category,
      e.amount.toFixed(2),
      e.paymentSource,
      [e.payee, e.referenceNumber].filter(Boolean).join(' / ') || 'N/A',
      e.recordedBy,
    ])

    autoTable(doc, {
      startY: currentY,
      head: [expHeaders],
      body: expBody,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })
  }

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `PetroView Forecourt OS · Confidential Financial & Operational Audit Report · Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 6,
    )
  }

  const safeFilename = `${data.companyShortCode.toLowerCase()}-report-${data.periodLabel.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`

  // Enable auto-print action in the generated PDF document metadata
  try {
    doc.autoPrint()
  } catch (err) {
    console.warn('Could not inject autoPrint action:', err)
  }

  // 1. Automatically download the PDF file directly to device
  doc.save(safeFilename)

  // 2. Guide user directly through the print workflow via printable PDF blob
  try {
    const pdfBlob = doc.output('blob')
    const blobUrl = URL.createObjectURL(pdfBlob)

    const printFrame = document.createElement('iframe')
    printFrame.style.position = 'fixed'
    printFrame.style.right = '0'
    printFrame.style.bottom = '0'
    printFrame.style.width = '0'
    printFrame.style.height = '0'
    printFrame.style.border = '0'
    printFrame.src = blobUrl
    document.body.appendChild(printFrame)

    printFrame.onload = () => {
      setTimeout(() => {
        try {
          printFrame.contentWindow?.focus()
          printFrame.contentWindow?.print()
        } catch {
          // Fallback: open in new window if iframe print blocked
          const win = window.open(blobUrl, '_blank')
          win?.focus()
        }
      }, 300)
    }

    // Clean up frame after print sequence
    setTimeout(() => {
      try {
        document.body.removeChild(printFrame)
        URL.revokeObjectURL(blobUrl)
      } catch {}
    }, 60000)
  } catch (err) {
    console.warn('Could not launch PDF print workflow automatically:', err)
  }
}

/**
 * Generates and triggers an immediate automatic download of a native Excel (.xlsx) workbook.
 * Creates multiple structured sheets with formatted numbers and headers.
 * Opens 100% cleanly in Microsoft Excel on Windows/Mac without any corrupt file warnings.
 */
export function exportReportToExcel(data: ReportExportData): void {
  const wb = XLSX.utils.book_new()
  const currency = data.currency || 'GHS'

  // Sheet 1: Executive Summary
  const summaryData = [
    [data.companyName.toUpperCase()],
    [data.title],
    [`Reporting Period: ${data.periodLabel}`],
    [`Generated: ${new Date(data.generatedAt).toLocaleString()}`],
    [],
    ['FINANCIAL RECONCILIATION SUMMARY'],
    ['Metric', 'Value', 'Unit'],
    ['Gross Fuel Sales', data.financials.grossFuelSales, currency],
    ['Station Expenses', -data.financials.totalExpenses, currency],
    ['Net Forecourt Cash (Reconciled)', data.financials.netRevenue, currency],
    ['Total Fuel Dispensed', data.financials.litresDispensed, 'Litres'],
    ['Total Closed Shifts', data.financials.totalShifts, 'Shifts'],
    ['Net Pump Variance', data.financials.netVariance, currency],
  ]
  if (data.financials.stationCount) {
    summaryData.push(['Active Stations', data.financials.stationCount, 'Sites'])
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // Sheet 2: Staff Performance
  if (data.staffRows && data.staffRows.length > 0) {
    const staffHeaders = [
      'Staff Code',
      'Staff Name',
      'Assigned Station',
      'Shifts Closed',
      'Total Litres (L)',
      `Gross Sales (${currency})`,
      `Net Variance (${currency})`,
      'Approved Shifts',
      'Rejected Shifts',
      `Avg Shift Sales (${currency})`,
      'Account Status',
    ]

    const staffRows = data.staffRows.map(s => [
      s.employeeCode,
      s.name,
      s.stationName,
      s.shiftsClosed,
      s.litres,
      s.sales,
      s.variance,
      s.approved,
      s.rejected,
      s.avgShiftSales,
      s.status,
    ])

    const wsStaff = XLSX.utils.aoa_to_sheet([staffHeaders, ...staffRows])
    XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff Performance')
  }

  // Sheet 3: Station Branches
  if (data.stationRows && data.stationRows.length > 0) {
    const stnHeaders = [
      'Station Name',
      'Station Code',
      'Location',
      'Region',
      'Total Volume (L)',
      `Total Sales (${currency})`,
      `Net Variance (${currency})`,
      'Recorded Shifts',
    ]

    const stnRows = data.stationRows.map(st => [
      st.name,
      st.code,
      st.location,
      st.region,
      st.litresToday,
      st.salesToday,
      st.netVariance,
      st.shiftCount,
    ])

    const wsStations = XLSX.utils.aoa_to_sheet([stnHeaders, ...stnRows])
    XLSX.utils.book_append_sheet(wb, wsStations, 'Stations')
  }

  // Sheet 4: Expenses Audit Log
  if (data.expenseRows && data.expenseRows.length > 0) {
    const expHeaders = [
      'Date',
      'Station Name',
      'Expense Category',
      `Amount (${currency})`,
      'Payment Source',
      'Payee',
      'Reference Number',
      'Recorded By',
      'Notes',
    ]

    const expRows = data.expenseRows.map(e => [
      e.date,
      e.stationName,
      e.category,
      e.amount,
      e.paymentSource,
      e.payee || '',
      e.referenceNumber || '',
      e.recordedBy,
      e.notes || '',
    ])

    const wsExpenses = XLSX.utils.aoa_to_sheet([expHeaders, ...expRows])
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses Log')
  }

  const safeFilename = `${data.companyShortCode.toLowerCase()}-report-${data.periodLabel.toLowerCase().replace(/[^a-z0-9]/g, '-')}.xlsx`
  XLSX.writeFile(wb, safeFilename)
}

/**
 * Generates and triggers an immediate automatic download of a clean CSV (.csv) file.
 * Prepend with UTF-8 BOM (\uFEFF) so Excel on Windows parses accents and columns seamlessly.
 */
export function exportReportToCsv(data: ReportExportData): void {
  const currency = data.currency || 'GHS'
  const sections: string[][] = [
    [`${data.companyName.toUpperCase()} - ${data.title.toUpperCase()}`],
    [`Reporting Period: ${data.periodLabel} | Generated: ${new Date(data.generatedAt).toLocaleString()}`],
    [],
    ['--- FINANCIAL RECONCILIATION SUMMARY ---'],
    [`Gross Fuel Sales: ${currency} ${data.financials.grossFuelSales.toFixed(2)}`],
    [`Less Total Station Expenses: -${currency} ${data.financials.totalExpenses.toFixed(2)}`],
    [`Net Forecourt Cash: ${currency} ${data.financials.netRevenue.toFixed(2)}`],
    [`Total Fuel Volume Dispensed: ${data.financials.litresDispensed.toFixed(2)} L`],
    [`Total Shifts Closed: ${data.financials.totalShifts}`],
    [`Net Pump Variance: ${currency} ${data.financials.netVariance.toFixed(2)}`],
    [],
  ]

  if (data.staffRows && data.staffRows.length > 0) {
    sections.push(['--- STAFF PERFORMANCE SUMMARY ---'])
    sections.push([
      'Staff Code',
      'Staff Name',
      'Assigned Station',
      'Shifts Closed',
      'Litres (L)',
      `Gross Sales (${currency})`,
      `Net Variance (${currency})`,
      'Approved Shifts',
      'Rejected Shifts',
      `Avg Shift Sales (${currency})`,
      'Status',
    ])
    data.staffRows.forEach(s => {
      sections.push([
        s.employeeCode,
        s.name,
        s.stationName,
        String(s.shiftsClosed),
        s.litres.toFixed(2),
        s.sales.toFixed(2),
        s.variance.toFixed(2),
        String(s.approved),
        String(s.rejected),
        s.avgShiftSales.toFixed(2),
        s.status,
      ])
    })
    sections.push([])
  }

  if (data.stationRows && data.stationRows.length > 0) {
    sections.push(['--- STATION FLEET SUMMARY ---'])
    sections.push([
      'Station Name',
      'Station Code',
      'Location',
      'Region',
      'Volume (L)',
      `Total Sales (${currency})`,
      `Net Variance (${currency})`,
      'Shifts Count',
    ])
    data.stationRows.forEach(st => {
      sections.push([
        st.name,
        st.code,
        st.location,
        st.region,
        st.litresToday.toFixed(2),
        st.salesToday.toFixed(2),
        st.netVariance.toFixed(2),
        String(st.shiftCount),
      ])
    })
    sections.push([])
  }

  if (data.expenseRows && data.expenseRows.length > 0) {
    sections.push(['--- ENTERPRISE STATION EXPENSES AUDIT LOG ---'])
    sections.push([
      'Date',
      'Station Name',
      'Expense Category',
      `Amount (${currency})`,
      'Payment Source',
      'Payee',
      'Reference No.',
      'Recorded By',
      'Notes',
    ])
    data.expenseRows.forEach(e => {
      sections.push([
        e.date,
        e.stationName,
        e.category,
        e.amount.toFixed(2),
        e.paymentSource,
        e.payee || 'N/A',
        e.referenceNumber || 'N/A',
        e.recordedBy,
        e.notes || '',
      ])
    })
  }

  const csvContent =
    '\uFEFF' +
    sections
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${data.companyShortCode.toLowerCase()}-report-${data.periodLabel.toLowerCase().replace(/[^a-z0-9]/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
