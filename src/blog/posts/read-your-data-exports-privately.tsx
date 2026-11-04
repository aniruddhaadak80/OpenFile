import { H2, H3, Note, Tip, T } from '../prose'
import { ChatDemo } from '../demos-r15'

export default function ReadYourDataExports() {
  return <>
    <p>Almost every app you use will send you a copy of everything it keeps about you if you ask. Spotify sends every song you played, WhatsApp every message in a chat, Google every place your phone has been, Instagram every follower and every person you follow. The catch is the format: a ZIP of JSON files, CSV sheets and odd HTML pages that no normal app opens. The sites that do open them usually want you to upload the whole thing. These are some of the most private files you own, so I built the <T to="category/exports">Data Exports</T> studio to read them inside the browser tab, with nothing uploaded.</p>
    <H2>How to ask for your data</H2>
    <p>The request is always in the settings, usually under privacy or your information. Some arrive in minutes, some in days:</p>
    <ul>
      <li><strong>WhatsApp</strong>: open a chat, Export chat, Without media. You get a text file straight away.</li>
      <li><strong>Spotify</strong>: Account, Privacy settings. Account data comes in about five days with the last year. Extended streaming history takes up to 30 days and covers your whole account.</li>
      <li><strong>Instagram</strong>: Accounts Center, Download your information. Pick Followers and following and the JSON format.</li>
      <li><strong>Google</strong>: Timeline now lives on your phone, under Location settings. YouTube history comes from Takeout.</li>
      <li><strong>ChatGPT and Claude</strong>: Settings, Data controls or Privacy, Export data.</li>
      <li><strong>Netflix</strong>: your profile's Viewing activity page has a quick download. The full request adds durations and devices.</li>
    </ul>
    <H2>Chats: who talks most, and when</H2>
    <p>A WhatsApp export is plain text: a date, a time, a name, a colon and the message. The tricky parts are the many date styles (day first in India and Europe, month first in the US, 12 or 24 hour clocks, an extra bracket on iPhone) and messages that run over several lines. <T to="whatsapp-chat-analyzer">WhatsApp Chat Analyzer</T> works out the date order from the numbers it sees and joins broken lines back together. Try the same parser on a small chat:</p>
    <ChatDemo />
    <p>The full tool adds busiest hours and days, top words and emoji, who starts conversations, a search box and CSV downloads. For chats with an AI, <T to="ai-chat-export-viewer">ChatGPT and Claude Export Viewer</T> reads conversations.json, lets you search every chat at once and saves them as Markdown. ChatGPT stores each chat as a tree of edits, and the viewer follows the branch you saw last.</p>
    <H2>Listening and watching</H2>
    <p><T to="spotify-history-stats">Spotify History Stats</T> reads both kinds of Spotify file. A play counts after 30 seconds, the same rule Spotify uses, and you can rank by minutes or by plays. The extended file also says why each track ended, which is how the skip rate is found. <T to="youtube-history-stats">YouTube History Stats</T> and <T to="netflix-history-stats">Netflix History Stats</T> do the same for videos and shows, including your biggest binges.</p>
    <H3>Followers without a login</H3>
    <p>Apps that promise to show who unfollowed you usually ask for your password, which can get your account locked. <T to="instagram-followers-checker">Instagram Followers Checker</T> only compares two lists from your own export: the people who follow you and the people you follow. Anyone on the second list but not the first does not follow you back. Nothing signs in anywhere.</p>
    <H2>Places you have been</H2>
    <p>Location history is the most sensitive file of all. It shows where you sleep and where you work. <T to="location-history-converter">Location History Converter</T> reads the new Timeline export from your phone, the older Takeout files and the iPhone format, and turns them into GPX, KML, GeoJSON or CSV. The preview is drawn from your points alone. No map tiles are fetched, because even a map request would tell a server roughly where you were.</p>
    <Tip>Before you share a route made from location history, run it through GPX Privacy Zone to hide the start and end near your home.</Tip>
    <H2>Anything else</H2>
    <p>For services without a tool of their own, <T to="data-export-explorer">Data Export Explorer</T> opens any export ZIP, guesses which service it came from, and finds every list of records in the JSON files: messages, logins, ad interests, searches. Each one shows how many records it holds and the dates it covers, and opens as a table you can save as CSV. It is a quick way to see how much a company really keeps.</p>
    <Note title="Why in the browser">These files are read with JavaScript in the tab you have open. Nothing is sent to a server, and nothing is stored when you close the tab. You can check it yourself: open the network panel in your browser's developer tools while a file loads, and you will see no upload.</Note>
  </>
}
