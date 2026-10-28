import { useMemo, useState } from 'react'
import { Input, Label, ToolGrid, ErrorNote, CopyButton } from '@/components/ui'
import { factorize, isPrime, divisors, divisorCount, totient, gcdAll, lcmAll, nextPrime, prevPrime } from '@/lib/bcat/science'
import { Stat } from '@/tools/dev/_b5/shell'

const sup = (n: number) => String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('')
const parse = (s: string) => { const t = s.replace(/[\s,_]/g, ''); if (!/^\d+$/.test(t)) throw new Error('Type a whole number (digits only).'); if (t.length > 40) throw new Error('Up to 40 digits are supported.'); return BigInt(t) }

export default function PrimeFactorizer() {
  const [num, setNum] = useState('360')
  const [list, setList] = useState('12, 18, 30')
  const r = useMemo(() => {
    try {
      const n = parse(num), t0 = performance.now()
      const f = factorize(n), ms = performance.now() - t0
      return { n, f, ms, prime: isPrime(n), divs: divisors(f), count: divisorCount(f), phi: n > 0n ? totient(n, f) : 0n, next: n < 10n ** 30n ? nextPrime(n) : null, prev: n < 10n ** 30n ? prevPrime(n) : null }
    } catch (e: any) { return { err: e.message as string } }
  }, [num])
  const g = useMemo(() => { try { const xs = list.split(/[\s,;]+/).filter(Boolean).map(parse); if (xs.length < 2) return null; return { gcd: gcdAll(xs), lcm: lcmAll(xs) } } catch { return null } }, [list])
  const product = r.f ? [...r.f.entries()].map(([p, e]) => `${p}${e > 1 ? sup(e) : ''}`).join(' × ') : ''
  const sum = r.divs ? r.divs.reduce((a, b) => a + b, 0n) : null

  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <div><Label>Number</Label><Input value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" className="h-12 font-mono text-lg" aria-label="Number" /></div>
          <ErrorNote error={r.err ?? null} />
          {r.f && (
            <>
              <div className="rounded-2xl border border-border bg-surface p-5 text-center">
                <div className="break-all font-mono text-sm text-muted">{r.n!.toLocaleString()} =</div>
                <div className="mt-1 break-all font-display text-2xl font-semibold sm:text-3xl">{r.n! < 2n ? 'no prime factors' : product}</div>
                <div className="mt-2 flex justify-center"><CopyButton text={`${r.n} = ${[...r.f.entries()].map(([p, e]) => (e > 1 ? `${p}^${e}` : `${p}`)).join(' * ')}`} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Prime" value={r.prime ? 'Yes' : 'No'} />
                <Stat label="Divisors" value={r.count!.toString()} />
                <Stat label="Euler totient" value={<span className="break-all text-sm">{r.phi!.toString()}</span>} />
                <Stat label="Found in" value={`${r.ms!.toFixed(1)} ms`} />
              </div>
              {r.divs && <div><Label hint={sum != null ? `sum ${sum}${sum - r.n! === r.n! ? ' (a perfect number)' : ''}` : ''}>All divisors</Label><p className="max-h-40 overflow-auto break-words rounded-xl border border-border bg-surface-2/40 p-3 font-mono text-xs">{r.divs.join(', ')}</p></div>}
              {(r.next || r.prev) && <p className="text-sm text-muted">Nearest primes: {r.prev?.toString() ?? 'none'} and {r.next?.toString()}</p>}
            </>
          )}
        </div>
      }
      side={
        <>
          <Label>GCD and LCM of a list</Label>
          <Input value={list} onChange={(e) => setList(e.target.value)} placeholder="12, 18, 30" aria-label="Numbers for GCD and LCM" className="font-mono" />
          {g ? <div className="grid grid-cols-2 gap-2"><Stat label="GCD" value={<span className="break-all text-sm">{g.gcd.toString()}</span>} /><Stat label="LCM" value={<span className="break-all text-sm">{g.lcm.toString()}</span>} /></div> : <p className="text-xs text-muted">Type two or more whole numbers.</p>}
          <p className="text-xs text-muted">Uses exact big integers, Miller-Rabin primality testing and Pollard's rho, so numbers with 20 to 30 digits usually factor in well under a second.</p>
        </>
      }
    />
  )
}
