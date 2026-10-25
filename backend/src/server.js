import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const envResult = dotenv.config({ path: envPath });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  
  fileFilter: (_req, file, done) => {
    if (isSupportedImage(file)) return done(null, true);
    done(new ApiError(400, 'INVALID_FILE', 'Upload a JPG, PNG, or WebP product label image.'));
  },
});
const port = Number(process.env.PORT || 8080);
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL;
const genai = configured(geminiApiKey) ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

app.use(helmet());
app.use(cors({ origin: corsOrigin() }));
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  req.id = randomUUID();
  req.startedAt = Date.now();
  res.on('finish', () => {
    console.log(`${req.id} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - req.startedAt}ms`);
  });
  next();
});

app.get('/health', (_, res) => res.json({
  ok: true,
  service: 'ratewise-ai-api',
  envFile: envResult.error ? 'not loaded' : 'loaded',
  config: {
    geminiApiKey: configured(geminiApiKey),
    geminiModel,
    missingRequired: missingRequiredConfig(),
    analysisProvider: 'gemini-vision',
  },
}));

app.post('/analyze', upload.single('image'), async (req, res, next) => {
  const started = Date.now();
  const file = req.file;

  if (!file) return next(new ApiError(400, 'IMAGE_REQUIRED', 'Upload a product label image using the "image" form field.'));

  try {
    validateConfig();
    console.log(`${req.id} analyzing ${file.originalname} (${file.size} bytes) with Gemini Vision`);
    const result = await analyzeImageWithGemini(file, req.id);

    res.set('X-RateWise-Duration', String(Date.now() - started));
    console.log(`${req.id} analysis completed in ${Date.now() - started}ms`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  const apiError = ApiError.from(error);
  console.error(`${req.id || 'request'} ${apiError.code}`, apiError.cause || apiError);
  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  });
});

app.listen(port, () => {
  console.log(`RateWise AI API listening on :${port}`);
  printStartupConfig();
});

function isSupportedImage(file) {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.originalname || '');
}

function validateConfig() {
  const missing = missingRequiredConfig();

  if (missing.length) {
    throw new ApiError(503, 'CONFIG_MISSING', setupMessage(missing));
  }
}

function missingRequiredConfig() {
  const required = [
    ['GEMINI_API_KEY', geminiApiKey],
    ['GEMINI_MODEL', geminiModel],
  ];

  if (process.env.NODE_ENV === 'production') {
    required.push(['APP_ORIGIN', configuredOrigin(process.env.APP_ORIGIN) ? process.env.APP_ORIGIN : undefined]);
  }

  return required.filter(([, value]) => !configured(value)).map(([name]) => name);
}

function corsOrigin() {
  const origin = process.env.APP_ORIGIN;
  if (origin && origin !== '*') return origin.split(',').map((value) => value.trim()).filter(Boolean);
  return process.env.NODE_ENV === 'production' ? false : true;
}

function configured(value) {
  return Boolean(value && !/^replace_me$/i.test(value));
}

function configuredOrigin(value) {
  return configured(value) && value !== '*';
}

function setupMessage(missing) {
  if (missing.length === 1 && missing[0] === 'APP_ORIGIN') {
    return 'Production CORS is not configured. Set APP_ORIGIN to your frontend origin, then restart the backend.';
  }

  if (missing.length === 1 && missing[0] === 'GEMINI_API_KEY') {
    return 'Gemini is not configured yet. Set GEMINI_API_KEY in the backend environment, then restart the backend.';
  }

  if (missing.length === 1 && missing[0] === 'GEMINI_MODEL') {
    return 'Gemini model is not configured yet. Set GEMINI_MODEL to a model available to your Gemini API key, then restart the backend.';
  }

  return `Missing backend configuration: ${missing.join(', ')}. Set the missing backend environment variables, then restart the backend.`;
}

function printStartupConfig() {
  const missing = missingRequiredConfig();
  const loaded = envResult.error ? 'not found' : 'loaded';

  console.log(`Environment file: ${loaded}`);
  console.log(`CORS origin: ${process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? 'blocked until APP_ORIGIN is set' : '*')}`);
  console.log(`Gemini model from GEMINI_MODEL: ${geminiModel || 'missing'}`);
  console.log(`Gemini key configured: ${configured(geminiApiKey)}`);
  console.log('Analysis provider: Gemini Vision');

  if (missing.length) {
    console.warn(`Setup required: ${setupMessage(missing)}`);
  } else {
    console.log('Backend configuration looks ready for live OCR and AI analysis.');
  }
}

const shortText = (fallback, max) => z.coerce.string().catch(fallback).transform((value) => {
  const text = value.trim() || fallback;
  return text.length > max ? text.slice(0, max - 1).trimEnd() : text;
});

const textArray = (max) => z.preprocess((value) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}, z.array(z.string()).max(max).catch([]));

const analysisSchema = z.object({
  analysisStatus: z.enum(['analyzed', 'unrecognized_image']).catch('analyzed'),
  rating: z.coerce.number().min(0).max(5).catch(0),
  decision: z.preprocess(normalizeDecision, z.enum(['BUY', 'CONSIDER', "DON'T BUY"]).catch('CONSIDER')),
  reason: shortText('Analysis completed with limited label detail.', 140),
  trustScore: z.coerce.number().int().min(0).max(100).catch(70),
  healthScore: z.coerce.number().int().min(0).max(100).catch(70),
  valueScore: z.coerce.number().int().min(0).max(100).catch(70),
  productName: z.coerce.string().optional(),
  ingredientsAnalysis: textArray(5).default([]),
  nutrition: textArray(5).default([]),
  risks: textArray(5).default([]),
  warnings: textArray(3).default([]),
  expiryAnalysis: shortText('No clear manufacturing or expiry date was visible.', 180),
  alternativeProduct: z.object({
    name: z.coerce.string(),
    rating: z.coerce.number().min(1).max(5),
    reason: shortText('Better nutritional profile.', 120),
  }).partial().default({}).nullable().transform((value) => {
    if (!value?.name || !value?.rating || !value?.reason) return {};
    return value;
  }),
});

function normalizeDecision(value) {
  const decision = String(value || '').trim().toUpperCase().replace(/[_-]/g, ' ');
  if (decision === 'DONT BUY' || decision === "DON'TBUY") return "DON'T BUY";
  return decision;
}

async function analyzeImageWithGemini(file, requestId) {
  const prompt = `You are RateWise AI, a fast product decision assistant.
Analyze the attached product label image directly. Read visible text carefully, including the product name, ingredients, nutrition facts, manufacturing date, and expiry date.

Return JSON only. Do not include markdown.

Set analysisStatus to "analyzed" only when a packaged product label is visible and readable. If this is not a product label, set it to "unrecognized_image", set rating and all scores to 0, use decision "CONSIDER", and explain that the user should upload a clear product-label photo. Never present a numeric product rating for an unrecognized image.

First extract visible:
- product name
- ingredients
- nutrition facts
- manufacturing date
- expiry date

Evaluate:
- product name if visible
- ingredients quality
- harmful additives, preservatives, artificial colors, trans fat, excess sugar, salt, saturated fat
- nutrition quality for the product category
- manufacturing and expiry information
- rating from 1 to 5
- decision exactly one of: BUY, CONSIDER, DON'T BUY
- one short reason users can read in under 5 seconds
- trustScore, healthScore, valueScore from 0 to 100
- one alternative product only when useful; when provided include name, rating, and reason; otherwise return {}

Keep arrays short. Never invent medical claims. If image quality or OCR confidence is weak, lower trustScore.
The JSON must match this shape:
{
  "analysisStatus": "analyzed",
  "rating": 4.4,
  "decision": "BUY",
  "reason": "Short reason under 140 characters.",
  "trustScore": 92,
  "healthScore": 85,
  "valueScore": 78,
  "productName": "Product name if visible",
  "ingredientsAnalysis": ["short ingredient finding"],
  "nutrition": ["short nutrition finding"],
  "risks": ["short risk finding"],
  "warnings": [],
  "expiryAnalysis": "Short expiry/manufacturing assessment.",
  "alternativeProduct": {}
}

Do not claim that text is visible if it cannot be read. Lower trustScore when the image is blurry, cropped, or incomplete.`;

  let content;

  try {
    const geminiStarted = Date.now();
    const response = await withTimeout(
      genai.models.generateContent({
        model: geminiModel,
        contents: [{
          inlineData: {
            mimeType: file.mimetype || 'image/jpeg',
            data: file.buffer.toString('base64'),
          },
        }, { text: prompt }],
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      60_000,
      new ApiError(504, 'AI_TIMEOUT', 'Gemini analysis timed out. Please try again with a clearer label photo.'),
    );
    content = response.text || response.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    console.log(`${requestId} Gemini call completed in ${Date.now() - geminiStarted}ms; response chars=${content?.length || 0}`);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'AI_FAILED', geminiFailureMessage(error), error);
  }

  try {
    const parseStarted = Date.now();
    const parsed = analysisSchema.parse(JSON.parse(cleanJson(content || '{}')));
    console.log(`${requestId} Gemini JSON parsed in ${Date.now() - parseStarted}ms`);
    return parsed;
  } catch (error) {
    console.error(`${requestId} raw Gemini response`, content);
    throw new ApiError(502, 'AI_BAD_JSON', 'Gemini returned an incomplete analysis. Please try again with a clearer label photo.', error);
  }
}

function withTimeout(promise, timeoutMs, timeoutError) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function geminiFailureMessage(error) {
  const code = error?.cause?.code ? `${error.cause.code}: ` : '';
  const detail = error?.error?.message || error?.cause?.message || error?.message;
  if (detail) return `Gemini analysis failed: ${code}${detail}. Check network access, GEMINI_API_KEY, and GEMINI_MODEL.`;
  return 'Gemini analysis failed. Check network access, GEMINI_API_KEY, and GEMINI_MODEL.';
}

function cleanJson(content) {
  return content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}

class ApiError extends Error {
  constructor(status, code, message, cause) {
    super(message);
    this.status = status;
    this.code = code;
    this.cause = cause;
  }

  static from(error) {
    if (error instanceof ApiError) return error;
    if (error?.code === 'LIMIT_FILE_SIZE') return new ApiError(413, 'IMAGE_TOO_LARGE', 'Image must be smaller than 8 MB.', error);
    if (error?.code === 'LIMIT_UNEXPECTED_FILE') return new ApiError(400, 'IMAGE_FIELD_INVALID', 'Upload the product label image using the "image" form field.', error);
    return new ApiError(500, 'ANALYSIS_FAILED', 'Unexpected analysis failure. Check the backend log line with this request ID for the exact stack trace.', error);
  }
}
