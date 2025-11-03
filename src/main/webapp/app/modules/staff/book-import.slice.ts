import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';
import type { IRootState } from 'app/config/store';

type LessonType = 'vocabulary' | 'grammar' | 'listening' | 'speaking' | 'reading' | 'writing';

export interface PreviewLesson {
  type: LessonType;
  items: string[];
}

export interface PreviewChapter {
  chapterTitle: string;
  lessons: PreviewLesson[];
}

export interface PreviewBook {
  bookTitle: string;
  chapters: PreviewChapter[];
}

export interface BookImportState {
  loading: boolean;
  error?: string;
  preview?: PreviewBook;
  mode: 'file' | 'scan';
  rawText?: string;
  imagesBase64?: string[];
}

const initialState: BookImportState = {
  loading: false,
  mode: 'file',
};

const PROMPT = [
  'You receive book content (full book or a single chapter).',
  'Return STRICTLY JSON with this exact schema:',
  '{',
  '  "bookTitle": string,',
  '  "chapters": [',
  '    {',
  '      "chapterTitle": string,',
  '      "lessons": [',
  '        { "type": "vocabulary"|"grammar"|"listening"|"speaking"|"reading"|"writing", "items": string[] }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'No markdown or commentary. Only JSON. If single chapter, infer bookTitle or set "Unknown".',
].join('\n');

const lessonTypes: LessonType[] = ['vocabulary', 'grammar', 'listening', 'speaking', 'reading', 'writing'];

const isLessonType = (value: unknown): value is LessonType =>
  typeof value === 'string' && (lessonTypes as readonly string[]).includes(value);

const normalizePreview = (payload: any): PreviewBook => {
  const bookTitle = typeof payload?.bookTitle === 'string' && payload.bookTitle.trim().length > 0 ? payload.bookTitle : 'Unknown';
  const chaptersInput: any[] = Array.isArray(payload?.chapters) ? payload.chapters : [];

  const chapters: PreviewChapter[] = chaptersInput.map((chapter, index) => {
    const chapterTitle =
      typeof chapter?.chapterTitle === 'string' && chapter.chapterTitle.trim().length > 0 ? chapter.chapterTitle : `Chapter ${index + 1}`;
    const lessonsInput: any[] = Array.isArray(chapter?.lessons) ? chapter.lessons : [];
    const lessons: PreviewLesson[] = lessonsInput
      .map(lesson => {
        const type: LessonType = isLessonType(lesson?.type) ? lesson.type : 'reading';
        const items = Array.isArray(lesson?.items) ? lesson.items.filter((item: unknown) => typeof item === 'string') : [];
        return {
          type,
          items,
        };
      })
      .filter(lesson => lesson.items.length > 0);

    return {
      chapterTitle,
      lessons,
    };
  });

  return {
    bookTitle,
    chapters,
  };
};

const extractInlineData = (dataUrl: string) => {
  if (!dataUrl) {
    return { mimeType: 'image/png', data: '' };
  }

  const matches = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (matches) {
    return {
      mimeType: matches[1] || 'image/png',
      data: matches[2] || '',
    };
  }

  return {
    mimeType: 'image/png',
    data: dataUrl,
  };
};

export const analyzeWithGemini = createAsyncThunk<PreviewBook, void, { state: IRootState; rejectValue: string }>(
  'bookImport/analyzeWithGemini',
  async (_, { getState, rejectWithValue }) => {
    const { rawText, imagesBase64 } = getState().bookImport;

    if ((!rawText || rawText.trim().length === 0) && (!imagesBase64 || imagesBase64.length === 0)) {
      return rejectWithValue('Provide text or images to analyze.');
    }

    const key = import.meta.env.VITE_GEMINI_API_KEY ?? 'AIzaSyCICuOBfy1Q-AFo9zNPiR4QZLatVfkPLMg';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

    const parts: any[] = [{ text: PROMPT }];

    if (rawText && rawText.trim().length > 0) {
      parts.push({ text: rawText });
    }

    if (imagesBase64 && imagesBase64.length > 0) {
      imagesBase64.forEach(imageBase64 => {
        const { mimeType, data } = extractInlineData(imageBase64);
        if (data) {
          parts.push({
            inlineData: {
              mimeType,
              data,
            },
          });
        }
      });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => undefined);
      const message = errorData?.error?.message || 'Failed to analyze with Gemini.';
      return rejectWithValue(message);
    }

    const data = await response.json();
    const textParts: string[] = Array.isArray(data?.candidates)
      ? data.candidates
          .flatMap((candidate: any) => candidate?.content?.parts || [])
          .map((part: any) => part?.text)
          .filter((part: any): part is string => typeof part === 'string')
      : [];
    const combinedText = textParts.join('').trim();

    if (!combinedText) {
      return rejectWithValue('Gemini did not return any content.');
    }

    const sanitized = combinedText.replace(/```json|```/gi, '').trim();

    if (!sanitized) {
      return rejectWithValue('Gemini response did not include valid JSON payload.');
    }

    let parsed: PreviewBook;

    try {
      parsed = normalizePreview(JSON.parse(sanitized));
    } catch (error) {
      return rejectWithValue('Gemini response was not valid JSON.');
    }

    if (!parsed.bookTitle || !Array.isArray(parsed.chapters)) {
      return rejectWithValue('Gemini response was missing required fields.');
    }

    return parsed;
  },
);

export const saveToBackend = createAsyncThunk<void, void, { state: IRootState; rejectValue: string }>(
  'bookImport/saveToBackend',
  async (_, { getState, rejectWithValue }) => {
    const { preview } = getState().bookImport;

    if (!preview) {
      return rejectWithValue('No preview available to save.');
    }

    try {
      await axios.post('/api/books/import', preview, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        'Unable to save the book import. The backend endpoint may not be available yet.';

      return rejectWithValue(message);
    }
  },
);

const bookImportSlice = createSlice({
  name: 'bookImport',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<'file' | 'scan'>) {
      state.mode = action.payload;
      state.error = undefined;
    },
    setRawText(state, action: PayloadAction<string | undefined>) {
      state.rawText = action.payload;
    },
    setImagesBase64(state, action: PayloadAction<string[]>) {
      state.imagesBase64 = action.payload;
    },
    setPreview(state, action: PayloadAction<PreviewBook>) {
      state.preview = action.payload;
    },
    setError(state, action: PayloadAction<string | undefined>) {
      state.error = action.payload;
    },
    reset(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(analyzeWithGemini.pending, state => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(analyzeWithGemini.fulfilled, (state, action) => {
        state.loading = false;
        state.preview = action.payload;
        state.error = undefined;
      })
      .addCase(analyzeWithGemini.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message || 'Unable to analyze the provided content.';
      })
      .addCase(saveToBackend.pending, state => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(saveToBackend.fulfilled, state => {
        state.loading = false;
      })
      .addCase(saveToBackend.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message || 'Unable to save the current preview.';
      });
  },
});

export const { setMode, setRawText, setImagesBase64, setPreview, setError, reset } = bookImportSlice.actions;

export default bookImportSlice.reducer;
