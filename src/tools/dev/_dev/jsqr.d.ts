export interface QRCodeResult { binaryData: number[]; data: string; location: Record<string, { x: number; y: number }> }
declare function jsQR(data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }): QRCodeResult | null
export default jsQR
