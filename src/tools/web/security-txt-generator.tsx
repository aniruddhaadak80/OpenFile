import { useMemo, useState } from 'react'
import { Card, Input, Label, Textarea } from '@/components/ui'
import { OutBox } from '@/lib/cf/ui'

export function buildSecurityTxt(o: { contacts: string[]; expires: string; encryption?: string; ack?: string; policy?: string; hiring?: string; langs?: string; canonical?: string }) {
  const out: string[] = []
  for (const c of o.contacts) { const v = c.trim(); if (v) out.push(`Contact: ${/^[^:]+@[^:]+$/.test(v) ? 'mailto:' + v : /^\+?[\d\s-]+$/.test(v) ? 'tel:' + v.replace(/\s/g, '') : v}`) }
  if (o.expires) out.push(`Expires: ${new Date(o.expires + 'T23:59:59Z').toISOString().replace('.000', '')}`)
  for (const [k, v] of [['Encryption', o.encryption], ['Acknowledgments', o.ack], ['Policy', o.policy], ['Hiring', o.hiring], ['Preferred-Languages', o.langs], ['Canonical', o.canonical]] as const) if (v?.trim()) out.push(`${k}: ${v.trim()}`)
  return out.join('\n') + '\n'
}

export default function SecurityTxtGenerator() {
  const next = new Date(); next.setFullYear(next.getFullYear() + 1)
  const [contacts, setContacts] = useState('security@example.com\nhttps://example.com/report'), [expires, setExpires] = useState(next.toISOString().slice(0, 10))
  const [enc, setEnc] = useState(''), [ack, setAck] = useState(''), [policy, setPolicy] = useState('https://example.com/security-policy'), [hiring, setHiring] = useState(''), [langs, setLangs] = useState('en'), [canonical, setCanonical] = useState('https://example.com/.well-known/security.txt')
  const out = useMemo(() => buildSecurityTxt({ contacts: contacts.split('\n'), expires, encryption: enc, ack, policy, hiring, langs, canonical }), [contacts, expires, enc, ack, policy, hiring, langs, canonical])
  const far = (new Date(expires).getTime() - Date.now()) / 864e5 > 366
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <div><Label>How to reach you (email, URL or phone, one per line)</Label><Textarea value={contacts} onChange={(e) => setContacts(e.target.value)} className="min-h-16" /></div>
        <div><Label>Expires (required)</Label><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />{far && <p className="mt-1 text-xs text-warn">The standard suggests less than a year, so the file is reviewed often.</p>}</div>
        <div><Label>Public key URL (optional)</Label><Input value={enc} onChange={(e) => setEnc(e.target.value)} placeholder="https://example.com/pgp-key.txt" /></div>
        <div><Label>Disclosure policy</Label><Input value={policy} onChange={(e) => setPolicy(e.target.value)} /></div>
        <div><Label>Thanks page (optional)</Label><Input value={ack} onChange={(e) => setAck(e.target.value)} /></div>
        <div><Label>Security jobs (optional)</Label><Input value={hiring} onChange={(e) => setHiring(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2"><div><Label>Languages</Label><Input value={langs} onChange={(e) => setLangs(e.target.value)} /></div><div><Label>Canonical URL</Label><Input value={canonical} onChange={(e) => setCanonical(e.target.value)} /></div></div>
      </Card>
      <div className="space-y-3"><OutBox title="security.txt" text={out} filename="security.txt" rows={12} /><p className="text-xs text-muted">Serve it at /.well-known/security.txt so researchers know where to report problems (RFC 9116). Renew it before the expiry date.</p></div>
    </div>
  )
}
