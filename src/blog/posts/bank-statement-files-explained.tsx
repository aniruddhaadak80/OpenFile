import { H2, H3, Note, Tip, Warn, T, Table } from '../prose'
import { BankFormatDemo } from '../demos-r13'

export default function BankStatementFiles() {
  return <>
    <p>Every bank lets you download your transactions, but the download menu often reads like alphabet soup: OFX, QFX, QIF, CSV, CAMT.053, MT940. Pick the wrong one and your money app refuses it, or your spreadsheet shows dates as random numbers. I went through all of these while building the Money and Finance tools in OpenFile, so here is what each format is, which one to choose, and how to convert between them without sending your statement to a website you do not know.</p>
    <H2>Why the format matters</H2>
    <p>A bank statement is a list of rows: a date, an amount, some text about who you paid, and sometimes a reference and a running balance. That sounds simple, yet each format stores it differently. Some put the sign on the amount, some use a separate debit and credit column, some use letters like D and C. Dates come as 20261003, 03/10/2026 or 10/03/2026, and the last two mean different days depending on the country. A good converter has to guess these things correctly, and let you fix them when it guesses wrong.</p>
    <H2>The formats you will meet</H2>
    <Table head={['Format', 'Where it comes from', 'Good for']} rows={[
      ['OFX / QFX', 'Most US, UK and Indian banks, card issuers', 'Importing into money apps, keeps IDs so imports do not double'],
      ['QIF', 'Older Quicken exports, many apps still read it', 'Simple imports, easy to read by eye'],
      ['CSV', 'Every bank, every country', 'Spreadsheets, but each bank uses its own columns'],
      ['CAMT.053', 'European banks (ISO 20022 XML)', 'Detailed SEPA data: names, IBANs, remittance text'],
      ['MT940', 'SWIFT format, business and older EU banking', 'Accounting software, very compact'],
    ]} />
    <H3>OFX and QFX</H3>
    <p>OFX stands for Open Financial Exchange. Version 1 looks like HTML with tags that are never closed, version 2 is proper XML. QFX is the same thing with a few extra fields for one money app, and QBO is another variant for accounting software. Each transaction sits in a block called STMTTRN with a date, an amount, a name, an optional memo, and a FITID, which is a unique id. That id is the clever part: when you import the same file twice, the app sees the same ids and skips the copies.</p>
    <H3>QIF</H3>
    <p>QIF is a plain text format from the early days of personal finance software. Each line starts with one letter: D for date, T for amount, P for payee, M for memo, and a caret on its own line ends the record. It has no unique ids and the dates are usually month first, which is why QIF imports sometimes land in the wrong month for people outside the US.</p>
    <H3>CSV</H3>
    <p>CSV is the format everyone has and nobody agrees on. One bank calls the column Narration, another Details, another Description. Some have a single Amount column, others split it into Withdrawal and Deposit. Many put a few title lines above the real header. When you open a CSV in <T to="bank-statement-converter">Bank Statement Converter</T>, it looks for the header row, matches columns by their names, and checks the dates to decide if they are day first or month first. You can change any of those choices in the side panel and the table updates at once.</p>
    <H3>CAMT.053 and MT940</H3>
    <p>If you bank in Europe, you may see CAMT.053, which is part of the ISO 20022 standard. It is XML with a lot of detail: who paid, their IBAN, the remittance text, booking and value dates. MT940 is the older SWIFT message with lines that start with codes like :61: for a transaction and :86: for its description. Both are great for accounting, and both are hard to read in a spreadsheet without converting first.</p>
    <H2>Try it: paste a bank file</H2>
    <p>The box below runs the same parser the tools use. Pick a sample, then edit the text and watch the table change. Change a minus sign, break a date, or delete a closing tag.</p>
    <BankFormatDemo />
    <H2>Which one should I download</H2>
    <ul>
      <li><strong>For a money or budgeting app:</strong> OFX if your bank offers it. The ids prevent duplicates. QIF is the fallback.</li>
      <li><strong>For a spreadsheet:</strong> CSV, or any format converted to Excel with the converter. Excel output keeps amounts as real numbers, so sums work straight away.</li>
      <li><strong>For your accountant:</strong> ask them. Many prefer CAMT.053 or MT940 in Europe, and OFX or CSV elsewhere.</li>
      <li><strong>Only a PDF available:</strong> use <T to="pdf-statement-to-csv">PDF Statement to CSV</T>. It rebuilds lines from the positions of the text on each page, keeps the lines that start with a date and hold an amount, and works out money in or out from the running balance.</li>
    </ul>
    <Tip>If your app only accepts OFX but your bank only gives CSV, <T to="csv-to-ofx">CSV to OFX</T> writes a proper OFX 2.2 file. Each row gets a stable id made from its date, amount and text, so re-importing the same month does not double anything.</Tip>
    <H2>What to do once it is converted</H2>
    <p>Converting is usually the first step, not the goal. Two tools help with the next one. <T to="statement-analyzer">Statement Analyzer</T> shows money in and out by month, your top payees, and a list of payments that repeat at the same amount, which is a quick way to find a forgotten subscription. <T to="transaction-categorizer">AI Transaction Categorizer</T> labels each row as groceries, transport, bills and so on. It tries simple keyword rules first, and for names it has never seen it can run a small sentence model (MiniLM, about 25 MB) in a background worker. On a laptop without a GPU it starts in rules only mode, so nothing heavy loads unless you ask for it.</p>
    <Warn title="Check the totals">Whatever tool you use, compare the total in and total out against the statement itself before you file anything. A wrong date order or a flipped sign is easy to miss in a long list.</Warn>
    <H2>Why I keep this on my own device</H2>
    <p>A statement shows where you live, where you shop, what you earn and who you send money to. Many online converters ask you to upload exactly that. Every finance tool in OpenFile reads the file inside your browser tab. You can open the page, switch off Wi-Fi, and convert a year of statements. Nothing is stored after you close the tab.</p>
    <Note title="Limits">Bank exports are not always standard. If a file does not open, the CSV route almost always works, because you can point the tool at the right columns yourself. Encrypted PDF statements need their password first, which you can remove with Unlock PDF.</Note>
  </>
}
