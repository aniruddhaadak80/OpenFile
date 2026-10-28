import { useEffect, useMemo, useState } from 'react'
import { Button, Segmented, Slider, CopyButton, Textarea } from '@/components/ui'
import { Bar, Pane, Status, CodeArea, DownloadButton } from './_b5/shell'
import { shamirSplit, shamirCombine, toHex, fromHex } from '@/lib/b10/dev'

const PREFIX = 'ofss1-'
const encodeShare = (s: Uint8Array, k: number) => `${PREFIX}${k}-${toHex(s)}`
function decodeShare(line: string): { k: number | null; bytes: Uint8Array } {
  const t = line.trim()
  const m = t.match(/^ofss1-(\d+)-([0-9a-f]+)$/i)
  if (m) return { k: Number(m[1]), bytes: fromHex(m[2]) }
  return { k: null, bytes: fromHex(t) }
}

function QR({ text }: { text: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let on = true; import('qrcode').then((q) => q.toDataURL(text, { margin: 1, width: 180, errorCorrectionLevel: 'M' })).then((u) => on && setSrc(u)).catch(() => setSrc('')); return () => { on = false } }, [text])
  return src ? <img src={src} alt="QR code of this share" className="size-32 rounded-lg bg-white p-1" /> : null
}

export default function ShamirSecret() {
  const [mode, setMode] = useState<'split' | 'combine'>('split')
  const [secret, setSecret] = useState('')
  const [n, setN] = useState(5)
  const [k, setK] = useState(3)
  const [shares, setShares] = useState<string[]>([])
  const [input, setInput] = useState('')
  useEffect(() => { if (k > n) setK(n) }, [n, k])
  const split = () => {
    const bytes = new TextEncoder().encode(secret)
    setShares(shamirSplit(bytes, n, k, (len) => crypto.getRandomValues(new Uint8Array(len))).map((s) => encodeShare(s, k)))
  }
  const combined = useMemo(() => {
    const lines = input.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return null
    try {
      const dec = lines.map(decodeShare)
      const need = dec.find((d) => d.k)?.k ?? null
      if (need && dec.length < need) return { warn: `You have ${dec.length} of the ${need} shares needed.` }
      const out = shamirCombine(dec.map((d) => d.bytes))
      const text = new TextDecoder('utf-8', { fatal: true }).decode(out)
      return { text }
    } catch (e) { return { err: e instanceof TypeError ? 'The shares do not fit together. Check that they all come from the same split.' : (e as Error).message } }
  }, [input])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'split', label: 'Split a secret' }, { value: 'combine', label: 'Recover a secret' }]} />
        {mode === 'split' && <><Slider label="Shares" value={n} onChange={setN} min={2} max={20} className="w-48" /><Slider label="Needed to recover" value={k} onChange={(v) => setK(Math.min(v, n))} min={2} max={n} className="w-56" /></>}
      </Bar>
      {mode === 'split' ? (
        <>
          <Pane title="Secret (a password, a seed phrase, a note)" actions={<Button size="sm" onClick={split} disabled={!secret}>Split into {n} shares</Button>}>
            <Textarea value={secret} onChange={(e) => setSecret(e.target.value)} className="min-h-28 rounded-none border-0" placeholder="Type the secret you want to protect" aria-label="Secret" />
          </Pane>
          {shares.length > 0 && (
            <>
              <Status kind="info">Any {k} of these {n} shares rebuild the secret. Fewer than {k} reveal nothing about it. Store them in different places.</Status>
              <div className="flex justify-end gap-2"><CopyButton text={shares.join('\n')} label="Copy all" /><DownloadButton text={shares.join('\n')} filename="shares.txt" label="Download all" variant="outline" /></div>
              <div className="grid gap-3 md:grid-cols-2">
                {shares.map((s, i) => (
                  <div key={s} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
                    <QR text={s} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2"><span className="font-display font-semibold">Share {i + 1}</span><span className="ml-auto"><CopyButton text={s} label="" variant="ghost" /></span></div>
                      <code className="block break-all text-xs text-muted">{s}</code>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <Pane title="Paste shares, one per line" className="h-56"><CodeArea value={input} onChange={setInput} placeholder="ofss1-3-01ab..." /></Pane>
          {combined && ('err' in combined ? <Status kind="err">{combined.err}</Status> : 'warn' in combined ? <Status kind="info">{combined.warn}</Status> : (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-4"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-success">Recovered secret</div><div className="flex items-start gap-2"><pre className="flex-1 whitespace-pre-wrap break-all font-mono">{combined.text}</pre><CopyButton text={combined.text ?? ''} /></div></div>
          ))}
        </>
      )}
    </div>
  )
}
