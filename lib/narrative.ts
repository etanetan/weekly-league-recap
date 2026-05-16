import { GoogleGenAI } from "@google/genai";
import type { EnrichedWeek } from "./enrich";

export type Tone = "beat-reporter" | "broadcaster" | "hype";

export const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "broadcaster", label: "Broadcaster", description: "Animated TV anchor energy" },
  { value: "beat-reporter", label: "Beat reporter", description: "Schefter-style news flashes" },
  { value: "hype", label: "Hype", description: "Sports Twitter, full volume" },
];

export const DEFAULT_TONE: Tone = "broadcaster";
export const DEFAULT_USE_EMOJIS = true;
export const DEFAULT_TRASH_TALK = false;

const BASE_PROMPT = `You are a fantasy football reporter covering one league — a friends-and-family league. You report each week's developments as a series of standalone tweets.

OUTPUT FORMAT
- 6 to 10 standalone tweets, separated by a single blank line.
- NO numbering, NO "1/" prefixes, NO thread chaining.
- Each tweet stands on its own, under 280 characters.
- Return ONLY the tweets. No preamble, no headings, no closing remarks.

CONTENT — PULL ONLY FROM THE JSON DATA, NEVER INVENT
- Highest team score of the week
- Lowest team score of the week
- Closest matchup, with the margin
- Biggest blowout, with the margin
- Top individual starter — player, points, the roster/manager that started them
- Standout trade(s) — lead with the most impactful one; name the players and picks
- Notable waiver moves — only meaningful FAAB bids or eye-catching adds
- Standings note — top 2-3 teams if records are meaningful

If a category has no data, skip it silently. Do not write filler like "no trades this week."`;

const TONE_BEAT_REPORTER = `TONE — Adam Schefter / ESPN insider
- Lead with the news. Subject first: a team name, a player name, a stat, or a "Sources:" / "Trade:" / "Update:" hook.
- Declarative. Direct. Numbers and names over adjectives.
- Em dashes and colons over commas-and-conjunctions. Short clauses.
- Cadences like "First ___. Then ___. Now ___." are fair game.
- Exclamation points only for genuinely big news. Almost never use them.
- Cut throwaway commentary: "Big swings!", "Talk about a nail-biter!", "Stay tuned!", "What a week!".`;

const TONE_BROADCASTER = `TONE — animated TV broadcaster (think Pat McAfee, Mike Greenberg, an ESPN studio anchor)
- Energetic and personality-forward, but anchored in the facts. Color commentary, not chaos.
- Strong active verbs: "torched", "outlasted", "stunned", "rolled", "flipped the script".
- Short conversational asides are welcome: "Folks,", "Mark it down.", "Look at that line."
- Mix sentence lengths — a punchy lead, then a longer one with the detail.
- One or two well-placed exclamation points across the whole recap, max. Don't end every tweet with one.
- This is animated, not cartoonish. NO "JAW-DROPPING ABSOLUTELY UNBELIEVABLE" energy. NO breathless caps lock.
- Stay rooted in the data. Reactions are fine; invention is not.`;

const TONE_HYPE = `TONE — sports Twitter hype take account
- Maximum enthusiasm. Friendly hyperbole is on the menu.
- ALL CAPS for emphasis when the news genuinely warrants it ("GALACTIC EMPIRE PUTS UP 162").
- Friendly trash talk welcome — this is a family/friends league, not a roast.
- Hyperbolic verbs: "demolished", "obliterated", "cooked", "embarrassed".
- Exclamation points fine, but don't make every tweet end in one.
- Stay rooted in real facts. Do not invent storylines.`;

const EMOJIS_ON = `EMOJIS — ENABLED
- Use one (occasionally two) relevant emoji per tweet, usually at the start as a visual hook.
- Match the news: 🏈 general, 💰 trades / FAAB, 🔥 top performances, 💀 blowouts, 📊 standings, ⚡ waivers, 🚨 breaking.
- Do NOT string emojis together. Do NOT decorate every clause.`;

const EMOJIS_OFF = `EMOJIS — DISABLED
- Do not use any emoji, anywhere in the output.`;

const TRASH_TALK_ON = `TRASH TALK — ENABLED
- Lean into the failures. Bring friendly trash talk for the worst performers of the week.
- Call out the lowest team score by name and rib the manager. Same for the blowout loser.
- Drag any starter who put up an embarrassing number (single digits, or wildly below expectations).
- Take light shots at bad waiver bids, wasted FAAB, or lopsided trades.
- This is a family/friends league — keep it playful, keep it about the football. NO personal attacks. NO insults about anyone's intelligence, character, family, or appearance.
- Every jab must be grounded in a real number or move from the data. Don't invent storylines to roast.
- Don't roast every tweet — keep the news tweets clean and concentrate the trash talk on the low points.`;

const TRASH_TALK_OFF = `TRASH TALK — DISABLED
- Report poor performances factually. Do not roast or rib the managers.`;

function buildSystemPrompt(tone: Tone, useEmojis: boolean, trashTalk: boolean): string {
  const toneSection =
    tone === "beat-reporter" ? TONE_BEAT_REPORTER : tone === "hype" ? TONE_HYPE : TONE_BROADCASTER;
  const emojiSection = useEmojis ? EMOJIS_ON : EMOJIS_OFF;
  const trashTalkSection = trashTalk ? TRASH_TALK_ON : TRASH_TALK_OFF;
  return [BASE_PROMPT, toneSection, emojiSection, trashTalkSection].join("\n\n");
}

export type NarrativeOptions = {
  tone?: Tone;
  useEmojis?: boolean;
  trashTalk?: boolean;
};

export type NarrativeResult = {
  markdown: string;
  modelId: string;
  tone: Tone;
  useEmojis: boolean;
  trashTalk: boolean;
};

export async function generateNarrative(
  data: EnrichedWeek,
  options: NarrativeOptions = {},
): Promise<NarrativeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const tone = options.tone ?? DEFAULT_TONE;
  const useEmojis = options.useEmojis ?? DEFAULT_USE_EMOJIS;
  const trashTalk = options.trashTalk ?? DEFAULT_TRASH_TALK;

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";

  const userMessage = `Here is the enriched data for the recap. Write the tweets.

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\``;

  const response = await ai.models.generateContent({
    model,
    contents: userMessage,
    config: {
      systemInstruction: buildSystemPrompt(tone, useEmojis, trashTalk),
      maxOutputTokens: 4096,
    },
  });

  const text = (response.text ?? "").trim();
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return { markdown: text, modelId: model, tone, useEmojis, trashTalk };
}

// ---------------------------------------------------------------------------
// Audio recap script — a flowing spoken narration (not tweets) sized for a
// ~55-second clip. Fed to the TTS engine in lib/tts.ts.
// ---------------------------------------------------------------------------

const AUDIO_SCRIPT_PROMPT = `You are writing a spoken fantasy football recap for one league — a friends-and-family league. The text you write will be read aloud by a text-to-speech voice, so it must sound natural spoken, NOT read like tweets.

OUTPUT FORMAT
- One short, flowing piece of narration: 80-100 words, and never more than 110. This is a quick audio hit — succinct beats comprehensive.
- It must sound complete: finish every sentence and end on a clean sign-off line. Never trail off mid-thought.
- Plain spoken sentences only. NO tweet formatting, NO numbering, NO bullet points, NO emoji, NO hashtags, NO headings.
- Spell things out for the ear: say "forty-two points", not "42 pts".
- Return ONLY the narration text. No preamble, no stage directions, no quotation marks.

CONTENT — PULL ONLY FROM THE JSON DATA, NEVER INVENT
- Open with a one-line hook, hit the three or four biggest stories of the week, then sign off.
- Prioritize: the highest score, the biggest blowout or the closest game, the top individual starter, and the most impactful trade if there was one.
- Because this is short, do NOT try to cover everything — pick the best stories and tell them well.
- If a category has no data, skip it silently — never say "no trades this week."`;

function buildAudioSystemPrompt(tone: Tone, trashTalk: boolean): string {
  const toneSection =
    tone === "beat-reporter" ? TONE_BEAT_REPORTER : tone === "hype" ? TONE_HYPE : TONE_BROADCASTER;
  const trashTalkSection = trashTalk ? TRASH_TALK_ON : TRASH_TALK_OFF;
  return [AUDIO_SCRIPT_PROMPT, toneSection, trashTalkSection].join("\n\n");
}

export type AudioScriptResult = {
  script: string;
  modelId: string;
  tone: Tone;
  trashTalk: boolean;
};

// Hard ceiling on the spoken script. The TTS engine truncates very long input
// (cutting the audio off mid-sentence), so if the model overshoots we trim
// back to the last complete sentence rather than ship a clipped recap.
const MAX_AUDIO_SCRIPT_CHARS = 850;

function capAudioScript(script: string): string {
  const trimmed = script.trim();
  if (trimmed.length <= MAX_AUDIO_SCRIPT_CHARS) return trimmed;
  const slice = trimmed.slice(0, MAX_AUDIO_SCRIPT_CHARS);
  const lastSentence = slice.match(/^[\s\S]*[.!?](?=\s|$)/);
  return (lastSentence ? lastSentence[0] : slice).trim();
}

export async function generateAudioScript(
  data: EnrichedWeek,
  options: NarrativeOptions = {},
): Promise<AudioScriptResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const tone = options.tone ?? DEFAULT_TONE;
  const trashTalk = options.trashTalk ?? DEFAULT_TRASH_TALK;

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";

  const userMessage = `Here is the enriched data for the recap. Write the spoken narration.

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\``;

  const response = await ai.models.generateContent({
    model,
    contents: userMessage,
    config: {
      systemInstruction: buildAudioSystemPrompt(tone, trashTalk),
      maxOutputTokens: 2048,
    },
  });

  const script = capAudioScript(response.text ?? "");
  if (!script) {
    throw new Error("Gemini returned an empty audio script");
  }

  return { script, modelId: model, tone, trashTalk };
}
