/* Factory for the Kokoro speech worker (kept next to the worker so the relative URL resolves in Vite). */
export const makeTtsWorker = () => new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
