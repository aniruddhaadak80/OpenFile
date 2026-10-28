import { H2, H3, Note, Tip, T, Table } from '../prose'
import { SubtitleDemo } from '../demos-more'

export default function Subtitles() {
  return <>
    <p>Subtitles look simple: some text that shows up at the right time. Then you try to use a subtitle file from one place in another, and the player ignores it, the letters turn into question marks, or every line arrives two seconds late. This guide covers the three formats you will meet most (SRT, VTT and ASS), the problems that come up again and again, and how to fix each one in a browser tab.</p>
    <H2>The three main formats</H2>
    <H3>SRT</H3>
    <p>SubRip is the most common subtitle format there is. Each cue is a number, a time range, one or more lines of text and a blank line. Times use a comma before the milliseconds, like <code>00:01:02,500</code>. It supports basic italic and bold tags and not much else. Almost every video player and editing app reads it.</p>
    <H3>VTT</H3>
    <p>WebVTT is the web's format, and it is what the HTML video element needs. It looks almost like SRT, with three differences that matter: the file starts with the line <code>WEBVTT</code>, times use a dot instead of a comma, and cue numbers are optional. It adds cue settings for position and alignment, and can be styled with CSS.</p>
    <H3>ASS and SSA</H3>
    <p>Advanced SubStation Alpha is the format for subtitles that need to look a certain way: fonts, colours, outlines, positions, karaoke timing, even moving text. Anime fansubs made it famous. The file has sections for script info, named styles and events, and each dialogue line references a style. Times are in hundredths of a second.</p>
    <Table head={['', 'SRT', 'VTT', 'ASS']} rows={[
      ['Time format', '00:00:01,000', '00:00:01.000', '0:00:01.00'],
      ['Styling', 'italic and bold', 'positions, CSS classes', 'full fonts, colours, positions, effects'],
      ['Works in web video', 'no, convert to VTT', 'yes', 'no, convert or burn in'],
      ['Best for', 'sharing, editing apps', 'websites and web players', 'styled or typeset subtitles'],
    ]} />
    <H2>Convert and shift, live</H2>
    <p>The demo turns SRT into VTT as you type, and can shift every line earlier or later. Paste a few lines from one of your own files to see it work.</p>
    <SubtitleDemo />
    <H2>Problem 1: the player will not load the file</H2>
    <p>Usually a format mismatch. A website needs VTT, a TV may only accept SRT, and a video editor might want either. <T to="subtitle-converter">Subtitle Converter</T> converts between SRT, VTT, ASS, SSA, SBV, SUB, LRC, SAMI, TTML, JSON and CSV, in bulk, keeping timing to the millisecond.</p>
    <p>Converting from ASS to SRT or VTT drops the styling, since those formats cannot express it. The text and timing survive. Converting SRT to ASS gives every line a default style you can then change.</p>
    <H2>Problem 2: strange characters</H2>
    <p>Older subtitle files, especially for languages with accented or non-Latin letters, were often saved in a regional encoding instead of UTF-8. Open one in a modern player and you get symbols instead of letters. The converter detects the encoding automatically and offers a picker for stubborn files. Save the result as UTF-8 and the problem is gone for good.</p>
    <H2>Problem 3: out of sync</H2>
    <p>There are two kinds of sync problems, and they need different fixes. <T to="subtitle-sync">Subtitle Shift and Sync</T> handles both.</p>
    <ul>
      <li><strong>A constant offset.</strong> Every line is early or late by the same amount, often because the video has a different intro. A fixed shift fixes it.</li>
      <li><strong>Drift.</strong> The first lines are right but the error grows through the film. This is almost always a frame rate mismatch, such as subtitles made for a 23.976 fps release used on a 25 fps one. Scaling by the ratio of the frame rates fixes it. If you do not know the rates, the two point method works: give the correct time for one line near the start and one near the end, and every line in between is adjusted along a straight line.</li>
    </ul>
    <Tip>To find the offset, play the video, note the exact time someone starts speaking, and compare it with the time in the subtitle file. That difference is your shift.</Tip>
    <H2>Problem 4: no subtitles at all</H2>
    <p>If the subtitles are inside the video file, as they often are in MKV files, <T to="extract-subtitles">Extract Subtitles</T> pulls the text tracks out as SRT, VTT, ASS and more. Picture-based tracks such as PGS from Blu-ray discs are listed but are images, not text, so they need OCR.</p>
    <p>If there are no subtitles anywhere, make them. <T to="audio-transcriber">Audio Transcriber</T> runs the Whisper speech model on your device and exports SRT directly, with optional word-level timing for short, punchy captions. Then polish the result in <T to="subtitle-editor">Subtitle Editor</T>, which plays the video with the current line on top, lets you set times from the player, and split long lines.</p>
    <H2>Hard subs or soft subs</H2>
    <p>The last choice is how the subtitles travel with the video.</p>
    <ul>
      <li><strong>Soft subtitles</strong> are a separate track the viewer can switch on or off, either a separate file next to the video or a track inside an MP4 or MKV. They stay editable and searchable, and you can include several languages.</li>
      <li><strong>Burned-in subtitles</strong> are drawn into the picture itself. They show up everywhere, including social apps that ignore subtitle tracks, but nobody can turn them off or fix a typo later.</li>
    </ul>
    <p><T to="burn-subtitles">Add Subtitles to Video</T> does both. It burns subtitles in with libass, the same renderer many desktop players use, so ASS styling comes through, or it adds them as a switchable track in MP4 or MKV without re-encoding the video, which is nearly instant.</p>
    <Note title="Translation">To reach more viewers, <T to="subtitle-translator">Subtitle Translator</T> translates SRT, VTT or ASS files into more than 50 languages on your device with the NLLB-200 model, one line at a time, so the timing never changes. The model is a large one-time download, so do it on Wi-Fi.</Note>
    <H2>My usual flow for a talk recording</H2>
    <ol>
      <li>Transcribe with Whisper base, export SRT.</li>
      <li>Fix names and technical terms in the Subtitle Editor.</li>
      <li>Convert to VTT for the website player.</li>
      <li>Burn a copy in for the social media clip.</li>
    </ol>
    <p>All four steps run in the browser, so an unreleased recording stays on my laptop the whole time.</p>
  </>
}
