import { H2, H3, Note, Tip, Warn, T, Table } from '../prose'
import { SignaturePadDemo } from '../demos-more'

export default function SignAndFill() {
  return <>
    <p>A rental agreement, a school consent form, an offer letter. Sooner or later someone sends you a PDF and says please fill this in, sign and send it back. The usual options are printing and scanning, or uploading the document to an e-signature website. This post shows the third option: doing all of it in your browser, with the file never leaving your device.</p>
    <H2>Two very different things called signing</H2>
    <p>Before the how, one distinction that confuses a lot of people.</p>
    <Table head={['', 'Signature image', 'Digital signature (certificate)']} rows={[
      ['What it is', 'a picture of your handwriting placed on the page', 'cryptographic proof attached to the file'],
      ['What it proves', 'that you meant to sign, like ink on paper', 'who signed, and that nothing changed afterwards'],
      ['What you need', 'a mouse, finger or pen', 'a certificate file (.p12 or .pfx) from an issuer'],
      ['Typical use', 'everyday forms, letters, rental papers', 'contracts and official filings that require it'],
      ['OpenFile tool', <T to="sign-pdf">Sign PDF</T>, <T to="sign-pdf-certificate">Digital Signature (Certificate)</T>],
    ]} />
    <p>Most of the time people mean the first kind, and in many countries a simple electronic signature like that is accepted for everyday documents. When a document says it needs a qualified or certificate based signature, that is the second kind. If in doubt, ask whoever sent the form what they accept.</p>
    <H2>Try drawing one</H2>
    <p>Here is a small version of the signature pad. Draw with a mouse, a finger or a stylus, then make a transparent PNG. It is drawn by your browser's canvas and stays in this tab.</p>
    <SignaturePadDemo />
    <H2>Filling in a form</H2>
    <p>Many PDFs from banks, schools and government offices have real form fields: text boxes, checkboxes, dropdowns and radio buttons. <T to="fill-pdf-form">Fill PDF Form</T> detects them, lists them in a panel next to the page, and lets you type into each one. Dropdowns show their options, checkboxes toggle, and you can see the result on the rendered page as you go.</p>
    <p>When you save, you choose between two outcomes:</p>
    <ul>
      <li><strong>Keep fields editable.</strong> The values are written into the form, and anyone can still change them in a PDF reader. Good when someone else fills in the rest.</li>
      <li><strong>Flatten.</strong> The values are merged into the page and can no longer be edited. Good for the final copy you send back.</li>
    </ul>
    <H3>What if the PDF has no fields</H3>
    <p>Plenty of forms are just a scanned page with lines on it. You have two options. For a one-off, open <T to="edit-pdf">Edit PDF</T> and add text boxes where you need them. If you send the same form to many people, make it fillable once with <T to="create-pdf-form">Create Fillable PDF Form</T>: draw text fields, checkboxes, dropdowns and signature fields on the page, and it writes standard AcroForm fields that work in Acrobat, browsers and phone apps.</p>
    <Tip>Fill PDF Form can also load values from a JSON file. If you fill the same form every month with mostly the same details, save your answers once and load them next time.</Tip>
    <H2>Signing the page</H2>
    <p><T to="sign-pdf">Sign PDF</T> gives you three ways to make a signature: draw it, type your name in a handwriting style font, or upload a photo of your signature on white paper. Then you click on the page to place it, drag to move it and resize it with the handles.</p>
    <p>The same tool adds the date, in the format you pick, and your initials, which many contracts want on every page. You can save a signature on this device so you do not draw it again next time. It is kept in your browser's local storage, not on a server, and you can delete it from the saved list whenever you like.</p>
    <H2>The order that works</H2>
    <ol>
      <li>Fill the fields and keep them editable.</li>
      <li>Read the whole thing once on the page preview.</li>
      <li>Sign, add the date and initials.</li>
      <li>Flatten, so fields and annotations cannot be changed by accident. <T to="flatten-pdf">Flatten PDF</T> does this as its own step if you need it.</li>
      <li>If the file is large, compress it last.</li>
    </ol>
    <Warn title="Signing a certificate signed file">If a PDF already carries a digital signature, any later change, including adding your signature image, can show up as a modification in the signer's software. When you receive a document that is already certificate signed, sign it with a certificate too, so the earlier signature stays valid as an incremental update.</Warn>
    <H2>Certificate signatures without uploading your key</H2>
    <p>If you have a personal or company certificate, <T to="sign-pdf-certificate">Digital Signature (Certificate)</T> opens your .p12 or .pfx file locally, asks for its password, and builds a SHA-256 signature over the exact bytes of the PDF. The signature can be visible, with your name and the date in a box, or invisible. It is added as an incremental update, so any signatures already in the file keep working.</p>
    <p>This is the part where privacy matters most. Your certificate file and its password are, in effect, your identity. Uploading them to a website so it can sign on your behalf is a big ask. Here they are read into memory in this tab, used once, and gone when you close it.</p>
    <p>On the receiving end, <T to="verify-pdf-signature">Verify PDF Signatures</T> checks each signature in a document: whether the signed bytes still match, who signed it, the certificate chain and any timestamp.</p>
    <Note title="What OpenFile does not do">It does not send documents to other people for signature or track who has signed. Those workflows need a server that holds the document, which is exactly what OpenFile avoids. For a single signer, which is most cases, you do not need any of that.</Note>
  </>
}
