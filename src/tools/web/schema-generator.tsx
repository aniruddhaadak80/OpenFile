import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, Input, Label, Select, Textarea } from '@/components/ui'
import { buildSchema, schemaScript, SCHEMA_REQUIRED, type SchemaType } from '@/lib/cf/web'
import { OutBox } from '@/lib/cf/ui'

type F = [string, string, 'line' | 'multi' | 'date', string?]
const FIELDS: Record<SchemaType, F[]> = {
  Article: [['headline', 'Headline', 'line'], ['description', 'Description', 'multi'], ['images', 'Image URLs (one per line)', 'multi'], ['author', 'Author', 'line'], ['authorUrl', 'Author page URL', 'line'], ['datePublished', 'Published', 'date'], ['dateModified', 'Updated', 'date'], ['publisher', 'Publisher', 'line'], ['logo', 'Publisher logo URL', 'line'], ['url', 'Page URL', 'line']],
  FAQPage: [['faq', 'Questions: lines starting Q: then A:', 'multi', 'Q: Is it free?\nA: Yes, every tool is free.\nQ: Are my files uploaded?\nA: No, everything runs in your browser.']],
  Product: [['name', 'Name', 'line'], ['description', 'Description', 'multi'], ['images', 'Image URLs', 'multi'], ['brand', 'Brand', 'line'], ['sku', 'SKU', 'line'], ['gtin', 'GTIN / barcode', 'line'], ['price', 'Price', 'line'], ['currency', 'Currency (USD, INR)', 'line'], ['availability', 'Availability (InStock, OutOfStock)', 'line'], ['rating', 'Average rating', 'line'], ['reviews', 'Review count', 'line'], ['url', 'Page URL', 'line']],
  LocalBusiness: [['subtype', 'Type (Restaurant, Dentist, Store)', 'line'], ['name', 'Name', 'line'], ['image', 'Photo URL', 'line'], ['phone', 'Phone', 'line'], ['url', 'Website', 'line'], ['street', 'Street', 'line'], ['city', 'City', 'line'], ['region', 'State or region', 'line'], ['postal', 'Postal code', 'line'], ['country', 'Country code (IN, US)', 'line'], ['lat', 'Latitude', 'line'], ['lng', 'Longitude', 'line'], ['hours', 'Hours (Mo-Fr 09:00-18:00, one per line)', 'multi'], ['priceRange', 'Price range ($$)', 'line']],
  Event: [['name', 'Event name', 'line'], ['description', 'Description', 'multi'], ['start', 'Starts (2026-11-20T19:00+05:30)', 'line'], ['end', 'Ends', 'line'], ['mode', 'Online or in person (OnlineEventAttendanceMode / OfflineEventAttendanceMode)', 'line'], ['venue', 'Venue name', 'line'], ['address', 'Venue address', 'line'], ['url', 'Tickets or join URL', 'line'], ['price', 'Ticket price', 'line'], ['currency', 'Currency', 'line'], ['organizer', 'Organiser', 'line'], ['images', 'Image URLs', 'multi']],
  BreadcrumbList: [['crumbs', 'Name | URL, one per line, from the home page down', 'multi', 'Home | https://example.com/\nTools | https://example.com/tools\nPDF | https://example.com/tools/pdf']],
  Organization: [['name', 'Name', 'line'], ['url', 'Website', 'line'], ['logo', 'Logo URL', 'line'], ['phone', 'Support phone', 'line'], ['sameAs', 'Social profile URLs', 'multi']],
  Person: [['name', 'Name', 'line'], ['jobTitle', 'Job title', 'line'], ['worksFor', 'Works for', 'line'], ['url', 'Website', 'line'], ['image', 'Photo URL', 'line'], ['sameAs', 'Profile URLs', 'multi']],
  Recipe: [['name', 'Recipe name', 'line'], ['description', 'Description', 'multi'], ['images', 'Image URLs', 'multi'], ['author', 'Author', 'line'], ['prepTime', 'Prep time (PT15M)', 'line'], ['cookTime', 'Cook time (PT30M)', 'line'], ['yield', 'Serves', 'line'], ['ingredients', 'Ingredients, one per line', 'multi'], ['steps', 'Steps, one per line', 'multi']],
  HowTo: [['name', 'Title', 'line'], ['description', 'Description', 'multi'], ['totalTime', 'Total time (PT20M)', 'line'], ['steps', 'Steps, one per line', 'multi']],
  WebSite: [['name', 'Site name', 'line'], ['url', 'Home page', 'line'], ['search', 'Search URL with {search_term_string}', 'line']],
  SoftwareApplication: [['name', 'App name', 'line'], ['os', 'Operating system', 'line'], ['category', 'Category (BusinessApplication)', 'line'], ['price', 'Price', 'line'], ['currency', 'Currency', 'line'], ['rating', 'Average rating', 'line'], ['reviews', 'Rating count', 'line']],
}

export default function SchemaGenerator() {
  const [type, setType] = useState<SchemaType>('FAQPage')
  const [vals, setVals] = useState<Record<string, string>>({})
  const f = (k: string, def?: string) => vals[`${type}.${k}`] ?? def ?? ''
  const fields = Object.fromEntries(FIELDS[type].map(([k, , , d]) => [k, f(k, d)]))
  const obj = useMemo(() => buildSchema(type, fields), [type, JSON.stringify(fields)])
  const missing = (SCHEMA_REQUIRED[type] ?? []).filter((k) => !(fields[k === 'image' ? 'images' : k] ?? '').trim())
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <label className="block"><Label>Type of page</Label><Select value={type} onChange={(v) => setType(v as SchemaType)} options={Object.keys(FIELDS).map((k) => ({ value: k, label: k.replace(/([a-z])([A-Z])/g, '$1 $2') }))} /></label>
        {FIELDS[type].map(([k, l, kind, d]) => <div key={type + k}><Label>{l}</Label>{kind === 'multi' ? <Textarea value={f(k, d)} onChange={(e) => setVals({ ...vals, [`${type}.${k}`]: e.target.value })} className="min-h-20 font-sans text-sm" /> : <Input type={kind === 'date' ? 'date' : 'text'} value={f(k, d)} onChange={(e) => setVals({ ...vals, [`${type}.${k}`]: e.target.value })} />}</div>)}
      </Card>
      <div className="space-y-3">
        {missing.length > 0 && <Card className="flex gap-2 border-warn/40 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />Rich results need: {missing.join(', ')}.</Card>}
        <OutBox title="JSON-LD (paste in the page head)" text={schemaScript(obj ?? {})} filename="schema.html" rows={22} />
        <p className="text-xs text-muted">Only add markup for things that are visible on the page. Test the result with the Rich Results Test before you publish.</p>
      </div>
    </div>
  )
}
