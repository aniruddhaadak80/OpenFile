import { H2, H3, Note, Tip, T, Table } from '../prose'
import { ZoneDemo } from '../demos-r13'

export default function InsideFitFile() {
  return <>
    <p>If you run, ride or swim with a watch or a bike computer, every workout ends up as a small file with a .fit extension. Most people never see it, because the watch app syncs it away. But that file is yours, and it holds far more than the summary screen shows. I wrote a FIT reader for OpenFile this week, so here is what is inside one, how to turn it into a spreadsheet or GPX, and how to read heart rate zones from it without signing up for anything.</p>
    <H2>What a FIT file is</H2>
    <p>FIT means Flexible and Interoperable Data Transfer. Garmin created it, and today Wahoo, Coros, Suunto, Hammerhead, Zwift and many others use it too. It is a binary format, so you cannot open it in a text editor, and it is built to be small: an hour of riding with GPS, heart rate, cadence and power is often only a few hundred kilobytes.</p>
    <p>The file starts with a 12 or 14 byte header and the letters .FIT. After that come <strong>messages</strong>. There are two kinds. A definition message says "messages of local type 1 will have these fields, in this order, with these sizes". Data messages then carry only the values, with no names, which is why the format is so compact.</p>
    <H3>The messages that matter</H3>
    <Table head={['Message', 'What it holds']} rows={[
      ['file_id', 'Who made the file: maker, product, when it was created'],
      ['record', 'One sample, usually every second: time, position, altitude, heart rate, cadence, speed, power, temperature'],
      ['lap', 'Each lap or auto lap: start, time, distance, average and max heart rate'],
      ['session', 'The whole activity: sport, total time, distance, calories, climb'],
      ['event, device_info, hrv', 'Start and stop, sensor details, beat to beat intervals'],
    ]} />
    <H3>Odd units</H3>
    <p>Some values are stored in unusual ways to save space. Positions are in <strong>semicircles</strong>: a 32 bit number where 2 to the power of 31 means 180 degrees. Altitude is stored times 5 plus 500, so it never goes negative. Speed is millimetres per second. Time counts seconds since the last day of 1989, not since 1970 like most computers. Some devices also use a compressed timestamp that keeps only the last 5 bits of the time in the record header. A reader has to handle all of this, or your run ends up in the ocean in the year 2009.</p>
    <H2>Converting a FIT file</H2>
    <p><T to="fit-file-converter">FIT File Converter and Viewer</T> reads the file in your browser and shows the sport, distance, time, pace, heart rate, climb and power, the shape of the route, and charts for heart rate, elevation, speed and power. Then you can download:</p>
    <ul>
      <li><strong>CSV</strong>: one row per sample with clear column names, ready for a spreadsheet or a notebook.</li>
      <li><strong>GPX</strong>: the route with heart rate and cadence, for mapping apps and sites that do not take FIT.</li>
      <li><strong>Excel</strong>: samples on one sheet and laps on another.</li>
      <li><strong>JSON</strong>: everything, for your own scripts.</li>
    </ul>
    <p>It also opens TCX and GPX files, so you can use the same viewer for exports from other apps.</p>
    <Tip>Where to find the files: on Garmin devices, plug in by USB and look in the Garmin/Activity folder. In most watch apps and web dashboards, the activity menu has Export Original or Export FIT.</Tip>
    <H2>Heart rate zones in plain words</H2>
    <p>Zones are bands of heart rate that match different kinds of effort. The common five zone model is based on your maximum heart rate:</p>
    <ul>
      <li>Zone 1, easy: 50 to 60 percent of max. Warm up and recovery.</li>
      <li>Zone 2, endurance: 60 to 70 percent. Long easy runs and rides. You can talk.</li>
      <li>Zone 3, tempo: 70 to 80 percent. Steady and a bit uncomfortable.</li>
      <li>Zone 4, threshold: 80 to 90 percent. Hard intervals.</li>
      <li>Zone 5, max: above 90 percent. Short, all out efforts.</li>
    </ul>
    <p>Another way, called heart rate reserve or the Karvonen method, uses the gap between your resting and max heart rate. It moves the zones up a little for people with a low resting rate. Play with the sliders below to see both.</p>
    <ZoneDemo />
    <p>The age formula is only a starting point. Real max heart rates vary a lot between people of the same age. If you have seen a higher number on a hard climb or a race finish, use that instead.</p>
    <H2>Time in zone and training load</H2>
    <p><T to="heart-rate-zones">Heart Rate Zones</T> takes a workout file and adds up the seconds you spent in each zone. Pauses longer than 30 seconds count as 30, so a coffee stop does not fill your zone 1. It also works out a training load score called TRIMP, from Eric Banister. Each minute is weighted by how close you were to your max, with a curve that grows quickly at high effort. So 30 minutes of hard intervals can score more than an hour of easy jogging, which matches how tired you feel the next day.</p>
    <Note title="Not medical advice">These numbers are for training. If something feels wrong with your heart, see a doctor, not a chart.</Note>
    <H2>Apple Health and other data</H2>
    <p>If your data lives in the Apple Health app instead, <T to="apple-health-export">Apple Health Export to CSV</T> opens the export.zip from the Health app. That file can be several gigabytes, so the tool reads it in 4 MB pieces and never loads it all at once. You get one CSV per type, for example steps, heart rate, weight and workouts, plus a daily total or average for each.</p>
    <H2>Why read it locally</H2>
    <p>Workout files show where you live, the routes you take, and when you leave home. Uploading them to a random converter is a real privacy risk. OpenFile reads them inside your browser. Nothing is uploaded, and there is no account to make.</p>
  </>
}
