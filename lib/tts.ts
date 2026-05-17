import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Text-to-speech for audio recaps.
//
// Provider: Google Gemini TTS (gemini-2.5-flash-preview-tts) — reuses the
// GEMINI_API_KEY already configured for text recaps. The whole provider lives
// behind synthesizeSpeech() so swapping to ElevenLabs later is a one-file
// change.
// ---------------------------------------------------------------------------

export type Voice = {
  /** Stable id sent from the client + stored in the DB. */
  value: string;
  /** Gemini prebuilt voice name. */
  geminiVoice: string;
  label: string;
  description: string;
};

export const VOICE_OPTIONS: Voice[] = [
  { value: "announcer", geminiVoice: "Charon", label: "Announcer", description: "Deep, broadcast-booth delivery" },
  { value: "energetic", geminiVoice: "Puck", label: "Energetic", description: "Upbeat, lively pace" },
  { value: "confident", geminiVoice: "Kore", label: "Confident", description: "Firm, anchor-desk steady" },
  { value: "smooth", geminiVoice: "Aoede", label: "Smooth", description: "Easy, breezy podcast tone" },
  { value: "hype", geminiVoice: "Fenrir", label: "Hype", description: "Bold, big-game excitement" },
];

export const DEFAULT_VOICE = "announcer";

export function isValidVoice(value: string | undefined): value is string {
  return !!value && VOICE_OPTIONS.some((v) => v.value === value);
}

function geminiVoiceFor(value: string): string {
  return (VOICE_OPTIONS.find((v) => v.value === value) ?? VOICE_OPTIONS[0]).geminiVoice;
}

/**
 * Wrap raw little-endian PCM samples in a 44-byte WAV header so the bytes are
 * playable in an <audio> element and downloadable as a .wav file.
 */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format: 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** Pull the sample rate out of a mime type like "audio/L16;codec=pcm;rate=24000". */
function sampleRateFromMime(mime: string | undefined): number {
  const match = mime?.match(/rate=(\d+)/);
  return match ? Number(match[1]) : 24000;
}

export type SynthesisResult = {
  audio: Buffer;
  mimeType: "audio/wav";
};

/** True for transient Gemini errors (model overloaded) that are worth a retry. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(String(err));
}

export async function synthesizeSpeech(text: string, voice: string): Promise<SynthesisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const params = {
    model: "gemini-2.5-flash-preview-tts",
    contents: text,
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: geminiVoiceFor(voice) },
        },
      },
    },
  };

  // The TTS preview model is frequently "overloaded" — retry transient 503s
  // with a short backoff before giving up.
  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await ai.models.generateContent(params);
      break;
    } catch (err) {
      if (isTransient(err) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) {
    throw new Error("Gemini TTS returned no audio");
  }

  const pcm = Buffer.from(inline.data, "base64");
  const wav = pcmToWav(pcm, sampleRateFromMime(inline.mimeType));
  return { audio: wav, mimeType: "audio/wav" };
}
