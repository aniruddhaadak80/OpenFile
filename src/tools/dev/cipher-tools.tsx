import { useMemo, useState } from 'react'
import { ArrowLeftRight, Volume2, Square } from 'lucide-react'
import { Button, Input, Segmented, Slider, Label, CopyButton, cn } from '@/components/ui'
import { Bar, Status, Pane, CodeArea, useStored } from './_b5/shell'
import * as C from '@/lib/b5/ciphers'

type Id = 'caesar' | 'rot13' | 'rot47' | 'vigenere' | 'atbash' | 'affine' | 'morse' | 'bacon' | 'rail' | 'xor' | 'nato' | 'braille' | 'leet' | 'binary' | 'a1z26'
const LIST: { id: Id; name: string; hint: string }[] = [
  { id: 'caesar', name: 'Caesar', hint: 'Shift each letter by a fixed amount.' },
  { id: 'rot13', name: 'ROT13', hint: 'Caesar with shift 13. Applying it twice gives the original.' },
  { id: 'rot47', name: 'ROT47', hint: 'Rotates all printable ASCII characters, not just letters.' },
  { id: 'vigenere', name: 'Vigenère', hint: 'Caesar with a shift that changes with each letter of a key word.' },
  { id: 'atbash', name: 'Atbash', hint: 'A becomes Z, B becomes Y, and so on.' },
  { id: 'affine', name: 'Affine', hint: 'Each letter x becomes (a·x + b) mod 26.' },
  { id: 'morse', name: 'Morse code', hint: 'Dots and dashes. Letters split by spaces, words by /.' },
  { id: 'bacon', name: 'Bacon', hint: 'Each letter becomes five A or B symbols.' },
  { id: 'rail', name: 'Rail fence', hint: 'Writes the text in a zigzag over several rails.' },
  { id: 'xor', name: 'XOR', hint: 'XOR bytes with a key. Encoded output is hex.' },
  { id: 'nato', name: 'NATO alphabet', hint: 'Alfa, Bravo, Charlie for spelling on the phone.' },
  { id: 'braille', name: 'Braille', hint: 'Unicode Braille cells (letters, digits, punctuation).' },
  { id: 'leet', name: 'Leetspeak', hint: 'Swaps letters for look-alike digits.' },
  { id: 'binary', name: 'Text ⇄ binary', hint: 'UTF-8 bytes as 8-bit binary groups.' },
  { id: 'a1z26', name: 'A1Z26', hint: 'A=1, B=2, up to Z=26.' },
]

let audioCtx: AudioContext | null = null

export default function CipherTools() {
  const [id, setId] = useStored<Id>('b5:cipher:id', 'caesar')
  const [dir, setDir] = useState<'enc' | 'dec'>('enc')
  const [input, setInput] = useStored('b5:cipher:input', 'The quick brown fox jumps over the lazy dog')
  const [shift, setShift] = useState(3)
  const [key, setKey] = useState('LEMON')
  const [rails, setRails] = useState(3)
  const [a, setA] = useState(5); const [b, setB] = useState(8)
  const [playing, setPlaying] = useState(false)
  const dec = dir === 'dec'

  const res = useMemo(() => {
    try {
      const s = input
      switch (id) {
        case 'caesar': return { out: C.caesar(s, dec ? -shift : shift) }
        case 'rot13': return { out: C.rot13(s) }
        case 'rot47': return { out: C.rot47(s) }
        case 'vigenere': return { out: C.vigenere(s, key, dec) }
        case 'atbash': return { out: C.atbash(s) }
        case 'affine': return { out: C.affine(s, a, b, dec) }
        case 'morse': return { out: dec ? C.fromMorse(s) : C.toMorse(s) }
        case 'bacon': return { out: C.bacon(s, dec) }
        case 'rail': return { out: C.railFence(s, rails, dec) }
        case 'xor': return { out: C.xorHex(s, key, dec) }
        case 'nato': return { out: dec ? C.fromNato(s) : C.toNato(s) }
        case 'braille': return { out: dec ? C.fromBraille(s) : C.toBraille(s) }
        case 'leet': return { out: dec ? C.fromLeet(s) : C.toLeet(s) }
        case 'binary': return { out: dec ? C.fromBin(s) : C.toBin(s) }
        case 'a1z26': return { out: dec ? C.fromA1Z26(s) : C.toA1Z26(s) }
      }
    } catch (e: any) { return { err: e.message as string } }
  }, [id, input, dec, shift, key, rails, a, b])

  const brute = useMemo(() => (id === 'caesar' && dec ? Array.from({ length: 25 }, (_, i) => ({ k: i + 1, t: C.caesar(input, -(i + 1)) })).map((x) => ({ ...x, s: C.englishScore(x.t) })).sort((x, y) => y.s - x.s) : null), [id, dec, input])
  const symmetric = id === 'rot13' || id === 'rot47' || id === 'atbash'
  const out = res && 'out' in res ? res.out ?? '' : ''

  const playMorse = async () => {
    if (playing) { audioCtx?.close(); audioCtx = null; setPlaying(false); return }
    const code = dec ? input : out
    audioCtx = new AudioContext(); const ctx = audioCtx; const unit = 0.07; let t = ctx.currentTime + 0.05
    const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.frequency.value = 650; g.gain.value = 0; osc.connect(g).connect(ctx.destination); osc.start()
    for (const ch of code) {
      if (ch === '.' || ch === '-') { const d = ch === '.' ? unit : unit * 3; g.gain.setValueAtTime(0.25, t); g.gain.setValueAtTime(0, t + d); t += d + unit }
      else if (ch === ' ') t += unit * 2
      else if (ch === '/') t += unit * 4
    }
    osc.stop(t); setPlaying(true); osc.onended = () => { setPlaying(false); ctx.close(); if (audioCtx === ctx) audioCtx = null }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-2 lg:flex-col lg:overflow-visible" aria-label="Ciphers">
        {LIST.map((c) => <button key={c.id} onClick={() => setId(c.id)} className={cn('shrink-0 rounded-lg px-3 py-2 text-left text-sm transition', id === c.id ? 'bg-accent/15 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>{c.name}</button>)}
      </nav>
      <div className="min-w-0 space-y-4">
        <Bar>
          {!symmetric && <Segmented value={dir} onChange={setDir} options={[{ value: 'enc', label: 'Encode' }, { value: 'dec', label: 'Decode' }]} />}
          {id === 'caesar' && <Slider label="Shift" value={shift} onChange={setShift} min={1} max={25} className="w-48" />}
          {(id === 'vigenere' || id === 'xor') && <label className="flex items-center gap-2 text-sm"><span className="text-muted">Key</span><Input value={key} onChange={(e) => setKey(e.target.value)} className="h-9 w-40 font-mono" /></label>}
          {id === 'rail' && <Slider label="Rails" value={rails} onChange={setRails} min={2} max={10} className="w-48" />}
          {id === 'affine' && <><label className="flex items-center gap-2 text-sm"><span className="text-muted">a</span><Input type="number" value={a} onChange={(e) => setA(Number(e.target.value) || 1)} className="h-9 w-20" /></label><label className="flex items-center gap-2 text-sm"><span className="text-muted">b</span><Input type="number" value={b} onChange={(e) => setB(Number(e.target.value) || 0)} className="h-9 w-20" /></label></>}
          {id === 'morse' && <Button size="sm" variant="outline" icon={playing ? <Square className="size-4" /> : <Volume2 className="size-4" />} onClick={playMorse}>{playing ? 'Stop' : 'Play sound'}</Button>}
          <span className="text-xs text-muted">{LIST.find((c) => c.id === id)?.hint}</span>
        </Bar>
        <div className="grid gap-4 lg:grid-cols-2">
          <Pane title={dec ? 'Encoded' : 'Plain text'} className="h-[300px]" actions={<Button size="sm" variant="ghost" onClick={() => setInput('')}>Clear</Button>}>
            <CodeArea value={input} onChange={setInput} lineNumbers={false} placeholder="Type here" />
          </Pane>
          <Pane title={dec ? 'Plain text' : 'Encoded'} className="h-[300px]" actions={out ? <><CopyButton text={out} variant="ghost" /><Button size="sm" variant="ghost" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setInput(out); if (!symmetric) setDir(dec ? 'enc' : 'dec') }}>Swap</Button></> : null}>
            <pre className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[14px] leading-6">{out}</pre>
          </Pane>
        </div>
        {res && 'err' in res && <Status kind="err">{res.err}</Status>}
        {brute && input.trim() && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <Label>Unknown shift? All 25 shifts, most English-like first</Label>
            <div className="scrollbar-thin max-h-72 space-y-1 overflow-auto">
              {brute.map((x, i) => <button key={x.k} onClick={() => setShift(x.k)} className={cn('flex w-full gap-3 rounded-lg px-2 py-1.5 text-left font-mono text-[13px] hover:bg-surface-2', i === 0 && 'bg-success/10')}><span className="w-10 shrink-0 text-muted">−{x.k}</span><span className="truncate">{x.t}</span></button>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
