// CSV for the downloads of the dashboard: comma separated, CRLF, with a BOM so that Excel
// reads the accents.

const field = (v: string | number | null) => {
  // A quoted CSV cell may still execute a spreadsheet formula. Neutralise only
  // text supplied as strings; genuine numeric values retain their number format.
  const raw = v === null ? '' : String(v)
  const s = typeof v === 'string' && /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const REPORT_MAX_BYTES = 16 * 1024 * 1024
export const toCsv = (rows: (string | number | null)[][]): string => {
  if (rows.length > 50_000) throw new Error('Export oltre 50.000 righe: restringere i dati prima di esportare.')
  const lines: string[] = []
  let bytes = 2
  for (const row of rows) {
    const cells: string[] = []
    for (const value of row) {
      if (typeof value === 'string' && value.length * 2 > REPORT_MAX_BYTES - bytes) throw new Error('Export oltre 16 MiB.')
      const cell = field(value)
      bytes += cell.length * 2 + 2
      if (bytes > REPORT_MAX_BYTES) throw new Error('Export oltre 16 MiB.')
      cells.push(cell)
    }
    bytes += 4
    if (bytes > REPORT_MAX_BYTES) throw new Error('Export oltre 16 MiB.')
    lines.push(cells.join(','))
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}
