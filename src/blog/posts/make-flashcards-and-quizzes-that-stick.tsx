import { H2, H3, Note, Tip, T } from '../prose'
import { FinalExamDemo } from '@/blog/demos-cf'

export default function FlashcardsAndQuizzes() {
  return <>
    <p>Most of us study by rereading. It feels productive because the page looks familiar, but familiar is not the same as remembered. Two habits do much better: testing yourself, and spacing the tests out over days. The new Study &amp; Classroom tools in OpenFile are built around those two habits, plus the printables that teachers and parents make every week. Everything runs in your browser, so notes, cards and class lists stay on your device.</p>
    <H2>Why testing beats rereading</H2>
    <p>When you try to recall an answer, your brain has to rebuild it, and that effort is what makes the memory stronger. Researchers call it the testing effect. Spacing helps for a similar reason: a card you nearly forgot takes more effort to recall than one you saw a minute ago, so it gains more from the review. Put the two together and you get spaced repetition, the method behind apps like Anki.</p>
    <H2>Flashcards with five Leitner boxes</H2>
    <p><T to="flashcard-maker">Flashcard Maker</T> takes a plain list, one card per line with the front and back split by a tab, a comma or a dash, and turns it into a deck. Study mode uses the Leitner system, a paper method from the 1970s that works well on a screen:</p>
    <ul>
      <li>Every card starts in box 1.</li>
      <li>Get it right and it moves up a box. Each box is reviewed less often than the one before.</li>
      <li>Get it wrong and it goes back to box 1, so it comes back soon.</li>
    </ul>
    <p>Hard cards keep showing up and easy cards fade into the background, which is exactly where your time should go. When the deck is ready you can export it for Anki, as CSV, or as printable cards to cut out.</p>
    <H3>From notes to cards in one step</H3>
    <p>Writing cards is the slow part. <T to="notes-to-flashcards">AI Notes to Flashcards</T> reads a chapter or your lecture notes and makes fill in the blank cards. A small AI model runs in a background worker on your device: it picks the sentences that cover your notes best and blanks out a key term in each one. If your device is slow or offline, a quick mode picks sentences by word frequency with no download at all. Edit the cards you keep, delete the rest, and send them to the flashcard tool.</p>
    <Tip>Cards work best when each one asks for a single fact. If a card needs a paragraph to answer, split it into two or three cards.</Tip>
    <H2>Quizzes written in plain text</H2>
    <p><T to="quiz-maker">Quiz Maker</T> lets you write a quiz the way you would type it in a notes app: a question, then the options, with a star on the right answer. It understands one answer and several answer questions, true or false, and typed answers, each with an optional explanation. Try it on the page, then export a self marking HTML quiz to share, or a printable PDF with an answer key for class.</p>
    <H2>Printables that save an evening</H2>
    <p>A lot of classroom prep is making sheets. These tools make real PDFs sized for A4 or US Letter, so they print sharp at home or at school:</p>
    <ul>
      <li><T to="math-worksheet">Math Worksheet Generator</T>: addition, subtraction, times tables and division with an answer key. Division always comes out whole, and you can keep answers positive for younger pupils.</li>
      <li><T to="word-search-maker">Word Search Maker</T> and <T to="crossword-maker">Crossword Maker</T>: type the words, or words and clues, and get a numbered puzzle with an answer page. The crossword tool tries many layouts and keeps the most compact one.</li>
      <li><T to="cornell-notes">Cornell Notes Template</T>: pages with a cue column, a notes area and a summary box, blank or filled in.</li>
    </ul>
    <H2>Grades, GPA and the final exam question</H2>
    <p>The question every student asks before a final is simple: what score do I need? If your grade so far is <em>c</em>, the final counts for <em>w</em> percent and you want <em>t</em>, the answer is (t minus c times (1 minus w)) divided by w. <T to="grade-calculator">Grade &amp; Final Exam Calculator</T> does this for you and also works out a weighted grade from homework, labs and tests. Here is the same formula running live:</p>
    <FinalExamDemo />
    <p><T to="gpa-calculator">GPA Calculator</T> weights each grade by its credits and handles the US 4.0 scale, the Indian 10 point scale, UK classes and percentages, with a cumulative GPA across terms.</p>
    <H2>Citations without the headache</H2>
    <p>Reference lists are fiddly because every style wants a different order, different punctuation and different italics. <T to="citation-generator">Citation Generator</T> makes references in APA, MLA, Chicago, Harvard, IEEE and Vancouver for books, articles, chapters and web pages, plus the in-text citation for each. If you keep references in a manager like Zotero, <T to="bibliography-converter">BibTeX &amp; RIS Converter</T> moves them between BibTeX, RIS and CSL JSON.</p>
    <Note title="Check the style guide">Citation tools follow the common rules for each style, but your teacher or journal may want small changes. Glance at one reference against their guide before you hand in.</Note>
    <H2>Private by design</H2>
    <p>Study notes, class lists and grades are personal. None of these tools has an account or a server. Cards, quizzes and notes are made in your browser and saved there only if you ask, and the PDFs are made on your device.</p>
  </>
}
