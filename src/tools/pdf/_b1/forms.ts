/* Create AcroForm fields with pdf-lib (text, checkbox, radio, dropdown, list, signature, button). */
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFHexString, rgb, StandardFonts } from 'pdf-lib'
import { open, assertNotEncrypted, type Bytes } from './core'

export type FieldKind = 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'signature'
export interface FieldSpec {
  kind: FieldKind; name: string; page: number; rect: [number, number, number, number]
  value?: string; options?: string[]; checked?: boolean; required?: boolean; readOnly?: boolean; fontSize?: number; maxLength?: number
  radioValue?: string; tooltip?: string; border?: boolean; align?: 'left' | 'center' | 'right'; password?: boolean; comb?: boolean
}

export async function existingFieldNames(bytes: Bytes) {
  const d = await open(bytes)
  try { return d.getForm().getFields().map((f) => f.getName()) } catch { return [] }
}

export async function createFields(bytes: Bytes, specs: FieldSpec[]) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const taken = new Set(form.getFields().map((f) => f.getName()))
  const radios = new Map<string, ReturnType<typeof form.createRadioGroup>>()
  const style = (s: FieldSpec) => ({
    x: s.rect[0], y: s.rect[1], width: Math.max(4, s.rect[2] - s.rect[0]), height: Math.max(4, s.rect[3] - s.rect[1]),
    borderColor: s.border === false ? undefined : rgb(0.55, 0.6, 0.66), borderWidth: s.border === false ? 0 : 1, backgroundColor: undefined, font,
  })
  const uniq = (n: string) => { let base = (n || 'field').replace(/\./g, '_').trim() || 'field', k = base, i = 2; while (taken.has(k)) k = `${base}_${i++}`; taken.add(k); return k }
  for (const s of specs) {
    const page = pages[s.page]; if (!page) continue
    const tip = (w: any) => { if (s.tooltip) w?.acroField?.dict?.set(PDFName.of('TU'), PDFHexString.fromText(s.tooltip)) }
    switch (s.kind) {
      case 'text': case 'multiline': {
        const f = form.createTextField(uniq(s.name))
        if (s.kind === 'multiline') f.enableMultiline()
        if (s.maxLength) { f.setMaxLength(s.maxLength); if (s.comb) f.enableCombing() }
        if (s.password) f.enablePassword()
        if (s.value) f.setText(s.maxLength ? s.value.slice(0, s.maxLength) : s.value)
        f.setAlignment(s.align === 'center' ? 1 : s.align === 'right' ? 2 : 0)
        f.addToPage(page, style(s))
        f.setFontSize(s.fontSize ?? 0)
        if (s.required) f.enableRequired(); if (s.readOnly) f.enableReadOnly()
        tip(f); break
      }
      case 'checkbox': {
        const f = form.createCheckBox(uniq(s.name))
        f.addToPage(page, style(s))
        if (s.checked) f.check()
        if (s.required) f.enableRequired(); if (s.readOnly) f.enableReadOnly()
        tip(f); break
      }
      case 'radio': {
        const group = (s.name || 'choice').replace(/\./g, '_')
        let g = radios.get(group)
        if (!g) { g = form.createRadioGroup(uniq(group)); radios.set(group, g) }
        const val = (s.radioValue || `Option ${g.getOptions().length + 1}`).replace(/[^\w -]/g, '_')
        g.addOptionToPage(val, page, style(s))
        if (s.checked) g.select(val)
        if (s.required) g.enableRequired()
        tip(g); break
      }
      case 'dropdown': case 'list': {
        const opts = (s.options ?? []).map((o) => o.trim()).filter(Boolean)
        const f = s.kind === 'dropdown' ? form.createDropdown(uniq(s.name)) : form.createOptionList(uniq(s.name))
        f.addOptions(opts.length ? opts : ['Option 1'])
        if (s.value && opts.includes(s.value)) f.select(s.value)
        f.addToPage(page, style(s))
        f.setFontSize(s.fontSize ?? 0)
        if (s.required) f.enableRequired(); if (s.readOnly) f.enableReadOnly()
        tip(f); break
      }
      case 'signature': addSignatureField(doc, page.ref, s.rect, uniq(s.name || 'Signature'), s.tooltip); break
    }
  }
  form.updateFieldAppearances(font)
  return doc.save()
}

/** Empty signature field (FT /Sig) as a merged field + widget. */
export function addSignatureField(doc: PDFDocument, pageRef: any, rect: [number, number, number, number], name: string, tooltip?: string) {
  const ctx = doc.context
  const [x0, y0, x1, y1] = rect
  const ap = ctx.register(ctx.stream(`0.55 0.6 0.66 RG 1 w 0.5 0.5 ${x1 - x0 - 1} ${y1 - y0 - 1} re S`, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, x1 - x0, y1 - y0] }))
  const field = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFHexString.fromText(name), Rect: rect, F: 4, P: pageRef, MK: { BC: [0.55, 0.6, 0.66] }, AP: { N: ap }, ...(tooltip ? { TU: PDFHexString.fromText(tooltip) } : {}) })
  const ref = ctx.register(field)
  const page = ctx.lookup(pageRef) as PDFDict
  const annots = page.lookup(PDFName.of('Annots'))
  if (annots instanceof PDFArray) annots.push(ref); else page.set(PDFName.of('Annots'), ctx.obj([ref]))
  const form = doc.getForm()
  form.acroForm.addField(ref)
  return ref
}
