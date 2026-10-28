/* qpdf (Apache-2.0) compiled to WebAssembly, loaded on demand (~1.3 MB, cached by the browser). */
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'

export async function runQpdf(input: Uint8Array, args: string[]): Promise<{ out: Uint8Array | null; log: string[]; code: number }> {
  const { default: createModule } = await import('@neslinesli93/qpdf-wasm')
  const log: string[] = []
  // a fresh instance per run: qpdf's main() is not designed to be called twice
  const q: any = await (createModule as any)({ locateFile: () => wasmUrl, noInitialRun: true, print: (s: string) => log.push(s), printErr: (s: string) => log.push(s) })
  q.FS.writeFile('/in.pdf', input)
  let code = 0
  try { code = q.callMain([...args.map((a) => (a === '{in}' ? '/in.pdf' : a === '{out}' ? '/out.pdf' : a))]) } catch (e: any) { code = typeof e?.status === 'number' ? e.status : 2; log.push(String(e?.message ?? e)) }
  let out: Uint8Array | null = null
  try { out = q.FS.readFile('/out.pdf') } catch { /* no output */ }
  return { out, log, code }
}
