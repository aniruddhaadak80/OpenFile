/* AcroForm detection + filling with pdf-lib (pure, testable in node) */
import { plainBytes } from './decrypt'

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'button' | 'signature' | 'unknown'
export type FieldValue = string | boolean | string[]

export interface FieldInfo {
  name: string
  label: string
  kind: FieldKind
  value: FieldValue
  options?: string[]
  multiline?: boolean
  maxLength?: number
  readOnly?: boolean
  required?: boolean
  editable?: boolean
  multi?: boolean
  /** widget rectangles in PDF user space with page index */
  widgets: { page: number; x: number; y: number; w: number; h: number; option?: string }[]
}

function prettify(name: string) {
  const last = name.split('.').pop() || name
  return last.replace(/\[\d+\]$/, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim() || name
}

export async function readFields(bytes: Uint8Array | ArrayBuffer): Promise<{ fields: FieldInfo[]; hasXfa: boolean; pageCount: number }> {
  const lib = await import('pdf-lib')
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFButton, PDFSignature, PDFName, PDFString, PDFHexString } = lib
  const doc = await PDFDocument.load(await plainBytes(bytes), { ignoreEncryption: true })
  const form = doc.getForm()
  const hasXfa = form.hasXFA()
  const pages = doc.getPages()
  const pageIndexByRef = new Map<string, number>()
  pages.forEach((p, i) => pageIndexByRef.set(p.ref.toString(), i))
  const findPage = (widget: any): number => {
    const P = widget.P?.()
    if (P && pageIndexByRef.has(P.toString())) return pageIndexByRef.get(P.toString())!
    const ref = doc.context.getObjectRef(widget.dict)
    if (ref) {
      for (let i = 0; i < pages.length; i++) {
        const annots = pages[i].node.Annots()
        if (annots && annots.asArray().some((a: any) => a.toString() === ref.toString())) return i
      }
    }
    return 0
  }
  const fields: FieldInfo[] = []
  for (const f of form.getFields()) {
    const name = f.getName()
    const tu = f.acroField.dict.get(PDFName.of('TU'))
    const alt = tu instanceof PDFString || tu instanceof PDFHexString ? tu.decodeText() : ''
    const widgets = f.acroField.getWidgets().map((w: any) => {
      const r = w.getRectangle()
      let option: string | undefined
      try { const on = w.getOnValue?.(); if (on) option = on.decodeText?.() ?? on.toString().replace(/^\//, '') } catch { /* ignore */ }
      return { page: findPage(w), x: r.x, y: r.y, w: r.width, h: r.height, option }
    })
    const base = { name, label: alt || prettify(name), widgets, readOnly: f.isReadOnly(), required: f.isRequired() }
    if (f instanceof PDFTextField) {
      let maxLength: number | undefined
      try { maxLength = f.getMaxLength() } catch { /* none */ }
      fields.push({ ...base, kind: 'text', value: f.getText() ?? '', multiline: f.isMultiline(), maxLength })
    } else if (f instanceof PDFCheckBox) fields.push({ ...base, kind: 'checkbox', value: f.isChecked() })
    else if (f instanceof PDFRadioGroup) fields.push({ ...base, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() })
    else if (f instanceof PDFDropdown) fields.push({ ...base, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions(), editable: f.isEditable() })
    else if (f instanceof PDFOptionList) fields.push({ ...base, kind: 'list', value: f.getSelected(), options: f.getOptions(), multi: f.isMultiselect() })
    else if (f instanceof PDFButton) fields.push({ ...base, kind: 'button', value: '' })
    else if (f instanceof PDFSignature) fields.push({ ...base, kind: 'signature', value: '' })
    else fields.push({ ...base, kind: 'unknown', value: '' })
  }
  // radio widgets: map option names in the same order as getOptions
  for (const f of fields) if (f.kind === 'radio' && f.options) f.widgets.forEach((w, i) => { w.option = f.options![i] ?? w.option })
  fields.sort((a, b) => {
    const pa = a.widgets[0]?.page ?? 0, pb = b.widgets[0]?.page ?? 0
    if (pa !== pb) return pa - pb
    const ya = a.widgets[0] ? a.widgets[0].y + a.widgets[0].h : 0, yb = b.widgets[0] ? b.widgets[0].y + b.widgets[0].h : 0
    if (Math.abs(ya - yb) > 4) return yb - ya
    return (a.widgets[0]?.x ?? 0) - (b.widgets[0]?.x ?? 0)
  })
  return { fields, hasXfa, pageCount: pages.length }
}

export async function fillForm(bytes: Uint8Array | ArrayBuffer, values: Record<string, FieldValue>, flatten: boolean): Promise<{ bytes: Uint8Array; warning: string | null }> {
  const lib = await import('pdf-lib')
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFName, PDFBool, StandardFonts } = lib
  const doc = await PDFDocument.load(await plainBytes(bytes), { ignoreEncryption: true })
  const form = doc.getForm()
  if (form.hasXFA()) form.deleteXFA()
  const errors: string[] = []
  for (const f of form.getFields()) {
    const name = f.getName()
    if (!(name in values)) continue
    const v = values[name]
    try {
      if (f instanceof PDFTextField) {
        const s = String(v ?? '')
        let max: number | undefined
        try { max = f.getMaxLength() } catch { /* none */ }
        f.setText(max !== undefined ? s.slice(0, max) : s)
      } else if (f instanceof PDFCheckBox) { v ? f.check() : f.uncheck() }
      else if (f instanceof PDFRadioGroup) { if (v) f.select(String(v)); else f.clear() }
      else if (f instanceof PDFDropdown) {
        const s = String(v ?? '')
        if (!s) f.clear()
        else { if (!f.getOptions().includes(s)) { if (!f.isEditable()) f.enableEditing() } f.select(s) }
      } else if (f instanceof PDFOptionList) {
        const arr = Array.isArray(v) ? v : v ? [String(v)] : []
        if (!arr.length) f.clear(); else f.select(arr)
      }
    } catch (e: any) { errors.push(`${name}: ${e?.message || e}`) }
  }
  let warning: string | null = errors.length ? `Some fields could not be set (${errors.slice(0, 3).join('; ')})` : null
  const font = await doc.embedFont(StandardFonts.Helvetica)
  try {
    form.updateFieldAppearances(font)
    if (flatten) form.flatten({ updateFieldAppearances: false })
    return { bytes: await doc.save({ updateFieldAppearances: false }), warning }
  } catch (e: any) {
    if (flatten) throw new Error('Some values use characters (e.g. non-Latin scripts) that the built-in PDF font cannot draw, so the form cannot be flattened. Turn off “Flatten” to keep the values as editable fields.')
    // keep values; ask viewers to regenerate appearances
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)
    warning = 'Some characters cannot be drawn by the standard PDF font; your reader will render those fields itself.'
    return { bytes: await doc.save({ updateFieldAppearances: false }), warning }
  }
}
