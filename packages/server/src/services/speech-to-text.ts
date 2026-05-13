/**
 * Speech-to-Text service using Azure Speech REST API.
 * Converts audio files to text transcription.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || '';

/**
 * Convert audio file to WAV format using ffmpeg.
 * Azure Speech REST API works best with WAV (PCM 16kHz mono 16-bit).
 */
function convertToWav(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.[^.]+$/, '') + '_stt.wav';
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-sample_fmt', 's16',
      outputPath,
    ], { timeout: 30000 }, (err) => {
      if (err) reject(err);
      else resolve(outputPath);
    });
  });
}

/**
 * Transcribe an audio file using Azure Speech REST API.
 * @param filePath - Absolute path to the audio file
 * @param language - BCP-47 language tag (default: auto-detect with zh-CN priority)
 * @returns Transcribed text or null on failure
 */
export async function transcribeAudio(filePath: string, language?: string): Promise<string | null> {
  if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
    console.error('[STT] Azure Speech credentials not configured');
    return null;
  }

  if (!fs.existsSync(filePath)) {
    console.error('[STT] Audio file not found:', filePath);
    return null;
  }

  let wavPath: string | null = null;
  try {
    // Convert to WAV for reliable recognition
    wavPath = await convertToWav(filePath);
    const audioData = fs.readFileSync(wavPath);

    // Use auto language detection endpoint if no language specified
    const lang = language || 'zh-CN';
    const url = `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Accept': 'application/json',
      },
      body: audioData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[STT] Azure API error ${response.status}:`, errText);
      return null;
    }

    const result = await response.json() as {
      RecognitionStatus: string;
      DisplayText?: string;
      NBest?: Array<{ Display: string; Confidence: number }>;
    };

    if (result.RecognitionStatus === 'Success') {
      // Prefer NBest[0] for higher quality, fall back to DisplayText
      const text = result.NBest?.[0]?.Display || result.DisplayText || null;
      if (text) {
        console.log(`[STT] Transcribed: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
      }
      return text;
    }

    if (result.RecognitionStatus === 'NoMatch') {
      console.log('[STT] No speech recognized in audio');
      return null;
    }

    console.error('[STT] Recognition failed:', result.RecognitionStatus);
    return null;
  } catch (err) {
    console.error('[STT] Transcription error:', err);
    return null;
  } finally {
    // Clean up temp WAV file
    if (wavPath && fs.existsSync(wavPath)) {
      try { fs.unlinkSync(wavPath); } catch { /* ignore */ }
    }
  }
}
