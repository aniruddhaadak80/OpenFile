import { H2, H3, Note, Tip, T } from '../prose'
import { MidiNotesDemo } from '../demos-more'

export default function Midi() {
  return <>
    <p>MIDI files confuse people because they are music files that contain no sound. A three minute song in MIDI can be 20 KB, smaller than a single photo, and it sounds completely different depending on what plays it. Once you see what is inside, that makes perfect sense. This post explains MIDI in plain words, with a small piano roll you can play, and shows how to turn a MIDI file into a normal audio file.</p>
    <H2>Sheet music for machines</H2>
    <p>MIDI, the Musical Instrument Digital Interface, was agreed by instrument makers in 1983 so that keyboards, drum machines and computers from different brands could talk to each other. It does not carry audio. It carries instructions: start playing this note now, this hard; stop playing it now; switch to a different instrument; move this knob.</p>
    <p>A <strong>.mid</strong> file, a Standard MIDI File, is a recording of those instructions with timing attached. Think of it as sheet music that a computer can read exactly. Whatever reads it, a synthesizer, a phone, a browser, decides what each note actually sounds like.</p>
    <H2>Play with it</H2>
    <p>Here is the opening of a well known melody stored the MIDI way: a list of note numbers, start times and lengths. Press Play, then change the tempo, transpose it, or switch the sound. Notice that none of those changes touch the notes themselves, only how they are performed.</p>
    <MidiNotesDemo />
    <H2>What is inside a note</H2>
    <H3>Note numbers</H3>
    <p>Every key gets a number from 0 to 127. Middle C is 60. Each step up is one semitone, so 72 is the C one octave higher. The A above middle C, the note orchestras tune to at 440 Hz, is 69. Transposing a song is literally adding the same number to every note, which is what the slider in the demo does.</p>
    <H3>Velocity</H3>
    <p>Each note also has a velocity from 1 to 127, how hard the key was hit. A good synthesizer plays a soft note quieter and often with a different tone.</p>
    <H3>Timing</H3>
    <p>Times are stored in ticks, and the file says how many ticks make one beat. A separate tempo setting says how long a beat lasts. Because of this split, changing the tempo of a MIDI file is clean and instant, no time stretching artifacts, unlike speeding up an MP3.</p>
    <H3>Channels, tracks and instruments</H3>
    <p>A file can contain several tracks, usually one per instrument. Each note travels on one of 16 channels, and a program change message picks an instrument for that channel. The General MIDI standard fixes a list of 128 instruments, so program 1 is always an acoustic grand piano and 41 is always a violin, and it reserves channel 10 for drums, where each note number is a different drum rather than a pitch.</p>
    <H2>Why the same file sounds different everywhere</H2>
    <p>Since the file only says play a violin, the quality depends on the violin sound available. A professional sample library makes it sound like a real orchestra. A basic phone synth makes it sound like a 1990s video game. Neither is wrong. They are reading the same sheet music.</p>
    <H2>Playing and converting in OpenFile</H2>
    <p><T to="midi-player">MIDI Player and Converter</T> opens .mid, .midi and .kar karaoke files. It reads them with the open source @tonejs/midi library and plays them through a small built-in synthesizer on the Web Audio API.</p>
    <ul>
      <li>The piano roll shows every note as a bar, with a playhead that follows the music.</li>
      <li>The track list shows each instrument and its note count. Mute tracks to hear one part on its own, which is great for learning the bass line or a piano part.</li>
      <li>Speed and volume controls apply as you listen.</li>
      <li>Render to WAV, MP3 or OGG to get a normal audio file you can send to anyone.</li>
    </ul>
    <p>Rendering uses an offline audio context: the browser computes the audio as fast as it can instead of in real time, so a four minute song usually exports in a few seconds.</p>
    <Note title="Honest about the sound">The built-in synthesizer is small on purpose. It shapes simple waveforms per instrument family (piano, strings, brass and so on) and has its own drum sounds, so the whole thing loads instantly and works offline. It sounds clear and musical, but it is not a sampled concert grand. If you need realistic instruments, open the MIDI file in a music program with a good sound library.</Note>
    <H2>Things people do with MIDI files</H2>
    <ul>
      <li><strong>Practise.</strong> Mute the part you play and play along with the rest at a slower speed.</li>
      <li><strong>Make a backing track.</strong> Render to MP3, then cut it to length in <T to="audio-editor">Audio Editor and Trimmer</T>.</li>
      <li><strong>Make a video.</strong> Render to audio, then use <T to="music-visualizer">Audio to Video Visualizer</T> to add a cover and an animated waveform for a social post.</li>
      <li><strong>Change format for a device.</strong> Some older phones and car stereos want a specific format. Render to WAV, then convert with <T to="audio-converter">Audio Converter</T>.</li>
    </ul>
    <Tip>Old game soundtracks, ringtones and karaoke libraries are full of MIDI files. If a .kar file has lyrics embedded, they are stored as timed text events in the same file, right next to the notes.</Tip>
    <H2>Going the other way</H2>
    <p>People sometimes ask for MP3 to MIDI. That direction is much harder, because the tool has to listen to mixed audio and guess every note, a problem called transcription. It works reasonably for a single clean instrument and poorly for a full band. OpenFile does not do it today, and I would rather say so than ship something that gives disappointing results.</p>
  </>
}
