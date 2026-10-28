import { H2, H3, Tip, Note, T } from '../prose'
import { GifPlannerDemo } from '../demos-more'

export default function GifFromVideo() {
  return <>
    <p>GIF is a format from 1987 that refuses to go away. It has no sound, a limit of 256 colours per frame and compression that was clever for dial-up modems. Yet it still plays inline almost everywhere: chat apps, issue trackers, READMEs, email newsletters. So when I need a short loop of a screen recording or a funny moment from a video, I still make a GIF. Here is how to make a good one that is not 40 MB.</p>
    <H2>Why GIFs get so big</H2>
    <p>A video codec like H.264 stores one full picture now and then and, between them, only the changes, using motion prediction. GIF stores frames much more simply. Each frame is compressed on its own with LZW, the same family of compression as a ZIP file. Areas that do not change between frames can be skipped, but anything that moves is stored again in full.</p>
    <p>So the size of a GIF depends on four things, and you control all of them: the width, the frame rate, the length, and the number of colours. Play with the planner below to get a feel for it.</p>
    <GifPlannerDemo />
    <H2>Step 1: trim the clip first</H2>
    <p>Every second you remove is a second you do not have to encode, so cut before you convert. I open the video in <T to="video-trimmer">Video Trimmer</T>, find the exact moment, and keep only that. Two to six seconds is the sweet spot for a reaction GIF. For a product demo or a bug report, up to fifteen seconds is fine if the frame is small.</p>
    <Tip>If your clip is long, you can also set start and end times directly in <T to="video-to-gif">Video to GIF</T>. Trimming first is still faster, because the GIF tool then only has to decode the part you want.</Tip>
    <H2>Step 2: pick sensible settings</H2>
    <H3>Width</H3>
    <p>This matters most because pixels grow with the square of the width. A 960 pixel GIF has four times the pixels of a 480 pixel one. Video to GIF offers 320, 480, 640 and 800 pixels or the original size. For chat I use 480. For documentation, where text on screen must be readable, 640 or 800.</p>
    <H3>Frame rate</H3>
    <p>Video is usually 24 to 60 frames per second. A GIF rarely needs more than 10 to 15. At 12 frames per second motion still looks smooth, and you store a fifth of the frames a 60 fps screen recording has. GIF timing is stored in hundredths of a second, so rates that divide 100 neatly, such as 10, 20 and 25, play the most evenly. Most browsers also slow down frames shorter than 0.02 seconds, so very high rates are wasted anyway.</p>
    <H3>Colours and dithering</H3>
    <p>Each GIF frame can have at most 256 colours. A good converter does not use a fixed palette: it looks at the whole clip and builds the 256 colours that represent it best. OpenFile does this with ffmpeg's palettegen and paletteuse filters, which is why you see Building palette and encoding GIF while it works.</p>
    <p>Dithering decides how to fake colours that are not in the palette. None gives flat bands, which looks great on screen recordings with solid backgrounds and keeps files small. Pattern gives an ordered, slightly retro texture. Smooth spreads the error around and looks best on real footage like skin and sky, but it adds noise that makes the file bigger.</p>
    <H3>Loop</H3>
    <p>Forever is what people expect. Play once or 3 times is good for a GIF in a presentation, where an endless loop can be distracting.</p>
    <H2>Step 3: make it smaller after the fact</H2>
    <p>If the result is still too large for where it is going (Discord, GitHub and many forums have upload limits), run it through <T to="gif-optimizer">GIF Compressor</T>. It stores only the part of each frame that changed, merges identical frames, can drop every other frame, reduce colours, and has a target size mode that keeps trying settings until the file fits.</p>
    <H2>When a GIF is the wrong choice</H2>
    <p>If the place you are posting accepts video, a short MP4 is usually a tenth of the size of the same GIF, with full colour and smooth motion. Most social apps actually convert uploaded GIFs into videos behind the scenes for exactly this reason.</p>
    <ul>
      <li>For a website you control, an animated WebP or AVIF gives full colour at a fraction of the size. <T to="webp-maker">Animated WebP Maker</T> and <T to="animated-converter">Animated Image Converter</T> make both from the same clip.</li>
      <li>For a lossless loop with true transparency, APNG is the better format. It works in every modern browser.</li>
      <li>For anything with sound, use video. GIF has no audio at all.</li>
    </ul>
    <Note title="Captions and stickers">Want a caption on the loop, like a classic reaction GIF? Make the GIF first, then add text with <T to="gif-overlay">Add Text and Images to GIF</T>. Text added after the palette is built stays sharp instead of getting dithered.</Note>
    <H2>My recipe for a bug report GIF</H2>
    <ol>
      <li>Record the screen with the <T to="screen-recorder">Screen Recorder</T>, only the window that matters.</li>
      <li>Trim to the few seconds that show the bug.</li>
      <li>Video to GIF at 640 pixels, 10 fps, 256 colours, no dithering.</li>
      <li>If it is over 10 MB, GIF Compressor with target size.</li>
    </ol>
    <p>It usually lands between 1 and 4 MB, the text stays readable, and it plays right inside the issue. Everything happens in the browser with ffmpeg compiled to WebAssembly, so the recording never leaves your machine, which matters when the screen shows a client's dashboard.</p>
  </>
}
