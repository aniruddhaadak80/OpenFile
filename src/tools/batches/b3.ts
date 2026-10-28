import type { ToolMeta } from '../registry'

// Batch 3 tools. Keep entries here (not in registry.ts) so parallel builders do not conflict.
// Batch 3: animated images (GIF, APNG, animated WebP) and video.
const FF = 'Video work runs in ffmpeg.wasm, the FFmpeg toolkit compiled to WebAssembly (GPL build, loaded as a separate engine file of about 30 MB the first time, then cached).'
const ANIM = 'Animations are decoded into full frames in your browser (GIF with gifuct-js, APNG with UPNG.js, WebP frames with the browser decoder), edited, then written back out. GIF is encoded with gifenc plus our own frame optimiser; WebP, MP4 and WebM go through ffmpeg.wasm.'
const ANIM_IN = ['GIF', 'APNG', 'WEBP', 'AVIF']
const ANIM_OUT = ['GIF', 'APNG', 'WEBP', 'MP4', 'WEBM']
const VIDEO_IN = ['MP4', 'MOV', 'WEBM', 'MKV', 'AVI']

export const BATCH_3: ToolMeta[] = [
  // ---------- animated images ----------
  {
    slug: 'gif-optimizer', name: 'GIF Compressor', desc: 'Shrink GIFs and animated WebP with lossy compression, fewer colours, frame dropping or a target file size.', category: 'image', icon: 'Minimize2', badge: 'NEW', popular: true,
    tags: ['compress gif', 'optimize gif', 'reduce gif size', 'lossy gif', 'webp compress', 'discord', 'emoji'], inputs: ANIM_IN, outputs: ['GIF', 'WEBP'],
    how: `${ANIM} The optimiser stores only the part of each frame that changed, makes unchanged pixels transparent, merges identical frames, and can reduce colours, size and frame count. Target size mode tries gentle settings first and gets stronger until the file fits.`,
    steps: ['Drop a GIF, APNG or animated WebP.', 'Pick a preset or set colours, lossy level, size and frame dropping. Or switch to Target size and type the largest size you want.', 'Press Compress and download the smaller file.'],
    tips: ['Lossy 30 to 60 usually halves a GIF with little visible change.', 'Animated WebP is often 3 to 5 times smaller than GIF at the same quality.', 'For Discord emoji aim for under 256 KB; for stickers under 512 KB.'],
    faq: [{ q: 'Why is my GIF still big?', a: 'Large size, many frames and film grain are the usual causes. Reduce the size slider and drop every second frame, or save as WebP.' }],
    related: ['gif-editor', 'animated-converter', 'gif-transform', 'video-to-gif'],
  },
  {
    slug: 'gif-editor', name: 'GIF Frame Editor', desc: 'Reorder, delete, duplicate and retime frames, set loop count, add frames, then save as GIF, APNG, WebP or video.', category: 'image', icon: 'GalleryHorizontalEnd', badge: 'NEW',
    tags: ['edit gif', 'gif frames', 'frame delay', 'loop count', 'reorder frames', 'apng editor', 'webp editor'], inputs: ANIM_IN, outputs: ANIM_OUT,
    how: ANIM,
    steps: ['Drop an animation.', 'Drag frames to reorder, select frames to delete or duplicate, and type a delay under any frame.', 'Set the loop and choose an output format.'],
    tips: ['Shift-click frames to select several.', 'Hold last +1s is handy for a pause before the loop restarts.', 'Undo keeps your last 30 changes.'],
    related: ['gif-speed-reverse', 'gif-splitter', 'gif-optimizer', 'gif-maker'],
  },
  {
    slug: 'animated-converter', name: 'Animated Image Converter', desc: 'Convert between GIF, APNG, animated WebP and AVIF, and turn video clips into GIF, APNG or WebP.', category: 'image', icon: 'ArrowRightLeft', badge: 'NEW', popular: true,
    tags: ['gif to webp', 'webp to gif', 'apng to gif', 'gif to apng', 'gif to mp4', 'mp4 to webp', 'avif to gif', 'webm to gif', 'mov to gif'], inputs: [...ANIM_IN, ...VIDEO_IN], outputs: ANIM_OUT,
    how: `${ANIM} Video clips are read with ffmpeg.wasm at the frame rate and size you pick. Animated AVIF is read with the browser's own decoder, which Chrome and Edge include.`,
    tips: ['WebP keeps transparency and is much smaller than GIF.', 'MP4 is the smallest for sharing on social apps, but has no transparency.', 'Use Max width to shrink big clips before converting.'],
    faq: [{ q: 'Can it write animated AVIF or JPEG XL?', a: 'Not yet. The browser video engine has no AV1 encoder, and animated JPEG XL needs a larger encoder. WebP gives similar savings and works everywhere.' }],
    related: ['gif-optimizer', 'video-to-gif', 'webp-maker', 'apng-maker'],
  },
  {
    slug: 'gif-transform', name: 'Resize, Crop & Rotate GIF', desc: 'Resize, crop, rotate, flip or change the canvas and aspect ratio of GIF, APNG and WebP animations.', category: 'image', icon: 'Crop', badge: 'NEW',
    tags: ['resize gif', 'crop gif', 'rotate gif', 'flip gif', 'gif aspect ratio', 'square gif'], inputs: ANIM_IN, outputs: ANIM_OUT,
    how: `${ANIM} Resizing uses area averaging with premultiplied alpha, so edges stay clean.`,
    related: ['gif-optimizer', 'gif-editor', 'image-resizer'],
  },
  {
    slug: 'gif-speed-reverse', name: 'GIF Speed, Reverse & Cut', desc: 'Speed up or slow down an animation, play it backwards or as a boomerang, and cut a frame range.', category: 'image', icon: 'Gauge', badge: 'NEW',
    tags: ['gif speed', 'reverse gif', 'boomerang gif', 'cut gif', 'trim gif', 'slow gif'], inputs: ANIM_IN, outputs: ANIM_OUT,
    how: `${ANIM} Viewers cannot show frames shorter than 20 ms, so very fast speeds merge frames instead of producing a GIF that plays slower than expected.`,
    related: ['gif-editor', 'video-reverse', 'video-speed'],
  },
  {
    slug: 'gif-overlay', name: 'Add Text & Images to GIF', desc: 'Animated captions, a white caption bar, logos and stickers on chosen frames, and freehand drawing on GIFs.', category: 'image', icon: 'Type', badge: 'NEW',
    tags: ['caption gif', 'text on gif', 'meme gif', 'watermark gif', 'sticker gif', 'draw on gif'], inputs: ANIM_IN, outputs: ANIM_OUT,
    how: `${ANIM} Text and images are drawn on each frame with Canvas 2D, using any of the listed fonts.`,
    tips: ['Use From and To frame to show text only during part of the loop.', 'The caption bar adds white space above or below the picture, like reaction GIFs.'],
    related: ['meme-generator', 'gif-effects', 'add-text-to-video'],
  },
  {
    slug: 'gif-effects', name: 'GIF Effects & Filters', desc: 'Colour filters, rounded corners, censor areas, pixel art, halftone, transparency and AI background removal for animations.', category: 'image', icon: 'Wand2', badge: 'NEW',
    tags: ['gif filter', 'gif grayscale', 'transparent gif', 'gif background', 'pixelate gif', 'halftone', 'remove background gif'], inputs: ANIM_IN, outputs: ANIM_OUT,
    how: `${ANIM} Colour and shape effects run on the raw pixels; AI background removal uses the IMG.LY on-device segmentation model (about 40 MB, downloaded on first use).`,
    related: ['gif-overlay', 'gif-transform', 'background-remover'],
  },
  {
    slug: 'gif-combine', name: 'Combine GIFs', desc: 'Put animations side by side, stacked, in a grid, or one after another, with shared timing.', category: 'image', icon: 'LayoutPanelLeft', badge: 'NEW',
    tags: ['merge gif', 'join gif', 'gif side by side', 'gif grid', 'concatenate gif'], inputs: ANIM_IN, outputs: ANIM_OUT,
    how: `${ANIM} When animations have different lengths, the shorter ones loop until the longest one finishes (or everything stops with the shortest).`,
    related: ['gif-editor', 'split-screen-video', 'collage-maker'],
  },
  {
    slug: 'gif-splitter', name: 'GIF to Frames', desc: 'Split a GIF, APNG, WebP or short clip into PNG, JPG or WebP frames and download them as a ZIP.', category: 'image', icon: 'Scissors', badge: 'NEW',
    tags: ['split gif', 'extract frames', 'gif to png', 'gif to jpg', 'frames zip'], inputs: [...ANIM_IN, ...VIDEO_IN], outputs: ['PNG', 'JPG', 'WEBP', 'ZIP'],
    how: `${ANIM} Each exported frame is the complete picture as it appears at that moment.`,
    related: ['video-frames', 'gif-editor', 'sprite-sheet'],
  },
  {
    slug: 'static-to-gif', name: 'Animate a Still Image', desc: 'Make a still image shake, pulse, zoom, spin, glitch or wobble, or fade between several images.', category: 'image', icon: 'Sparkles', badge: 'NEW',
    tags: ['animate image', 'shake gif', 'pulse', 'glitch gif', 'spin gif', 'slideshow gif', 'emoji'], inputs: ['JPG', 'PNG', 'WEBP'], outputs: ['GIF', 'WEBP', 'APNG', 'MP4'],
    how: 'Frames are drawn with Canvas 2D from your image using the chosen motion, then saved as GIF (gifenc) or WebP and MP4 (ffmpeg.wasm).',
    related: ['gif-maker', 'gif-effects', 'images-to-video'],
  },
  {
    slug: 'gif-analyzer', name: 'GIF Inspector', desc: 'See frames, delays, disposal, palette, loop count and the block structure of GIF, APNG and WebP files.', category: 'image', icon: 'ScanSearch', badge: 'NEW',
    tags: ['gif info', 'gif frames count', 'gif delay', 'gif palette', 'debug gif', 'webp info'], inputs: ANIM_IN, outputs: ['TXT'],
    how: 'The file is walked byte by byte to list every block (graphic control, image, application, comment) with its offset, so damaged or unusual files can be understood. WebP files are read chunk by chunk.',
    related: ['gif-repair', 'media-info', 'gif-optimizer'],
  },
  {
    slug: 'gif-repair', name: 'Repair GIF', desc: 'Recover cut-off or damaged GIFs by keeping every frame that can still be read and writing a clean file.', category: 'image', icon: 'Wrench', badge: 'NEW',
    tags: ['fix gif', 'broken gif', 'corrupted gif', 'truncated gif', 'gif not playing'], inputs: ['GIF'], outputs: ['GIF', 'WEBP', 'APNG', 'MP4'],
    how: 'The structure is checked block by block. Missing end markers are added, a cut-off last frame is closed so its top part survives, and the frames are re-encoded into a fresh file.',
    related: ['gif-analyzer', 'video-repair', 'repair-pdf'],
  },
  {
    slug: 'sprite-sheet', name: 'Sprite Sheet Maker & Cutter', desc: 'Turn a GIF, clip or images into a sprite sheet with CSS and JSON, or cut a sheet back into frames or a GIF.', category: 'image', icon: 'LayoutGrid', badge: 'NEW',
    tags: ['sprite sheet', 'texture atlas', 'css sprite', 'phaser', 'pixi', 'game dev', 'gif to sprite sheet'], inputs: [...ANIM_IN, 'PNG', 'JPG', ...VIDEO_IN], outputs: ['PNG', 'CSS', 'JSON', 'GIF', 'APNG', 'WEBP'],
    how: 'Frames are laid out on a grid with Canvas 2D. The CSS uses a steps() animation and the JSON follows the common TexturePacker hash format that Phaser, PixiJS and many engines read.',
    related: ['gif-splitter', 'aseprite-converter', 'gif-to-bitmap'],
  },
  {
    slug: 'gif-to-bitmap', name: 'GIF to C Array (Arduino / OLED)', desc: 'Convert a GIF or image into monochrome byte arrays for SSD1306 OLEDs with Adafruit GFX or U8g2.', category: 'image', icon: 'Cpu', badge: 'NEW',
    tags: ['arduino', 'oled', 'ssd1306', 'u8g2', 'adafruit gfx', 'esp32', 'bitmap c array', 'xbm'], inputs: [...ANIM_IN, 'PNG', 'JPG'], outputs: ['C', 'H'],
    how: 'Each frame is fitted to the display size, turned into 1-bit pixels with a threshold or ordered dither, and packed in the byte order your display library expects.',
    tips: ['128×64 SSD1306 frames are 1 KB each; an Uno has room for about 25.', 'Use the U8g2 layout with drawXBM and the Adafruit layout with drawBitmap.'],
    related: ['sprite-sheet', 'image-to-base64', 'gif-transform'],
  },
  {
    slug: 'webp-maker', name: 'Animated WebP Maker', desc: 'Build an animated WebP from images or a video clip, with transparency, timing and loop control.', category: 'image', icon: 'Images', badge: 'NEW',
    tags: ['animated webp', 'make webp', 'images to webp', 'mp4 to webp', 'webp sticker'], inputs: ['JPG', 'PNG', 'WEBP', ...VIDEO_IN], outputs: ['WEBP'],
    how: `Frames are prepared in your browser and encoded with libwebp inside ffmpeg.wasm. ${FF}`,
    related: ['apng-maker', 'gif-maker', 'animated-converter'],
  },
  {
    slug: 'apng-maker', name: 'APNG Maker', desc: 'Build an animated PNG from images or a clip, with full transparency and per-frame timing.', category: 'image', icon: 'Film', badge: 'NEW',
    tags: ['apng', 'animated png', 'images to apng', 'transparent animation'], inputs: ['JPG', 'PNG', 'WEBP', ...VIDEO_IN], outputs: ['APNG'],
    how: 'Frames are prepared in your browser and encoded with UPNG.js, which also optimises each frame so only changed areas are stored.',
    related: ['webp-maker', 'gif-maker', 'animated-converter'],
  },
  {
    slug: 'jxl-maker', name: 'JPEG XL Converter', desc: 'Convert images to JPEG XL with lossy or lossless encoding, effort and progressive options.', category: 'image', icon: 'FileImage', badge: 'NEW',
    tags: ['jxl', 'jpeg xl', 'png to jxl', 'jpg to jxl', 'next gen image'], inputs: ['JPG', 'PNG', 'WEBP', 'AVIF', 'GIF'], outputs: ['JXL'],
    how: 'Images are encoded with libjxl compiled to WebAssembly (@jsquash/jxl, Apache-2.0). Animated JPEG XL is not supported yet.',
    related: ['image-converter', 'image-compressor', 'animated-converter'],
  },
  {
    slug: 'lottie-converter', name: 'Lottie & TGS Converter', desc: 'Preview Lottie JSON, .lottie and Telegram .tgs stickers and render them to GIF, APNG, WebP, MP4 or WebM.', category: 'image', icon: 'Clapperboard', badge: 'NEW',
    tags: ['lottie to gif', 'tgs to gif', 'telegram sticker', 'dotlottie', 'lottie to mp4', 'bodymovin'], inputs: ['JSON', 'LOTTIE', 'TGS'], outputs: ANIM_OUT,
    how: 'The animation is played with lottie-web (MIT) on a canvas, frame by frame at the size and frame rate you choose. TGS files are unzipped with fflate first, and .lottie archives have their images inlined.',
    related: ['animated-converter', 'gif-optimizer', 'webp-maker'],
  },
  {
    slug: 'aseprite-converter', name: 'Aseprite Converter', desc: 'Open .aseprite and .ase files and export GIF, APNG, WebP, MP4 or a sprite sheet, by tag and with crisp scaling.', category: 'image', icon: 'Layers', badge: 'NEW',
    tags: ['aseprite', 'ase', 'pixel art', 'aseprite to gif', 'sprite sheet', 'game dev'], inputs: ['ASEPRITE', 'ASE'], outputs: ['GIF', 'APNG', 'WEBP', 'MP4', 'PNG', 'JSON'],
    how: 'The Aseprite file is read directly in the browser: layers, linked and compressed cels, palettes and tags are merged the way Aseprite shows them. Non-normal blend modes are drawn as normal.',
    related: ['sprite-sheet', 'gif-transform', 'gif-to-bitmap'],
  },
  {
    slug: 'motion-photo-extractor', name: 'Motion Photo & Live Photo Extractor', desc: 'Pull the video out of Google and Samsung motion photos and Apple Live Photo bundles, as MP4, GIF or a still.', category: 'image', icon: 'Aperture', badge: 'NEW',
    tags: ['motion photo', 'live photo', 'mvimg', 'pixel motion', 'samsung motion', 'livp', 'photo to video'], inputs: ['JPG', 'HEIC', 'LIVP'], outputs: ['MP4', 'MOV', 'GIF', 'JPG'],
    how: 'Motion photos store a short MP4 after the picture inside one file. The tool finds it from the XMP offset or the MP4 header and splits the two; .livp bundles are unzipped. Converting to MP4 or GIF uses ffmpeg.wasm.',
    related: ['video-to-gif', 'heic-converter', 'animated-converter'],
  },
  {
    slug: 'legacy-anim-converter', name: 'Retro Animation Converter', desc: 'Convert FLI/FLC, Amiga ANIM and IFF, Deluxe Paint ANM, CDXL, MNG and Smush animations to GIF, APNG, WebP or MP4.', category: 'image', icon: 'Joystick', badge: 'NEW',
    tags: ['fli', 'flc', 'amiga anim', 'iff', 'cdxl', 'mng', 'deluxe paint', 'retro'], inputs: ['FLI', 'FLC', 'ANIM', 'IFF', 'ANM', 'CDXL', 'MNG'], outputs: ['GIF', 'APNG', 'WEBP', 'MP4'],
    how: `Retro formats are decoded with the FLIC, IFF, ANM and CDXL decoders inside ffmpeg.wasm; MNG uses ImageMagick compiled to WebAssembly (about 15 MB on first use). ${FF}`,
    faq: [{ q: 'What about BPG and FLIF?', a: 'Those need decoders that are not available for the browser yet.' }],
    related: ['animated-converter', 'gif-optimizer', 'video-converter'],
  },

  // ---------- video ----------
  {
    slug: 'video-crop', name: 'Crop Video', desc: 'Crop a video visually with aspect presets for Reels, Shorts and TikTok (9:16), square (1:1) and portrait (4:5).', category: 'video', icon: 'Crop', badge: 'NEW', popular: true,
    tags: ['crop video', 'video aspect ratio', '9:16', 'vertical video', 'square video', 'tiktok crop'], inputs: VIDEO_IN, outputs: ['MP4'],
    how: `Draw the area on the playing video, then it is cropped and re-encoded as H.264 MP4. Audio is copied untouched. ${FF}`,
    related: ['video-resize', 'video-rotate', 'video-trimmer'],
  },
  {
    slug: 'video-rotate', name: 'Rotate & Flip Video', desc: 'Rotate a video 90, 180 or 270 degrees or mirror it, with an instant no-quality-loss option for MP4 and MOV.', category: 'video', icon: 'RotateCw', badge: 'NEW',
    tags: ['rotate video', 'flip video', 'mirror video', 'sideways video', 'upside down video'], inputs: VIDEO_IN, outputs: ['MP4', 'MOV'],
    how: `Lossless mode only changes the rotation flag in the file. Otherwise the picture is turned and re-encoded. ${FF}`,
    related: ['video-crop', 'video-resize', 'image-rotate-flip'],
  },
  {
    slug: 'video-reverse', name: 'Reverse Video', desc: 'Play a video backwards with reversed sound, or make a forward-and-back boomerang loop.', category: 'video', icon: 'Undo2', badge: 'NEW',
    tags: ['reverse video', 'backwards video', 'boomerang', 'rewind'], inputs: VIDEO_IN, outputs: ['MP4'], how: FF,
    related: ['video-loop', 'gif-speed-reverse', 'video-speed'],
  },
  {
    slug: 'video-resize', name: 'Resize Video', desc: 'Change resolution or aspect ratio with platform presets, filling the space with a blurred copy or a colour.', category: 'video', icon: 'Scaling', badge: 'NEW',
    tags: ['resize video', 'video resolution', 'aspect ratio', 'instagram size', 'youtube size', 'blur background video', 'letterbox'], inputs: VIDEO_IN, outputs: ['MP4'], how: FF,
    related: ['video-crop', 'video-compressor', 'video-overlay'],
  },
  {
    slug: 'video-loop', name: 'Loop Video', desc: 'Repeat a clip a number of times or up to an exact length. Repeating is lossless and fast.', category: 'video', icon: 'Repeat', badge: 'NEW',
    tags: ['loop video', 'repeat video', 'extend video', 'video 10 hours'], inputs: VIDEO_IN, outputs: ['MP4', 'MOV', 'MKV', 'WEBM'], how: FF,
    related: ['video-reverse', 'merge-videos', 'freeze-frame'],
  },
  {
    slug: 'video-watermark', name: 'Watermark Video', desc: 'Add a text or logo watermark to a video with position, size and opacity controls.', category: 'video', icon: 'Droplets', badge: 'NEW',
    tags: ['watermark video', 'logo on video', 'copyright video', 'brand video'], inputs: VIDEO_IN, outputs: ['MP4'],
    how: `Text is rendered by your browser (any font, any language) into a transparent picture and laid over the video. ${FF}`,
    related: ['add-text-to-video', 'video-overlay', 'image-watermark'],
  },
  {
    slug: 'add-text-to-video', name: 'Add Text & Stickers to Video', desc: 'Timed text, emoji stickers, freehand drawing and a progress bar on any video.', category: 'video', icon: 'MessageSquareText', badge: 'NEW',
    tags: ['text on video', 'caption video', 'emoji on video', 'draw on video', 'progress bar video', 'title'], inputs: VIDEO_IN, outputs: ['MP4'],
    how: `Each text and sticker is rendered by the browser into a transparent picture and shown during its time range with the overlay filter. ${FF}`,
    related: ['burn-subtitles', 'video-watermark', 'gif-overlay'],
  },
  {
    slug: 'add-audio-to-video', name: 'Add Audio to Video', desc: 'Add music, replace the soundtrack, mix it with the original or add a second track, with a sync offset.', category: 'video', icon: 'Music', badge: 'NEW', popular: true,
    tags: ['add music to video', 'replace audio', 'background music', 'voice over', 'sync audio', 'audio offset'], inputs: [...VIDEO_IN, 'MP3', 'WAV', 'M4A'], outputs: ['MP4'],
    how: `The video stream is copied without re-encoding; only the audio is processed. ${FF}`,
    related: ['mute-video', 'extract-audio', 'audio-merger'],
  },
  {
    slug: 'video-overlay', name: 'Picture in Picture & Background', desc: 'Overlay a second video or image, place a video on a coloured or image background, or add a slow zoom.', category: 'video', icon: 'PictureInPicture2', badge: 'NEW',
    tags: ['picture in picture', 'pip', 'reaction video', 'video background', 'video on background', 'zoom video', 'ken burns'], inputs: [...VIDEO_IN, 'JPG', 'PNG'], outputs: ['MP4'], how: FF,
    related: ['split-screen-video', 'video-resize', 'video-watermark'],
  },
  {
    slug: 'split-screen-video', name: 'Split Screen Video', desc: 'Show 2 to 4 videos side by side, stacked or in a grid, with gap colour and sound choice.', category: 'video', icon: 'Columns2', badge: 'NEW',
    tags: ['split screen', 'side by side video', 'video collage', 'compare videos', 'duet', 'reaction'], inputs: VIDEO_IN, outputs: ['MP4'], how: FF,
    related: ['video-overlay', 'merge-videos', 'gif-combine'],
  },
  {
    slug: 'video-filters', name: 'Video Filters & Colour', desc: 'Brightness, contrast, saturation, warmth, sharpen and unblur, blur, vignette, denoise and LUT colour grading.', category: 'video', icon: 'SlidersHorizontal', badge: 'NEW',
    tags: ['video filter', 'color correction', 'color grade', 'lut', 'sharpen video', 'unblur video', 'brighten video'], inputs: [...VIDEO_IN, 'CUBE'], outputs: ['MP4'], how: FF,
    related: ['video-stabilizer', 'image-filters', 'video-upscaler'],
  },
  {
    slug: 'blur-video', name: 'Blur Part of a Video', desc: 'Blur, pixelate or black out faces, plates and screens in fixed areas, for the whole video or a time range.', category: 'video', icon: 'EyeOff', badge: 'NEW',
    tags: ['blur video', 'pixelate video', 'censor video', 'blur face video', 'hide license plate'], inputs: VIDEO_IN, outputs: ['MP4'], how: FF,
    faq: [{ q: 'Can it follow a moving face?', a: 'Not yet. Areas stay where you draw them; cover the path the face takes, or split the clip and blur each part.' }],
    related: ['video-delogo', 'blur-faces', 'video-crop'],
  },
  {
    slug: 'video-stabilizer', name: 'Stabilize Video', desc: 'Reduce camera shake in handheld clips with an optional zoom to hide moving edges.', category: 'video', icon: 'Vibrate', badge: 'NEW',
    tags: ['stabilize video', 'shaky video', 'deshake', 'steady video'], inputs: VIDEO_IN, outputs: ['MP4'],
    how: `Uses the deshake filter, which tracks motion between frames and shifts the picture to cancel it. ${FF}`,
    related: ['video-filters', 'video-crop', 'video-fps'],
  },
  {
    slug: 'video-fps', name: 'Frame Rate, Slow Motion & Time-lapse', desc: 'Change frame rate, interpolate smooth motion, make slow motion, time-lapse or a stop-motion look.', category: 'video', icon: 'Timer', badge: 'NEW',
    tags: ['frame rate', 'fps converter', '60fps', 'slow motion', 'time lapse', 'interpolate', 'stop motion'], inputs: VIDEO_IN, outputs: ['MP4'], how: FF,
    related: ['video-speed', 'freeze-frame', 'video-stabilizer'],
  },
  {
    slug: 'freeze-frame', name: 'Freeze Frame', desc: 'Hold any moment of a video for a few seconds, then let it carry on.', category: 'video', icon: 'Snowflake', badge: 'NEW',
    tags: ['freeze frame', 'pause video', 'hold frame', 'still in video'], inputs: VIDEO_IN, outputs: ['MP4'], how: FF,
    related: ['video-fps', 'video-trimmer', 'video-frames'],
  },
  {
    slug: 'video-delogo', name: 'Remove Logo from Video', desc: 'Fill in a fixed logo, watermark or date stamp from the surrounding pixels.', category: 'video', icon: 'Eraser', badge: 'NEW',
    tags: ['remove watermark', 'remove logo', 'delogo', 'remove date stamp', 'remove timestamp'], inputs: VIDEO_IN, outputs: ['MP4'], how: FF,
    related: ['blur-video', 'video-crop', 'blur-faces'],
  },
  {
    slug: 'burn-subtitles', name: 'Add Subtitles to Video', desc: 'Burn SRT, VTT or ASS subtitles into a video with your style, or add them as a switchable track in MP4 or MKV.', category: 'video', icon: 'Captions', badge: 'NEW',
    tags: ['burn subtitles', 'hardcode subtitles', 'add srt to video', 'open captions', 'soft subtitles', 'ass subtitles'], inputs: [...VIDEO_IN, 'SRT', 'VTT', 'ASS'], outputs: ['MP4', 'MKV'],
    how: `Subtitles are drawn with libass inside ffmpeg.wasm using the bundled Liberation Sans font (SIL Open Font License). Separate tracks are added without re-encoding. ${FF}`,
    related: ['audio-transcriber', 'add-text-to-video', 'video-converter'],
  },
  {
    slug: 'images-to-video', name: 'Images to Video', desc: 'Make a slideshow video from photos with music, crossfades, a slow Ken Burns zoom and per-slide timing.', category: 'video', icon: 'Clapperboard', badge: 'NEW', popular: true,
    tags: ['slideshow maker', 'photos to video', 'images to mp4', 'ken burns', 'photo video with music'], inputs: ['JPG', 'PNG', 'WEBP', 'MP3'], outputs: ['MP4'], how: FF,
    related: ['pdf-to-video', 'gif-maker', 'merge-videos'],
  },
  {
    slug: 'pdf-to-video', name: 'PDF to Video', desc: 'Turn the pages of a PDF or exported slide deck into a timed MP4 slideshow with music and transitions.', category: 'video', icon: 'MonitorPlay', badge: 'NEW',
    tags: ['pdf to video', 'slides to video', 'presentation to video', 'pdf to mp4', 'powerpoint to video'], inputs: ['PDF', 'MP3'], outputs: ['MP4'],
    how: `Pages are rendered with PDF.js, then joined with crossfades. ${FF}`,
    related: ['images-to-video', 'pdf-to-image', 'pdf-to-ppt'],
  },
  {
    slug: 'video-background-remover', name: 'Green Screen Video', desc: 'Remove a green or blue screen and replace it with a colour, image, another video or transparency.', category: 'video', icon: 'Wand2', badge: 'NEW',
    tags: ['green screen', 'chroma key', 'remove video background', 'blue screen', 'transparent video', 'replace background'], inputs: [...VIDEO_IN, 'JPG', 'PNG'], outputs: ['MP4', 'WEBM'],
    how: `Uses the chromakey filter. A preview of one frame updates live while you tune the colour. Transparent output is saved as WebM with alpha. ${FF}`,
    related: ['background-remover', 'video-overlay', 'gif-effects'],
  },
  {
    slug: 'video-repair', name: 'Repair Video', desc: 'Fix videos that will not play or seek by rebuilding the container and index, or re-encoding readable frames.', category: 'video', icon: 'Wrench', badge: 'NEW',
    tags: ['repair video', 'fix mp4', 'corrupted video', 'video not playing', 'moov atom', 'faststart'], inputs: [...VIDEO_IN, 'TS'], outputs: ['MP4', 'MOV', 'MKV', 'WEBM'], how: FF,
    faq: [{ q: 'Can it fix a video cut off when the phone died?', a: 'Only partly. Without the index the file needs the original camera settings to rebuild, which is not possible in the browser.' }],
    related: ['video-converter', 'media-info', 'gif-repair'],
  },
  {
    slug: 'media-info', name: 'Media Info', desc: 'See codecs, bitrate, resolution, frame rate, HDR, channels, chapters and tags of any video or audio file.', category: 'video', icon: 'Info', badge: 'NEW',
    tags: ['mediainfo', 'video info', 'codec', 'bitrate', 'metadata', 'ffprobe', 'hdr'], inputs: [...VIDEO_IN, 'MP3', 'FLAC', 'WAV'], outputs: ['JSON', 'TXT'],
    how: 'Uses MediaInfoLib compiled to WebAssembly (mediainfo.js, BSD-2-Clause). Only the parts of the file it needs are read, so even very large files open quickly.',
    related: ['gif-analyzer', 'video-converter', 'video-repair'],
  },
  {
    slug: 'teleprompter', name: 'Teleprompter', desc: 'Scroll your script over the camera preview while you record, with speed, size and mirror controls.', category: 'video', icon: 'ScrollText', badge: 'NEW',
    tags: ['teleprompter', 'autocue', 'script reader', 'record video script'], inputs: ['TXT'], outputs: ['WEBM', 'MP4'],
    how: 'The camera and microphone are recorded with the MediaRecorder API; the script is shown on screen only and is never part of the recording.',
    related: ['webcam-recorder', 'screen-recorder', 'device-test'],
  },
  {
    slug: 'device-test', name: 'Webcam, Mic & Speaker Test', desc: 'Check your camera, microphone level and left and right speakers before a call or recording.', category: 'video', icon: 'MonitorCheck', badge: 'NEW',
    tags: ['webcam test', 'mic test', 'microphone test', 'speaker test', 'camera test', 'sound check'], inputs: [], outputs: [],
    how: 'Uses getUserMedia for the camera and microphone and the Web Audio API for levels and test tones. Nothing is recorded or sent anywhere.',
    related: ['webcam-recorder', 'voice-recorder', 'teleprompter'],
  },
]
