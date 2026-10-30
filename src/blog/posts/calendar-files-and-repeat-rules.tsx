import { H2, H3, Note, Tip, T } from '../prose'
import { RepeatRuleDemo } from '@/blog/demos-cf'

export default function CalendarFiles() {
  return <>
    <p>Every calendar invite you have ever accepted travelled as a small text file. Google Calendar, Apple Calendar and Outlook all speak the same format, iCalendar, usually saved with the .ics extension. Once you know what is inside, you can make invites, merge calendars and turn a spreadsheet into a schedule without any calendar account at all. The new Calendar &amp; Time tools in OpenFile do this in your browser, with your device clock and time zone.</p>
    <H2>What is inside an .ics file</H2>
    <p>An .ics file is plain text, defined by a standard called RFC 5545. It starts with BEGIN:VCALENDAR and ends with END:VCALENDAR. In between, each event is a VEVENT block with lines like these:</p>
    <ul>
      <li><strong>UID</strong>: a unique id. Calendars use it to know that an updated invite replaces the old one instead of adding a copy.</li>
      <li><strong>DTSTART and DTEND</strong>: when the event starts and ends. A time ending in Z is in UTC, so everyone sees it in their own local time. A date with no time is an all day event.</li>
      <li><strong>SUMMARY, LOCATION and DESCRIPTION</strong>: the title, the place and the notes.</li>
      <li><strong>RRULE</strong>: the repeat rule, if the event repeats.</li>
      <li><strong>VALARM</strong>: a reminder, such as 15 minutes before.</li>
    </ul>
    <p>Lines longer than 75 bytes are folded onto the next line with a leading space, and commas and semicolons in text are escaped with a backslash. Small details, but a file that gets them wrong may import with odd titles or not at all. <T to="ics-creator">Calendar Event Maker (ICS)</T> handles all of this and also gives you Add to Google Calendar and Add to Outlook links for people who would rather click than download.</p>
    <H2>Repeat rules, in plain words</H2>
    <p>The RRULE line packs a lot into a short string. FREQ says how often (daily, weekly, monthly or yearly), INTERVAL says every how many, BYDAY picks weekdays, and COUNT or UNTIL says when to stop. A number in front of a day means which one in the month: 1MO is the first Monday and -1FR is the last Friday. BYSETPOS picks one match from a set, so the first weekday of each month is FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1.</p>
    <p>Pick a rule below, or type your own, to see it in words with the next dates it falls on:</p>
    <RepeatRuleDemo />
    <p><T to="recurring-dates">Recurring Dates &amp; RRULE</T> builds rules like these from simple choices, explains any rule you paste, and lists every date so you can check it before sending an invite.</p>
    <Tip>A rule for the 31st of each month skips months that only have 30 days. If you want the last day of every month, use BYMONTHDAY=-1 instead.</Tip>
    <H2>From a spreadsheet to a calendar</H2>
    <p>School terms, match fixtures, deadlines and class timetables often live in a spreadsheet. <T to="csv-to-ics">Spreadsheet to Calendar</T> reads a CSV or Excel file, matches columns like Date, Start, End, Title and Location by name, and understands many date formats. Rows without a time become all day events. Import the file once and every date is in your calendar.</p>
    <H3>Shift work</H3>
    <p>Rotas usually follow a pattern, such as two days, two nights, four off. <T to="shift-rota-planner">Shift Rota Planner</T> repeats a pattern across a team, staggers the start for each person, shows how many people cover each day, and gives everyone their own calendar file. Pair it with <T to="timesheet-calculator">Timesheet Calculator</T> to add up hours, breaks, overnight shifts and overtime.</p>
    <H2>Merging and cleaning calendars</H2>
    <p>If you export calendars from several places, you often end up with duplicates. <T to="ics-merger">Merge Calendar Files</T> combines them into one file, removes duplicates by UID or by title and time, and can keep only a date range or events with a certain word. Repeating events and time zone definitions are carried over whole, so nothing shifts by an hour.</p>
    <H2>Week numbers and other small questions</H2>
    <p>Many workplaces plan by week number. Under ISO 8601, weeks start on Monday and week 1 is the week with the first Thursday of the year, which is why 1 January can fall in week 52 or 53 of the year before. <T to="week-number">Week Number Calculator</T> answers that in a second, and <T to="age-calculator">Age Calculator</T>, <T to="duration-calculator">Time Duration Calculator</T> and <T to="sunrise-sunset">Sunrise &amp; Sunset Times</T> cover the other questions people search for every day.</p>
    <Note title="Time zones">The tools use your device time zone. Calendar files store times in UTC, so a meeting made in Kolkata shows up at the right local time in London or New York.</Note>
  </>
}
