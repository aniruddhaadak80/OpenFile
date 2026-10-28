import { useMemo, useState } from 'react'
import { Mail, Phone, Building2 } from 'lucide-react'
import { Dropzone, Input, Label, Switch, ToolGrid, Empty, Button } from '@/components/ui'
import { parseVcf, toVcf, rowsToContacts, type Contact } from '@/lib/bcat/office'
import { DlButton, toCsv } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

function dedupe(cs: Contact[]) {
  const out: Contact[] = []
  for (const c of cs) {
    const keys = [...c.emails.map((e) => e.toLowerCase()), ...c.phones.map((p) => p.replace(/\D/g, '').slice(-9))]
    const hit = out.find((o) => (keys.length && [...o.emails.map((e) => e.toLowerCase()), ...o.phones.map((p) => p.replace(/\D/g, '').slice(-9))].some((k) => keys.includes(k))) || (!keys.length && o.name === c.name))
    if (hit) { hit.emails = [...new Set([...hit.emails, ...c.emails])]; hit.phones = [...new Set([...hit.phones, ...c.phones])]; hit.org ??= c.org; hit.title ??= c.title; hit.address ??= c.address; hit.note ??= c.note }
    else out.push({ ...c, emails: [...c.emails], phones: [...c.phones] })
  }
  return out
}

export default function VcardConverter() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loaded, setLoaded] = useState(false)
  const [merge, setMerge] = useState(true)
  const [q, setQ] = useState('')

  const add = async (fs: File[]) => {
    const got: Contact[] = []
    for (const f of fs) {
      const t = await f.text()
      if (/BEGIN:VCARD/i.test(t)) got.push(...parseVcf(t))
      else { const Papa = (await import('papaparse')).default; const r = Papa.parse<string[]>(t, { skipEmptyLines: true }); const [head, ...rows] = r.data; if (head) got.push(...rowsToContacts(head, rows)) }
    }
    setContacts((p) => [...p, ...got]); setLoaded(true)
  }
  const final = useMemo(() => (merge ? dedupe(contacts) : contacts), [contacts, merge])
  const shown = final.filter((c) => !q || [c.name, c.org, ...c.emails, ...c.phones].some((x) => x?.toLowerCase().includes(q.toLowerCase())))
  const maxE = Math.max(1, ...final.map((c) => c.emails.length)), maxP = Math.max(1, ...final.map((c) => c.phones.length))

  if (!loaded) return <Dropzone multiple accept=".vcf,.vcard,.csv" onFiles={add} label="Drop contacts: VCF or CSV" sub="Turn a phone contacts export into a spreadsheet, or a spreadsheet into contacts you can import. Duplicates are merged." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2"><Stat label="Read" value={contacts.length} /><Stat label="Contacts" value={final.length} /><Stat label="Merged" value={contacts.length - final.length} /></div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" />
          {shown.length ? (
            <div className="grid gap-2 sm:grid-cols-2">{shown.slice(0, 400).map((c, i) => (
              <div key={i} className="rounded-2xl border border-border bg-surface p-3 text-sm">
                <div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">{c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span><span className="truncate font-medium">{c.name}</span></div>
                {c.org && <div className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Building2 className="size-3" />{c.org}{c.title ? `, ${c.title}` : ''}</div>}
                {c.emails.map((e) => <div key={e} className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted"><Mail className="size-3" />{e}</div>)}
                {c.phones.map((p) => <div key={p} className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Phone className="size-3" />{p}</div>)}
              </div>
            ))}</div>
          ) : <Empty>No contacts found.</Empty>}
          <Dropzone compact multiple accept=".vcf,.vcard,.csv" onFiles={add} label="Add more contacts" />
        </div>
      }
      side={
        <>
          <Switch checked={merge} onChange={setMerge} label="Merge duplicates (same email or phone)" />
          <Label>Save as</Label>
          <div className="flex flex-wrap gap-2">
            <DlButton variant="primary" name="contacts.csv" mime="text/csv" data={() => '\ufeff' + toCsv([['Name', 'First name', 'Last name', 'Organization', 'Title', ...Array.from({ length: maxE }, (_, i) => `Email ${i + 1}`), ...Array.from({ length: maxP }, (_, i) => `Phone ${i + 1}`), 'Address', 'Website', 'Birthday', 'Notes'], ...final.map((c) => [c.name, c.first ?? '', c.last ?? '', c.org ?? '', c.title ?? '', ...Array.from({ length: maxE }, (_, i) => c.emails[i] ?? ''), ...Array.from({ length: maxP }, (_, i) => c.phones[i] ?? ''), c.address ?? '', c.url ?? '', c.birthday ?? '', c.note ?? ''])])}>CSV</DlButton>
            <DlButton name="contacts.vcf" mime="text/vcard" data={() => toVcf(final)}>VCF</DlButton>
            <DlButton name="contacts.json" mime="application/json" data={() => JSON.stringify(final, null, 2)}>JSON</DlButton>
          </div>
          <Button variant="ghost" className="w-full" onClick={() => { setContacts([]); setLoaded(false) }}>Start over</Button>
          <p className="text-xs text-muted">VCF works with phones, Outlook, Gmail and Apple Contacts. CSV columns are guessed from names like Name, Email, Phone and Company.</p>
        </>
      }
    />
  )
}
