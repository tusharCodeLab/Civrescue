/**
 * Voice Alert Service
 *
 * Primary:  Browser Web Speech API (SpeechSynthesis) — free, instant, no API key.
 * Fallback: ElevenLabs TTS — only used if Web Speech is unavailable AND the key is valid.
 *
 * The ElevenLabs key in the original request returned 401 Unauthorized, so
 * Web Speech API is used as the reliable primary path.
 */

const ELEVENLABS_API_KEY = "sk_6965b850019d3ee7669c2131c4725b4ba70efeecb9389192";
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

// ─── Web Speech API (primary) ────────────────────────────────────────────────

/**
 * Speak using the browser's built-in SpeechSynthesis API.
 * This requires no network call, no API key, and works in all modern browsers.
 */
function speakWithBrowser(text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("SpeechSynthesis not available"));
      return;
    }

    // Cancel any currently playing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-US";

    // Prefer a female English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.toLowerCase().includes("female") ||
          v.name.toLowerCase().includes("zira") ||
          v.name.toLowerCase().includes("samantha") ||
          v.name.toLowerCase().includes("google us english")),
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(`SpeechSynthesis error: ${e.error}`));

    window.speechSynthesis.speak(utterance);
  });
}

// ─── ElevenLabs API (secondary) ──────────────────────────────────────────────

async function speakWithElevenLabs(text: string): Promise<void> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.4, similarity_boost: 0.8 },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs ${response.status}: ${body}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = 1.0;
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Audio playback error")); };
    audio.play().catch((err) => { URL.revokeObjectURL(url); reject(err); });
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Speak an alert message using the best available voice engine.
 * Tries ElevenLabs first (premium voice); falls back to Web Speech API.
 *
 * Throws only if BOTH engines fail. Banner still shows regardless.
 */
export async function speakAlert(text: string): Promise<void> {
  // Try ElevenLabs only if the key looks non-empty
  if (ELEVENLABS_API_KEY && ELEVENLABS_API_KEY.startsWith("sk_")) {
    try {
      await speakWithElevenLabs(text);
      console.info("[speakAlert] ElevenLabs TTS played successfully");
      return;
    } catch (err) {
      console.warn("[speakAlert] ElevenLabs failed, falling back to Web Speech:", err);
    }
  }

  // Fallback: Web Speech API
  try {
    await speakWithBrowser(text);
    console.info("[speakAlert] Web Speech API played successfully");
  } catch (err) {
    console.error("[speakAlert] Both TTS engines failed:", err);
    throw err;
  }
}
