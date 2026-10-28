import { useEffect, useMemo, useState } from 'react'
import { Mail as MailIcon, Paperclip, Download, FileDown, ImageOff, Image as ImageIcon, Archive, Search } from 'lucide-react'
import { Button, Dropzone, Input, Tabs, Spinner, ErrorNote, cn } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { openMail, mailHtml, hasRemote, fmtAddr, type Mail } from '@/lib/b4/mail'
import { TopBar, StatusLine } from '@/lib/b4/ui'

const fmtDate = (d?: Date) => (d && !isNaN(+d) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function EmailViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [mails, setMails] = useState<Mail[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [remote, setRemote] = useState(false)
  const [tab, setTab] = useState<'body' | 'text' | 'headers'>('body')
  const [html, setHtml] = useState('')
  const [q, setQ] = useState('')
  const m = mails?.[idx]

  const open = async (f: File) => {
    setFile(f); setMails(null); setError(null); setBusy(true); setStatus('Reading email'); setIdx(0); setRemote(false)
    try { setMails(await openMail(f)) } catch (e: any) { setError(e?.message || 'Could not read this email file.') } finally { setBusy(false) }
  }
  useEffect(() => { if (m) mailHtml(m, remote).then(setHtml) }, [m, remote])
  const list = useMemo(() => (mails ?? []).map((x, i) => ({ x, i })).filter(({ x }) => !q || `${x.subject} ${fmtAddr(x.from)}`.toLowerCase().includes(q.toLowerCase())), [mails, q])

  const header = (x: Mail) => `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;border-bottom:1px solid #ddd;padding-bottom:10px;margin-bottom:14px;color:#111"><h2 style="margin:0 0 8px;font-size:18px">${esc(x.subject || '(no subject)')}</h2><div style="font-size:12px;line-height:1.6"><b>From:</b> ${esc(fmtAddr(x.from))}<br/><b>To:</b> ${esc(x.to.map(fmtAddr).join(', '))}${x.cc.length ? `<br/><b>Cc:</b> ${esc(x.cc.map(fmtAddr).join(', '))}` : ''}<br/><b>Date:</b> ${esc(fmtDate(x.date))}${x.attachments.filter((a) => !a.inline).length ? `<br/><b>Attachments:</b> ${esc(x.attachments.filter((a) => !a.inline).map((a) => a.filename).join(', '))}` : ''}</div></div>`
  const toPdf = async () => {
    if (!m || !file) return
    setBusy(true); setStatus('Making PDF')
    try {
      const { renderHtmlToPdf, pdfToBlob } = await import('@/tools/convert/_conv/htmlPdf')
      const body = await mailHtml(m, remote)
      const r = await renderHtmlToPdf(`<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;color:#111;font-family:system-ui,Arial,sans-serif;font-size:13px}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${header(m)}${body}</body></html>`, { pageWidth: 595.28, pageHeight: 841.89, margin: 40, scale: 2, quality: 0.9 })
      downloadBlob(pdfToBlob(r.pdf), `${(m.subject || baseName(file.name)).replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'email'}.pdf`)
    } catch (e: any) { setError(e?.message || 'Could not make the PDF.') } finally { setBusy(false) }
  }
  const atts = m?.attachments.filter((a) => !a.inline || !a.contentId) ?? []
  const srcDoc = m ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:16px;font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111;background:#fff}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>` : ''

  if (!file) return <Dropzone accept=".eml,.msg,.mbox,.mbx,message/rfc822,application/vnd.ms-outlook" onFiles={(f) => open(f[0])} label="Drop an email file" sub="Open EML, Outlook MSG and MBOX files: read the message, save attachments, or export it as PDF. Nothing is uploaded." />
  return (
    <div className="space-y-3">
      <TopBar file={file} onReset={() => { setFile(null); setMails(null) }} label="Open another" />
      {busy && <StatusLine text={status} />}
      <ErrorNote error={error} />
      {mails && !mails.length && <ErrorNote error="No messages could be read from this file." />}
      {mails && m && (
        <div className={cn('grid gap-4', mails.length > 1 && 'lg:grid-cols-[300px_minmax(0,1fr)]')}>
          {mails.length > 1 && (
            <div className="space-y-2">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${mails.length} messages`} className="pl-9" aria-label="Search messages" /></div>
              <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface scrollbar-thin">{list.map(({ x, i }) => (
                <button key={i} onClick={() => setIdx(i)} className={cn('block w-full cursor-pointer border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2', i === idx && 'bg-accent/10')}>
                  <div className="truncate text-sm font-medium">{x.subject || '(no subject)'}</div>
                  <div className="flex justify-between gap-2 text-xs text-muted"><span className="truncate">{x.from?.name || x.from?.address}</span><span className="shrink-0">{x.date ? x.date.toLocaleDateString() : ''}</span></div>
                </button>))}</div>
            </div>
          )}
          <div className="min-w-0 space-y-3">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 font-semibold text-accent">{(m.from?.name || m.from?.address || '?').slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-semibold leading-snug">{m.subject || '(no subject)'}</h3>
                  <div className="text-sm"><span className="font-medium">{m.from?.name || m.from?.address}</span>{m.from?.name && m.from.address && <span className="text-muted"> &lt;{m.from.address}&gt;</span>}</div>
                  <div className="text-xs text-muted">To {m.to.map(fmtAddr).join(', ') || 'unknown'}{m.cc.length ? ` · Cc ${m.cc.map(fmtAddr).join(', ')}` : ''}</div>
                </div>
                <div className="text-xs text-muted">{fmtDate(m.date)}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon={<FileDown className="size-4" />} onClick={toPdf} loading={busy}>Save as PDF</Button>
                {hasRemote(m) && <Button size="sm" variant="outline" icon={remote ? <ImageOff className="size-4" /> : <ImageIcon className="size-4" />} onClick={() => setRemote(!remote)}>{remote ? 'Block remote images' : 'Load remote images'}</Button>}
                <Button size="sm" variant="ghost" icon={<MailIcon className="size-4" />} onClick={async () => downloadBlob(new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.subject)}</title></head><body>${header(m)}${await mailHtml(m, true)}</body></html>`], { type: 'text/html' }), `${(m.subject || 'email').replace(/[\\/:*?"<>|]/g, '').slice(0, 80)}.html`)}>Save as HTML</Button>
              </div>
            </div>
            {atts.length > 0 && (
              <div className="rounded-2xl border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between"><span className="inline-flex items-center gap-1.5 text-sm font-medium"><Paperclip className="size-4" />{atts.length} attachment{atts.length > 1 ? 's' : ''}</span>{atts.length > 1 && <Button size="sm" variant="outline" icon={<Archive className="size-4" />} onClick={async () => downloadBlob(await zipFiles(atts.map((a) => ({ name: a.filename, data: a.data }))), 'attachments.zip')}>All as ZIP</Button>}</div>
                <div className="flex flex-wrap gap-2">{atts.map((a, i) => <button key={i} onClick={() => downloadBlob(new Blob([a.data as BlobPart], { type: a.mimeType }), a.filename)} className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:border-accent"><Download className="size-3.5 shrink-0" /><span className="truncate">{a.filename}</span><span className="text-muted">{formatBytes(a.data.length)}</span></button>)}</div>
              </div>
            )}
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'body', label: 'Message' }, { value: 'text', label: 'Plain text' }, { value: 'headers', label: 'Headers' }]} />
            {tab === 'body' && (html ? <iframe title="Email body" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={srcDoc} className="h-[65vh] w-full rounded-xl border border-border bg-white" /> : <Spinner />)}
            {tab === 'text' && <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm scrollbar-thin">{m.text || 'No plain text version.'}</pre>}
            {tab === 'headers' && <div className="max-h-[65vh] overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-xs scrollbar-thin">{m.headers.length ? m.headers.map((h, i) => <div key={i} className="break-all py-0.5"><span className="text-accent">{h.key}</span>: {h.value}</div>) : 'No headers available.'}</div>}
            {!remote && hasRemote(m) && <p className="text-xs text-muted">Remote images are blocked so the sender cannot see that you opened the email.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
