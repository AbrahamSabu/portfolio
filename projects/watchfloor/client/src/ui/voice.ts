/**
 * Read-aloud in a British voice where the computer has one, for the
 * butler-at-the-console feel: a man's voice by preference (system voices
 * don't say, so it goes by the usual names), a "natural" online voice before
 * an older one, then any British English voice, then the default.
 */

const MALE_NAMES = /\b(daniel|arthur|george|ryan|oliver|thomas|alfie|elliot|noah|male)\b/i;

type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'lang'>;

export function pickBritishVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  const british = voices.filter((v) => /^en[-_]GB$/i.test(v.lang));
  const score = (v: V) => (MALE_NAMES.test(v.name) ? 2 : 0) + (/natural|online/i.test(v.name) ? 1 : 0);
  return [...british].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Say one thing, dropping anything still queued: a backlog of old headlines is worse than skipping one. */
export function speak(text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickBritishVoice(synth.getVoices());
  utterance.lang = voice?.lang ?? 'en-GB';
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  utterance.pitch = 0.95;
  synth.speak(utterance);
}

// Some browsers list their voices only after a first request.
if (typeof window !== 'undefined') window.speechSynthesis?.getVoices();
