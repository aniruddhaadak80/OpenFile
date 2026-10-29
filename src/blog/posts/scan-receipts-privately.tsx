import { H2, H3, Note, Tip, T } from '../prose'
import { ReceiptParseDemo } from '../demos-r13'

export default function ScanReceipts() {
  return <>
    <p>Receipts pile up in wallets, drawers and photo galleries. For expense claims, taxes or just a monthly budget, I want them as rows in a spreadsheet: the shop, the date, the tax and the total. Receipt apps do this well, but most of them upload your photos to a server and some keep them. So I built <T to="receipt-scanner">AI Receipt Scanner</T> to do the whole job on the device. Here is how it works, what it gets right, and where you still need to check its work.</p>
    <H2>Step 1: clean up the photo</H2>
    <p>Text recognition works best on dark text on a light background with good contrast. Phone photos of thermal paper are often the opposite: grey, curled and lit from one side. Before reading, the tool shrinks the photo so the longest side is 1600 pixels (2400 in Best mode), turns it grey, and stretches the contrast so the darkest pixel becomes black and the lightest becomes white. That simple step makes a big difference on faded receipts, and the smaller size makes reading faster.</p>
    <H2>Step 2: read the text with OCR</H2>
    <p>The reading is done by Tesseract, an open source OCR engine that uses a small LSTM neural network trained to recognise lines of text. In the browser it runs as WebAssembly inside a Web Worker, which is a background thread. That has two good effects:</p>
    <ul>
      <li>The page stays responsive while it reads, and the Cancel button stops it straight away.</li>
      <li>It needs no graphics card. It runs on the CPU of any laptop or phone.</li>
    </ul>
    <p>The language model downloads the first time, about 4 to 15 MB per language, and the browser keeps it for next time. You can pick English, English with Hindi, or a set of common European languages.</p>
    <H2>Step 3: find the parts that matter</H2>
    <p>OCR gives you plain text, line by line. The tool then looks through it with a few rules that match how receipts are printed:</p>
    <ul>
      <li><strong>Total</strong>: the last line that says total, grand total, amount due or net payable and ends with a price.</li>
      <li><strong>Tax</strong>: lines with GST, VAT, CGST, SGST, IGST or tax.</li>
      <li><strong>Date</strong>: the first date in a common format, such as 14/10/2026 or 14 Oct 2026.</li>
      <li><strong>Shop</strong>: the first real words near the top that are not an address line, phone number or the word receipt.</li>
      <li><strong>Items</strong>: lines that end with a price and are not totals, tax, change or the payment method.</li>
    </ul>
    <p>Here is the same parser running live. The text on the left is what OCR might return. Edit it to see how a misread digit or a broken line changes the result.</p>
    <ReceiptParseDemo />
    <H3>Why rules and not a big AI model</H3>
    <p>A large vision language model could read a receipt in one go, but it would mean a download of several hundred megabytes and slow work on a phone without a GPU. Receipts are very regular, so OCR plus a few clear rules gets most of them right, quickly, on any device. When a field is wrong you fix it in a box, which is faster than arguing with a model.</p>
    <H2>Using the results</H2>
    <p>Each receipt shows its photo next to editable fields for shop, date, tax and total. When they look right, you can download:</p>
    <ul>
      <li>A receipts CSV with one row per receipt, for expense reports.</li>
      <li>A line items CSV with every item, for budget tracking.</li>
      <li>JSON, if you want to feed it into your own scripts.</li>
    </ul>
    <Tip>Split the bill after a trip: scan the receipts, then put the totals into <T to="expense-splitter">Expense Splitter</T>. It works out who owes whom with the fewest payments.</Tip>
    <H2>Tips for better scans</H2>
    <ul>
      <li>Lay the receipt flat on a dark surface and shoot straight down.</li>
      <li>Use daylight or even room light, and avoid shadows from your phone.</li>
      <li>Scan thermal receipts soon. They fade within months, sometimes weeks in a hot wallet.</li>
      <li>If one is very long, take two photos and scan them as separate files.</li>
    </ul>
    <H2>Privacy</H2>
    <p>Receipts can show your card's last digits, your address for deliveries, and where you were at what time. With OpenFile the photo is opened in your browser, read by the OCR model in your browser, and the result is shown in your browser. Nothing is uploaded, and nothing is saved after you close the tab.</p>
    <Note title="Check before you file">OCR can confuse 5 and 6, or 1 and 7, on faded paper. Always glance at the total against the photo before you send an expense claim.</Note>
  </>
}
