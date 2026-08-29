import { AppSettings, Turn } from '../types';
import * as FileSystem from 'expo-file-system';

export async function transcribeAudioFile(
  fileUri: string,
  settings: AppSettings,
  channel: 'you' | 'them' = 'you'
): Promise<Turn | null> {
  const provider = settings.sttProvider || 'deepgram';
  const apiKey =
    provider === 'gemini-transcribe'
      ? settings.apiKeys?.gemini
      : settings.apiKeys?.[provider as keyof typeof settings.apiKeys] ||
        settings.apiKeys?.deepgram ||
        settings.apiKeys?.openai ||
        settings.apiKeys?.gemini;

  if (!apiKey) {
    throw new Error('Transcription key for ' + provider + ' is missing. Add it in Settings.');
  }

  try {
    if (provider === 'gemini-transcribe') {
      const base64Audio = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      let text = '';
      try {
        // Primary: Gemini 3.5 Transcribe Interactions API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gemini-3.5-transcribe',
              input: [
                {
                  type: 'audio',
                  data: base64Audio,
                  mime_type: 'audio/m4a',
                },
              ],
              generation_config: {
                transcription_config: {
                  mode: {
                    type: 'smart',
                  },
                },
              },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json();
          text = json.output_text || json.text || json.outputs?.[0]?.text || '';
        }
      } catch (interactionsErr) {
        // fallback to generateContent below
      }

      if (!text) {
        // Fallback: Gemini multimodal generateContent
        const fbResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: 'Transcribe this audio verbatim. Return only the exact spoken words with punctuation. If there is no clear speech, return empty.',
                    },
                    {
                      inlineData: {
                        mimeType: 'audio/m4a',
                        data: base64Audio,
                      },
                    },
                  ],
                },
              ],
            }),
          }
        );
        if (fbResponse.ok) {
          const fbJson = await fbResponse.json();
          text = fbJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      }

      const trimmed = text.trim();
      if (!trimmed) return null;

      return {
        id: Math.random().toString(36).substring(2, 9),
        channel,
        text: trimmed,
        ts: Date.now(),
      };
    } else if (provider === 'gemini') {
      const base64Audio = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: 'Transcribe this audio verbatim. Return only the exact spoken words with punctuation. If there is no clear speech, return empty.',
                  },
                  {
                    inlineData: {
                      mimeType: 'audio/m4a',
                      data: base64Audio,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Gemini Audio transcription failed: HTTP ' + response.status);
      }

      const json = await response.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) return null;

      return {
        id: Math.random().toString(36).substring(2, 9),
        channel,
        text,
        ts: Date.now(),
      };
    } else if (provider === 'deepgram') {
      const response = await FileSystem.uploadAsync('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', fileUri, {
        headers: {
          Authorization: 'Token ' + apiKey,
          'Content-Type': 'audio/m4a',
        },
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });

      if (response.status !== 200) {
        throw new Error('Deepgram transcription failed: HTTP ' + response.status);
      }

      const json = JSON.parse(response.body);
      const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
      if (!text) return null;

      return {
        id: Math.random().toString(36).substring(2, 9),
        channel,
        text,
        ts: Date.now(),
      };
    } else {
      // OpenAI Whisper
      const response = await FileSystem.uploadAsync('https://api.openai.com/v1/audio/transcriptions', fileUri, {
        headers: {
          Authorization: 'Bearer ' + apiKey,
        },
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        parameters: {
          model: 'whisper-1',
          language: 'en',
        },
      });

      if (response.status !== 200) {
        throw new Error('Whisper transcription failed: HTTP ' + response.status);
      }

      const json = JSON.parse(response.body);
      const text = json.text?.trim();
      if (!text) return null;

      return {
        id: Math.random().toString(36).substring(2, 9),
        channel,
        text,
        ts: Date.now(),
      };
    }
  } catch (err: any) {
    console.warn('[STT] transcription error:', err.message);
    return null;
  }
}
