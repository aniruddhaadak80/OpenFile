# Local AI

OpenFile's AI tools run the model **on your device**. The model downloads once from a public model host, is cached, and from then on your files, prompts and answers never leave your tab. There is no API key, no account and no server doing the work.

{{AI_TOOL_COUNT}} tools use on-device AI or OCR today, with {{AI_MODEL_COUNT}} distinct models found in the source. Both numbers and the tables below are generated from the code.

## Check your device

::component device-check

## Models and sizes

::ai-models

::ai-catalog

## The first run

1. The tool shows which model it will use and roughly how big it is.
2. When you start, the model downloads with a progress bar. This happens once per model.
3. The model is stored in the models cache of the service worker (and the browser's own cache), so the next run starts in seconds and works offline.

Only the model comes down from the internet. Your file is never part of that request.

## WebGPU or CPU

- When your browser supports **WebGPU**, AI tools offer a **Use GPU** switch and turn it on by default. This is usually several times faster.
- Without WebGPU, the model runs on the CPU with WebAssembly. It works the same, just slower.
- Some models use smaller numbers on the CPU (for example 8-bit or 4-bit weights) and different ones on the GPU, so quality and speed are balanced for each.
- If the GPU fails partway, the tool says so. Turn the GPU switch off and run again.

The heavy work runs in a **Web Worker**, a background thread, so the page stays responsive while a model thinks.

## Cancel and memory

- Every long AI job has a **Cancel** button. Cancelling stops the background worker straight away and frees its memory.
- Big models need a lot of memory. If the browser runs out, the tool tells you and suggests closing other tabs or picking the smaller model.
- On phones, prefer the smaller models.

## Privacy

- Inference happens in your tab. Text, images, audio and documents stay on your device.
- Model downloads come from public hosts such as the Hugging Face Hub. Those hosts see a normal download request for the model file, the same for every user, with no file content.
- You can verify it: open the DevTools network tab while a model runs. After the model is cached you will see no requests at all. See [Privacy and security](/docs/privacy-security#verify-it-yourself).

> [!NOTE]
> Model licenses vary. For example, the translation model's weights are licensed for personal, non-commercial use. The tool shows the note before you download it.

## Other engines that download once

Not everything heavy is AI. OCR uses Tesseract with language data, and video and audio tools use ffmpeg compiled to WebAssembly, which OpenFile serves itself. They follow the same rule: download once, cache, run locally.
