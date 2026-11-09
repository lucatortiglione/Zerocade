// Richiede @oai/artifact-tool dal runtime condiviso, senza dipendenze nel repo.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook } from '@oai/artifact-tool';

const directory = path.resolve(process.argv[2]);
const payload = JSON.parse(await fs.readFile(path.join(directory, 'export_payload.json'), 'utf8'));
const workbook = Workbook.create();
const escape = value => {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
for (const { file, sheet: name, matrix } of payload.csvs) {
  if (!matrix.length || matrix.some(row => row.length !== matrix[0].length)) {
    throw new Error(`Matrice CSV non rettangolare: ${file}`);
  }
  if (path.basename(file) !== file || !file.endsWith('.csv')) throw new Error('Nome CSV non valido');
  const sheet = workbook.worksheets.add(name);
  const lastColumn = String.fromCharCode(64 + matrix[0].length);
  const range = sheet.getRange(`A1:${lastColumn}${matrix.length}`);
  range.values = matrix;
  const values = range.values;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (String(values[r][c] ?? '') !== String(matrix[r][c] ?? '')) {
        throw new Error(`Valore alterato: ${name}, riga ${r + 1}, colonna ${c + 1}`);
      }
    }
  }
  // CSV di soli valori: niente stili, formule o fogli aggiuntivi nella consegna.
  const csv = values.map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
  await fs.writeFile(path.join(directory, file), csv, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ file, rows: matrix.length - 1, columns: matrix[0].length }));
}
console.log((await workbook.inspect({kind:'region', sheetId:'Candidati',range:'A1:E3',maxChars:800})).ndjson);
