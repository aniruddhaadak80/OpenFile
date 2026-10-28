import { H2, H3, Note, Tip, T, Table } from '../prose'
import { ImageSupportDemo } from '../demos-more'

export default function PhotoFormats() {
  return <>
    <p>Four photo formats come up again and again in messages I get: HEIC, because iPhones save it and Windows does not always open it; JPG, because it opens everywhere; AVIF, because web developers keep recommending it; and JPEG XL, because people read that it is the best of all and then cannot open the file. Here is how they compare, and which one I actually use for what.</p>
    <H2>The short answer</H2>
    <ul>
      <li><strong>Sending a photo to someone:</strong> JPG. It is not the smallest, but it opens on every device made in the last thirty years.</li>
      <li><strong>Photos on a website:</strong> AVIF with a JPG or WebP fallback, or just WebP if you want one file.</li>
      <li><strong>Your own archive:</strong> keep whatever your camera or phone made. Converting an original to another lossy format only loses detail.</li>
      <li><strong>Looking ahead:</strong> JPEG XL is technically excellent, but support is still patchy, so do not make it the only copy you share.</li>
    </ul>
    <H2>What each format is</H2>
    <H3>JPG</H3>
    <p>JPEG dates from 1992. It splits the picture into 8 by 8 pixel blocks and stores each block as a mix of wave patterns, throwing away the fine detail your eyes are least likely to miss. It has no transparency, no animation and only 8 bits per channel. Its superpower is that everything opens it.</p>
    <H3>HEIC</H3>
    <p>HEIC is a HEIF container holding images compressed with HEVC, the same codec used for a lot of 4K video. Apple made it the default camera format on iPhone in 2017. At the same visual quality, a HEIC is often around half the size of a JPG, and it can hold extras such as depth maps, bursts and the still part of a Live Photo.</p>
    <p>The problem is support. HEVC is covered by patents with licensing fees, so most browsers and many apps never added it. Safari opens HEIC. Chrome and Firefox do not, and on Windows you may need an extra codec from the Store. That is why HEIC is the format people most often need to convert.</p>
    <H3>AVIF</H3>
    <p>AVIF is the same idea as HEIC, but built on AV1, a royalty-free video codec from the Alliance for Open Media. It compresses about as well as HEIC or better, supports transparency, HDR and animation, and every major browser decodes it today. The cost is encoding speed: AVIF takes noticeably longer to create than JPG or WebP, and very large AVIFs can be slow to encode on a phone.</p>
    <H3>JPEG XL</H3>
    <p>JPEG XL (file extension .jxl) is the newest of the four and was designed as a true successor to JPG. It compresses well across the whole quality range, supports lossless, transparency, HDR and very large images, and decodes progressively, so a blurry preview appears first and sharpens as the file loads. It also has a unique trick: it can repack an existing JPG losslessly, about 20 percent smaller, and give back the original JPG bit for bit.</p>
    <p>Support is the open question. Safari added JPEG XL in version 17. Chrome removed its experimental support in 2023, and the Chromium project has since said it would take it back with a new decoder, but at the time of writing you cannot count on a random visitor's browser opening a .jxl file. Use the check below to see where your browser stands.</p>
    <H2>Test your browser</H2>
    <ImageSupportDemo />
    <H2>Side by side</H2>
    <Table head={['', 'JPG', 'HEIC', 'AVIF', 'JPEG XL']} rows={[
      ['Typical size at similar quality', 'largest', 'about half of JPG', 'about half of JPG or less', 'about half of JPG or less'],
      ['Transparency', 'no', 'yes', 'yes', 'yes'],
      ['Animation', 'no', 'image sequences', 'yes', 'yes'],
      ['HDR and more than 8 bits', 'no', 'yes', 'yes', 'yes'],
      ['Lossless mode', 'no', 'rarely used', 'yes', 'yes, and lossless JPG repacking'],
      ['Opens in browsers', 'all', 'Safari only', 'all major ones', 'Safari, others vary'],
      ['Royalty free', 'yes', 'no', 'yes', 'yes'],
    ]} />
    <p>The size column is a rough guide. Real savings depend on the photo, the encoder and the quality setting, and they shrink at very high quality.</p>
    <H2>How OpenFile handles each one</H2>
    <ul>
      <li><T to="heic-converter">HEIC Converter</T> turns iPhone photos into JPG, PNG or WebP in bulk. It can also pull every image out of a multi-image HEIC, such as a burst.</li>
      <li><T to="image-converter">Image Converter</T> reads JPG, PNG, WebP, AVIF, GIF, HEIC, TIFF, JPEG XL and more, and writes AVIF and JPEG XL with encoders compiled to WebAssembly. That means it works even in a browser that cannot save those formats on its own.</li>
      <li><T to="jxl-maker">JPEG XL Converter</T> gives you the full set of JPEG XL options: lossy or lossless, an effort setting that trades speed for size, and progressive decoding.</li>
      <li><T to="pro-image-converter">Pro Image Converter</T> covers the long tail: TIFF, JPEG 2000, QOI, PSD, TGA, DDS and friends.</li>
    </ul>
    <Note title="About the lossless JPG trick">OpenFile's JPEG XL encoder works from decoded pixels. That gives excellent results, but it is not the bit-exact JPG repacking described above, which needs the reference command line tool. If you want zero additional loss from a JPG, use lossless mode, and expect a bigger file than the lossy one.</Note>
    <H2>Mistakes I see a lot</H2>
    <ul>
      <li><strong>Converting back and forth.</strong> HEIC to JPG to AVIF to JPG loses a little detail at every lossy step. Convert once, from the original.</li>
      <li><strong>Judging by the extension.</strong> Some apps save a JPG with a .heic name or the other way round. If a file will not open, check what it really is with <T to="file-identifier">File Type Identifier</T>.</li>
      <li><strong>Forgetting metadata.</strong> All four formats can carry EXIF data, including GPS location. Conversion in OpenFile does not add anything, but if you share photos publicly, strip location with <T to="image-metadata-remover">EXIF Viewer and Remover</T>.</li>
    </ul>
    <Tip>On an iPhone you can switch the camera to Most Compatible in Settings, Camera, Formats, and it will shoot JPG instead of HEIC. I leave it on HEIC to save space and convert only the photos I share.</Tip>
  </>
}
