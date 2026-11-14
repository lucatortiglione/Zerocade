import { Worker } from 'node:worker_threads'
import { build } from 'esbuild'

// Execute the actual bundled browser-worker entry in a native thread. Only the
// message-port globals are adapted; fetch, Socket.IO and all computation are real.
export async function browserThread<Request = unknown, Response = unknown>(entry: string) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' })
  const boot = `import { parentPort } from 'node:worker_threads';
    globalThis.self = globalThis;
    globalThis.addEventListener = (type, listener) => {
      if (type === 'message') parentPort.on('message', data => listener({ data }));
    };
    globalThis.postMessage = (data, options) => parentPort.postMessage(data, options?.transfer ?? []);
  `
  const url = new URL('data:text/javascript;base64,' + Buffer.from(boot + bundle.outputFiles[0].text).toString('base64'))
  class BrowserThread {
    private thread = new Worker(url)
    error: Error | null = null
    private messages = new Set<(event: MessageEvent<Response>) => void>()
    private errors = new Set<() => void>()
    private messageErrors = new Set<() => void>()
    constructor() {
      this.thread.on('message', (data: Response) => { for (const listener of this.messages) listener(new MessageEvent('message', { data })) })
      this.thread.on('error', (error: Error) => { this.error = error; for (const listener of this.errors) listener() })
      this.thread.on('messageerror', () => { for (const listener of this.messageErrors) listener() })
    }
    addEventListener(type: 'message', listener: (event: MessageEvent<Response>) => void): void
    addEventListener(type: 'error' | 'messageerror', listener: () => void): void
    addEventListener(type: string, listener: ((event: MessageEvent<Response>) => void) | (() => void)) {
      if (type === 'message') this.messages.add(listener)
      else if (type === 'error') this.errors.add(() => Reflect.apply(listener, undefined, []))
      else this.messageErrors.add(() => Reflect.apply(listener, undefined, []))
    }
    postMessage(data: Request) { this.thread.postMessage(data) }
    terminate() { return this.thread.terminate() }
  }
  return new BrowserThread()
}
