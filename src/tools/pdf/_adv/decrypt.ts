/* Owner-restricted PDFs (no open password) are still encrypted; pdf-lib would write a broken file.
   Strip the encryption first with @cantoo/pdf-lib (empty user password). */
export async function plainBytes(src: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const bytes = src instanceof Blob ? new Uint8Array(await src.arrayBuffer()) : src instanceof Uint8Array ? src : new Uint8Array(src)
  // quick scan of the trailer area for /Encrypt
  const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 4096)))
  const head = new TextDecoder('latin1').decode(bytes.length < 200000 ? bytes : bytes.subarray(0, 4096))
  if (!/\/Encrypt\b/.test(tail) && !/\/Encrypt\b/.test(head)) return bytes
  try {
    const { PDFDocument } = await import('@cantoo/pdf-lib')
    const doc = await PDFDocument.load(bytes, { password: '' })
    return await doc.save()
  } catch {
    throw new Error('This PDF is password-protected. Unlock it first with the Unlock PDF tool.')
  }
}
