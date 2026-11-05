import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// OBS and TikTok LIVE Studio want a link with a domain name, not localhost, so the overlay is
// served at zerocade.test and the hosts file points that name at this PC. .test is reserved:
// no real site can own it, and browsers leave it on plain http (every .app or .dev name is
// forced onto https, which this server doesn't speak).
export const LOCAL_DOMAIN = 'zerocade.test'
export const HOSTS_LINE = `127.0.0.1 ${LOCAL_DOMAIN}`

const hostsFile =
  process.platform === 'win32'
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts'

export function domainRegistered(): boolean {
  let text = ''
  try {
    text = readFileSync(hostsFile, 'utf8')
  } catch {
    // Windows runs fine without a hosts file: it is created when the line is added.
  }
  return text.split(/\r?\n/).some((line) => {
    const [ip, ...names] = line.replace(/#.*/, '').trim().toLowerCase().split(/\s+/)
    return ip === '127.0.0.1' && names.includes(LOCAL_DOMAIN)
  })
}

// Only an administrator can write the hosts file, so Windows asks once (UAC) to run the
// append in an elevated PowerShell. Resolves with whether the name is listed afterwards:
// false when the prompt is declined or an antivirus guards the file.
function addHostsLine(): Promise<boolean> {
  const script = [
    // The empty value ends a last line that has no newline of its own.
    `Add-Content -LiteralPath '${hostsFile}' -Encoding ASCII -Value '', '${HOSTS_LINE} # Zerocade'`,
    // Forget a failed lookup of the name from before the line existed.
    'ipconfig /flushdns | Out-Null',
  ].join('; ')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const elevate = `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-EncodedCommand', '${encoded}'`
  return new Promise((resolve) => {
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', elevate], { stdio: 'ignore', windowsHide: true })
    ps.on('error', () => resolve(false))
    ps.on('exit', () => resolve(domainRegistered()))
  })
}

export async function ensureDomain(overlayUrl: string) {
  if (domainRegistered()) return
  if (process.platform === 'win32') {
    console.log(`\nAggiungo ${LOCAL_DOMAIN} al file hosts per il link dell'overlay: conferma la richiesta di Windows.`)
    if (await addHostsLine()) return console.log(`Fatto: il link dell'overlay è ${overlayUrl}`)
  }
  console.error(
    `\nIl link dell'overlay (${overlayUrl}) non si apre finché ${hostsFile} non contiene la riga\n` +
      `  ${HOSTS_LINE}\n` +
      (process.platform === 'win32'
        ? 'Riavvia Zerocade e accetta la richiesta di Windows, oppure aggiungila a mano con il Blocco note avviato come amministratore.\n'
        : 'Aggiungila a mano (serve sudo).\n'),
  )
}
