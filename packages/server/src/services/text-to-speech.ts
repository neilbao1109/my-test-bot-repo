/**
 * Text-to-Speech service using Azure Speech REST API.
 * Converts text to MP3 audio files.
 */

import fs from 'fs';
import path from 'path';

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || '';

export function isTtsAvailable(): boolean {
  return !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}
const TTS_TEMP_DIR = '/tmp/clawchat-tts';
const MAX_TTS_CHARS = 500;

/**
 * Strip markdown formatting for cleaner TTS output.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')       // code blocks
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')    // bold
    .replace(/\*([^*]+)\*/g, '$1')        // italic
    .replace(/__([^_]+)__/g, '$1')        // bold alt
    .replace(/_([^_]+)_/g, '$1')          // italic alt
    .replace(/~~([^~]+)~~/g, '$1')        // strikethrough
    .replace(/^#{1,6}\s+/gm, '')          // headings
    .replace(/^\s*[-*+]\s+/gm, '')        // list items
    .replace(/^\s*\d+\.\s+/gm, '')        // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
    .replace(/^\s*>\s+/gm, '')            // blockquotes
    .replace(/\n{3,}/g, '\n\n')           // excessive newlines
    .trim();
}

/**
 * Convert text to speech using Azure Speech REST API.
 * @param text - Text to convert
 * @param voice - SSML voice name (default: zh-CN-XiaoxiaoNeural)
 * @returns Path to generated MP3 file, or null on failure
 */
export async function textToSpeech(
  text: string,
  voice: string = 'zh-CN-XiaoxiaoNeural'
): Promise<string | null> {
  if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
    console.error('[TTS] Azure Speech credentials not configured');
    return null;
  }

  if (!text || !text.trim()) {
    return null;
  }

  // Clean and truncate
  let cleaned = stripMarkdown(text);
  if (cleaned.length > MAX_TTS_CHARS) {
    cleaned = cleaned.slice(0, MAX_TTS_CHARS) + '……';
  }

  // Escape XML special chars for SSML
  const escaped = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>
  <voice name='${voice}'>${escaped}</voice>
</speak>`;

  try {
    // Ensure temp dir exists
    if (!fs.existsSync(TTS_TEMP_DIR)) {
      fs.mkdirSync(TTS_TEMP_DIR, { recursive: true });
    }

    const url = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'ClawChat-TTS',
      },
      body: ssml,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS] Azure API error ${response.status}:`, errText);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const outputPath = path.join(TTS_TEMP_DIR, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`[TTS] Generated audio: ${outputPath} (${buffer.length} bytes)`);
    return outputPath;
  } catch (err) {
    console.error('[TTS] Generation error:', err);
    return null;
  }
}
