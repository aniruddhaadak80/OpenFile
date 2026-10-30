import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Card, Dropzone, Label, Textarea } from '@/components/ui'
import { analyzeHeaders } from '@/lib/cf/priv'
import { OutBox, Stat, Stats } from '@/lib/cf/ui'

const SAMPLE = `Delivered-To: you@example.com
Received: by 2002:a05:6400:1b04:b0:21e with SMTP id x; Thu, 29 Oct 2026 01:12:44 -0700 (PDT)
Received: from mail.example-bank-secure.top (mail.example-bank-secure.top. [203.0.113.45]) by mx.example.com with ESMTPS id k12; Thu, 29 Oct 2026 01:12:40 -0700 (PDT)
Received: from [192.168.1.20] (unknown [10.2.3.4]) by mail.example-bank-secure.top (Postfix) with ESMTPSA id 4F2; Thu, 29 Oct 2026 08:12:31 +0000 (UTC)
Authentication-Results: mx.example.com; spf=softfail (domain of transitioning alerts@yourbank.com does not designate 203.0.113.45 as permitted sender) smtp.mailfrom=alerts@yourbank.com; dkim=none; dmarc=fail (p=REJECT) header.from=yourbank.com
From: "Your Bank" <alerts@yourbank.com>
Reply-To: verify-team@example-bank-secure.top
Return-Path: <alerts@yourbank.com>
Subject: Action needed: confirm your account
Date: Thu, 29 Oct 2026 08:12:30 +0000
Message-ID: <a1b2c3@mail.example-bank-secure.top>
X-Mailer: PHPMailer 6.8.0`

const badge = (v?: string) => !v ? <span className="text-muted">not found</span> : v === 'pass' ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-4" />pass</span> : <span className="inline-flex items-center gap-1 text-danger"><XCircle className="size-4" />{v}</span>
const fmtDelay = (s?: number) => s == null ? '' : s < 0 ? 'clock skew' : s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`

export default function EmailHeaderAnalyzer() {
  const [raw, setRaw] = useState(SAMPLE)
  const r = useMemo(() => analyzeHeaders(raw), [raw])
  const total = r.hops.length > 1 && r.hops[0].date && r.hops.at(-1)!.date ? (+r.hops.at(-1)!.date! - +r.hops[0].date!) / 1000 : undefined
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <div><Label>Paste the full email headers (Show original or View source in your mail app)</Label><Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="min-h-44" /></div>
        <Dropzone compact accept=".eml,.txt,.msg" onFiles={async (f) => setRaw(await f[0].text())} label="Or drop a .eml file" sub="Read on your device" />
      </div>
      <Stats cols={4}><Stat label="SPF" value={<span className="text-base">{badge(r.spf)}</span>} /><Stat label="DKIM" value={<span className="text-base">{badge(r.dkim)}</span>} /><Stat label="DMARC" value={<span className="text-base">{badge(r.dmarc)}</span>} /><Stat label="Delivery time" value={total != null ? fmtDelay(total) : '-'} sub={`${r.hops.length} hops`} /></Stats>
      {r.warnings.length > 0 && <Card className="space-y-2 border-warn/40 bg-warn/5">{r.warnings.map((w, i) => <p key={i} className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{w}</p>)}</Card>}
      <Card className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {([['From', r.from], ['Reply-To', r.replyTo], ['Return-Path', r.returnPath], ['Subject', r.subject], ['Date', r.date], ['Message-ID', r.messageId], ['Sent with', r.client], ['First public IP', r.originIp]] as const).map(([k, v]) => <div key={k} className="min-w-0"><span className="text-xs uppercase tracking-wide text-muted">{k}</span><div className="truncate font-mono text-[13px]" title={v ?? ''}>{v || '-'}</div></div>)}
      </Card>
      {r.hops.length > 0 && <Card className="space-y-0 p-0"><div className="border-b border-border px-4 py-2 text-sm font-semibold">Route, oldest first</div>
        <ol className="divide-y divide-border">{r.hops.map((h, i) => <li key={i} className="grid gap-1 px-4 py-2 text-xs sm:grid-cols-[2rem_1fr_1fr_6rem]"><span className="font-mono text-muted">{i + 1}</span><span className="truncate" title={h.from}><b>from</b> {h.from || '-'}{h.ip ? ` [${h.ip}]` : ''}</span><span className="truncate" title={h.by}><b>by</b> {h.by || '-'} {h.with && <span className="text-muted">({h.with})</span>}</span><span className={`text-right font-mono ${(h.delay ?? 0) > 300 ? 'text-warn' : 'text-muted'}`}>{fmtDelay(h.delay)}</span></li>)}</ol></Card>}
      <OutBox title={`All ${r.fields.length} header fields`} text={r.fields.map((f) => `${f.name}: ${f.value}`).join('\n')} filename="headers.txt" />
      <p className="text-xs text-muted">Headers are read on your device. The IP address shown is only where the message entered the public internet, not always the sender's home.</p>
    </div>
  )
}
