// CSV for the downloads of the dashboard: comma separated, CRLF, with a BOM so that Excel
// reads the accents.

const field = (v: string | number | null) => {
  const s = v === null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (rows: (string | number | null)[][]): string =>
  '﻿' + rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n'
