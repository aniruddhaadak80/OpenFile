import { H2, H3, Note, Warn, Tip, T } from '../prose'
import { WindowLevelDemo } from '../demos-more'

export default function Dicom() {
  return <>
    <p>After a CT or MRI scan, many hospitals hand you a CD or a download link full of files with names like IM000123 and no extension. Double-click one and nothing happens. Those are DICOM files, and they are perfectly viewable if you know what they are. This post explains the format, the one control that matters most, and how to look at your own scans without uploading them to a stranger's website.</p>
    <Warn title="Not for diagnosis">OpenFile's DICOM Viewer is for education and convenience, so you can see your own images or share a picture with family. It is not a certified medical device. Your radiologist's report is what counts.</Warn>
    <H2>What DICOM is</H2>
    <p>DICOM stands for Digital Imaging and Communications in Medicine. It is both a file format and a network protocol, and nearly every scanner, hospital archive and medical viewer speaks it. A DICOM file holds two things:</p>
    <ul>
      <li><strong>Tags</strong>: hundreds of labelled fields, each with a numeric id. Patient name, birth date, the hospital, the scanner model, slice thickness, the position of the slice in the body, and much more.</li>
      <li><strong>Pixel data</strong>: the image itself, often 12 or 16 bits per pixel instead of the 8 bits of a normal photo.</li>
    </ul>
    <p>A single CT scan is not one file. It is a <strong>series</strong>: usually one file per slice, sometimes hundreds of them, which together make up a 3D volume. That is why opening one file in isolation feels like looking at a single page torn from a book.</p>
    <H2>Numbers, not colours</H2>
    <p>Here is the part that surprised me most. In a CT image, a pixel does not store a brightness. It stores a measurement: how strongly that bit of tissue absorbed X-rays, on the Hounsfield scale. Water is 0, air is about minus 1000, fat is around minus 100, soft tissue sits roughly between 20 and 80, and dense bone goes up to well over a thousand.</p>
    <p>That range is far wider than a screen can show in 256 shades of grey. So viewers use a <strong>window</strong>: you pick a centre value (the level) and a width, and only values inside that range are spread from black to white. Everything below is black, everything above is white.</p>
    <p>Try it on the made-up slice below. The presets are the same ones the viewer offers.</p>
    <WindowLevelDemo />
    <p>Notice how the Lung preset shows the inside of the lungs but turns everything else into a white blob, while Soft tissue does the opposite. Same pixels, different window. Radiologists switch windows constantly for exactly this reason.</p>
    <H2>Opening your own scans</H2>
    <p><T to="dicom-viewer">DICOM Viewer</T> reads DICOM with dicom-parser, and also opens NIfTI and NRRD volumes, which are common in research and teaching.</p>
    <ol>
      <li>Find the folder with the image files. On a hospital CD there is often a DICOM folder with many subfolders. Each subfolder is usually one series.</li>
      <li>Select all the files of a series and drop them in together. The viewer sorts slices by their instance number and stacks them.</li>
      <li>Drag on the image to change window and level. Scroll, or use the arrow keys, to move through the slices.</li>
      <li>Use the CT presets (Soft tissue, Lung, Bone and Brain) as a starting point, and Invert if you prefer bones dark.</li>
      <li>Save the current slice, or all slices, as PNG.</li>
    </ol>
    <H3>Rescale slope and intercept</H3>
    <p>Scanners often store raw numbers and two tags that convert them into real units. The viewer applies this rescale automatically, so the values under your cursor are true Hounsfield units for CT. You do not need to do anything, but it explains why another tool might show different numbers for the same pixel.</p>
    <H2>Patient data and sharing</H2>
    <p>Because DICOM files carry names, dates of birth and hospital details inside them, I treat them like any other medical record. A few habits:</p>
    <ul>
      <li>The viewer shows the key tags in a details panel, and you can hide them with Hide patient data before you take a screenshot.</li>
      <li>Exported PNGs contain only pixels. No patient tags are written into them, which makes PNG the right format for sending a picture to a relative.</li>
      <li>Never send the original DICOM files to someone who does not need them. They carry far more than the picture.</li>
      <li>If a screenshot shows burned-in text on the image itself, some scanners print the name in a corner, cover it with <T to="blur-faces">Blur and Redact Image</T> before sharing.</li>
    </ul>
    <Tip>Want a single document for a second opinion appointment? Export the few slices that matter as PNG, then combine them with <T to="image-to-pdf">Image to PDF</T>. It prints well and opens on any device.</Tip>
    <H2>Why do this locally</H2>
    <p>Search for an online DICOM viewer and many of the results upload your files to a server to process them. For a scan of your head or chest, that is a lot of personal health information to hand over to a site you found a minute ago. With OpenFile the files are parsed in your browser tab, the pixels are drawn on a canvas, and nothing is sent anywhere. You can load the page, turn off Wi-Fi, and keep working.</p>
    <Note title="Limits">Compressed DICOM transfer syntaxes vary a lot between scanners. Most common CT, MRI and X-ray files open fine. If a series does not, the hospital's own viewer on the CD is the safest fallback, and the radiology department can usually export a standard copy on request.</Note>
  </>
}
