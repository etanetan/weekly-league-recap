// One-off: pre-generate a short spoken sample for each offered voice so the
// recap form can play instant previews from /public/voice-samples/.
// Re-run after changing VOICE_OPTIONS in lib/tts.ts.
//
//   node scripts/generate-voice-samples.mjs            # all voices
//   node scripts/generate-voice-samples.mjs hype smooth # only these voices
//
// Note: the Gemini TTS free tier allows only 3 requests/minute, so generating
// all five may need two passes a minute apart.
//
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// value -> Gemini prebuilt voice (mirrors VOICE_OPTIONS in lib/tts.ts)
const VOICES = [
  { value: "announcer", geminiVoice: "Charon" },
  { value: "energetic", geminiVoice: "Puck" },
  { value: "confident", geminiVoice: "Kore" },
  { value: "smooth", geminiVoice: "Aoede" },
  { value: "hype", geminiVoice: "Fenrir" },
];

const SAMPLE_TEXT = "What a week we've got for you to recap, folks!";
const OUT_DIR = "public/voice-samples";

function getApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = readFileSync(".env.local", "utf8");
  const match = env.match(/^GEMINI_API_KEY=(.+)$/m);
  if (!match) throw new Error("GEMINI_API_KEY not found in env or .env.local");
  return match[1].trim();
}

function pcmToWav(pcm, sampleRate) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const filter = process.argv.slice(2);
const voices = filter.length > 0 ? VOICES.filter((v) => filter.includes(v.value)) : VOICES;

const ai = new GoogleGenAI({ apiKey: getApiKey() });
mkdirSync(OUT_DIR, { recursive: true });

for (const v of voices) {
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: SAMPLE_TEXT,
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.geminiVoice } } },
    },
  });
  const inline = res.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) throw new Error(`No audio returned for voice ${v.value}`);
  const pcm = Buffer.from(inline.data, "base64");
  const rate = Number(inline.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
  const path = `${OUT_DIR}/${v.value}.wav`;
  writeFileSync(path, pcmToWav(pcm, rate));
  console.log(`wrote ${path}`);
}

console.log("done");
