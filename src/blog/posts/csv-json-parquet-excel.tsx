import { H2, H3, Note, Tip, Warn, T, Table } from '../prose'
import { CsvJsonDemo } from '../demos-more'

export default function DataFormats() {
  return <>
    <p>A lot of my week is moving data between shapes. An API returns JSON and a colleague wants it in Excel. A data export comes as Parquet and I just want to look at it. A spreadsheet needs to become a JSON config. Each of these formats makes different promises, and most conversion bugs come from forgetting what a format cannot hold. This post is a field guide to CSV, JSON, Excel and Parquet, and how to convert between them without losing anything important.</p>
    <H2>Four formats, four ideas</H2>
    <Table head={['Format', 'Shape', 'Types', 'Best at']} rows={[
      ['CSV', 'one flat table', 'none, everything is text', 'exchange between any two programs'],
      ['JSON', 'nested objects and lists', 'string, number, true or false, null', 'APIs, configs, anything nested'],
      ['Excel (XLSX)', 'several sheets of cells', 'numbers, dates, text, formulas, formatting', 'people who want to look and edit'],
      ['Parquet', 'one table, stored by column', 'rich: integers, decimals, timestamps, nested', 'large datasets and analytics'],
    ]} />
    <H3>CSV</H3>
    <p>Comma separated values is the oldest and simplest: one line per row, commas between cells. It has no official types. The text 007 and the number 7 look the same to a program reading it unless it guesses. A cell containing a comma or a line break must be wrapped in double quotes, and a quote inside a quoted cell is written twice. Most broken CSV files I see break one of those two rules.</p>
    <H3>JSON</H3>
    <p>JSON can nest: an order can contain a customer, which contains an address, which contains a list of phone numbers. It has real types for numbers, true and false, and null. It has no date type, so dates travel as strings, and no comments.</p>
    <H3>Excel</H3>
    <p>An XLSX file is actually a ZIP of XML files. It holds multiple sheets, formulas, formatting and real dates. A sheet can hold at most 1,048,576 rows, which sounds like a lot until you open a log export.</p>
    <H3>Parquet</H3>
    <p>Parquet stores data by column instead of by row. All the values of one column sit together, which compresses very well (a column of country codes is mostly repeats) and lets analytics tools read only the columns they need. It carries a proper schema with types. It is binary, so you cannot open it in a text editor.</p>
    <H2>Try a conversion</H2>
    <p>Edit the CSV on the left. Notice that the quoted cell with a comma stays in one column, numbers and true or false become real JSON values, and a dotted header like address.zip can become a nested object.</p>
    <CsvJsonDemo />
    <H2>The tools and when I use them</H2>
    <ul>
      <li><T to="data-converter">Data Format Converter</T> converts between JSON, YAML, XML, TOML, INI, CSV, TSV, NDJSON, MessagePack, CBOR and BSON. Paste or open a file, it detects the format, you pick the target. Nested objects become dotted column names for CSV and are rebuilt when you convert back.</li>
      <li><T to="table-converter">CSV and Excel Converter</T> is for tables: CSV, XLSX, JSON, Markdown, TSV, HTML and SQL insert statements, both ways.</li>
      <li><T to="csv-editor">CSV and Spreadsheet Editor</T> opens CSV, TSV, XLSX, XLS and ODS in a fast grid that only draws the rows on screen, so hundreds of thousands of rows stay smooth. Sort, filter, dedupe, find and replace, then save as CSV, XLSX or JSON, or split one big file into a ZIP of smaller ones.</li>
      <li><T to="parquet-viewer">Parquet, Arrow and Avro Viewer</T> opens columnar files (Parquet with Snappy, Gzip, Zstd, Brotli or LZ4 compression, plus Arrow, Feather and Avro), lets you filter them, and exports CSV, JSON, NDJSON or Excel.</li>
      <li><T to="sqlite-viewer">SQLite Browser</T> is the escape hatch. Import a CSV as a table, run real SQL on it, and export the result.</li>
    </ul>
    <H2>Where conversions go wrong</H2>
    <H3>Nested data into a flat table</H3>
    <p>JSON to CSV only works cleanly when every record has the same shape. Nested objects can be flattened into columns like address.city. Lists are harder: a customer with three phone numbers either becomes three columns, one cell with the numbers joined, or three rows. None is wrong, but pick one on purpose.</p>
    <H3>Types guessed from text</H3>
    <p>Going from CSV to anything typed means guessing. Postal codes and phone numbers with leading zeros become numbers and lose the zero. Long ID numbers turn into scientific notation in Excel. Strings like 1-2 or MARCH1 become dates. When I care, I keep those columns as text, or convert through JSON where strings stay strings.</p>
    <Warn title="The Excel date trap">Opening a CSV by double-clicking it in Excel lets Excel guess types for every column, and it may silently change gene names, product codes and IDs into dates. Import through the data tab with column types set, or edit the file in the CSV editor first.</Warn>
    <H3>Text encoding</H3>
    <p>If accented letters or non-Latin scripts turn into garbage, the file and the program disagree about the encoding. UTF-8 is the right choice almost everywhere. Older versions of Excel only recognise UTF-8 in a CSV when the file starts with a byte order mark. If a file looks wrong, <T to="text-encoding-converter">Text Encoding Detector and Converter</T> can tell you what it really is.</p>
    <H3>Size</H3>
    <p>A 2 GB CSV is not a spreadsheet anymore. Converting it to Parquet usually makes it several times smaller and much faster to query. Going the other way, filter the Parquet file in the viewer first and export only the rows you need.</p>
    <Tip>When I get JSON from an API and only need a few fields, I trim it first with <T to="json-query">JSONPath and JSONata Tester</T>, then convert. Smaller input, cleaner table.</Tip>
    <Note title="Private by default">Exports from work systems are full of customer names, emails and order histories. All of these tools parse files in your browser with open source libraries such as Papa Parse, SheetJS, hyparquet and sql.js, and nothing is uploaded. That is the main reason I stopped using random online converters for this.</Note>
  </>
}
