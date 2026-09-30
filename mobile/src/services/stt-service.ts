import { AppSettings, Turn } from '../types';
import * as FileSystem from 'expo-file-system';

export async function transcribeAudioFile(
  fileUri: string,
  settings: AppSettings,
  channel: 'you' | 'them' = 'you'
): Promise<Turn | null> {
  let provider: string = settings.sttProvider || 'deepgram';
  // If provider is set to deepgram or gemini without deepgram key, but gemini key is present, auto-select gemini-transcribe
  if ((provider === 'deepgram' && !settings.apiKeys?.deepgram && settings.apiKeys?.gemini) || provider === 'gemini') {
    provider = 'gemini-transcribe';
  }

  const apiKey =
    provider === 'gemini-transcribe'
      ? settings.apiKeys?.gemini
      : settings.apiKeys?.[provider as keyof typeof settings.apiKeys] ||
        settings.apiKeys?.gemini ||
        settings.apiKeys?.deepgram ||
        settings.apiKeys?.openai;

  if (!apiKey) {
    throw new Error('Transcription API key is missing. Add your Gemini or Deepgram key in Settings.');
  }

  try {
    if (provider === 'gemini-transcribe' || provider === 'gemini') {
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
        // Fallback: Try Gemini 3.8 Flash, then Gemini 3.5 Flash-Lite, then Gemini 3.5 Flash, then Gemini 3.1 Flash-Lite
        const fallbackModels = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
        const targetLang = settings.targetLanguage || 'en';
        const translationInstruction = settings.liveTranslate
          ? ` If the speech is not in ${targetLang}, translate it into ${targetLang} and output: [Original speech] (Translated: [${targetLang} translation]).`
          : '';
        const transcribePrompt = `Transcribe this audio verbatim in whatever language is spoken (support 85+ languages with automatic detection).${translationInstruction} Return only the spoken text with punctuation. If no clear speech, return empty.`;

        for (const fbModel of fallbackModels) {
          try {
            const fbResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${fbModel}:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        {
                          text: transcribePrompt,
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
              if (text.trim()) break;
            }
          } catch {
            // continue to next fallback
          }
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
    } else if (provider === 'deepgram') {
      const langParam =
        settings.language && settings.language !== 'auto'
          ? `&language=${encodeURIComponent(settings.language)}`
          : '&detect_language=true';
      const deepgramUrl = `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true${langParam}`;

      const response = await FileSystem.uploadAsync(deepgramUrl, fileUri, {
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
      let text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
      if (!text) return null;

      if (settings.liveTranslate && settings.targetLanguage && settings.targetLanguage !== 'en') {
        text += ` [${json.results?.channels?.[0]?.detected_language || 'auto'}]`;
      }

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
