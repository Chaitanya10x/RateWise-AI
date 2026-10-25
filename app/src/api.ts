import { Platform } from 'react-native';

import type { AnalysisResult, PickedImage } from './types';

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const webHost = typeof window !== 'undefined' && window.location.hostname
  ? window.location.hostname
  : 'localhost';

const fallbackBaseUrl = Platform.select({
  android: 'http://10.0.2.2:8080',
  ios: 'http://localhost:8080',
  web: `http://${webHost}:8080`,
  default: 'http://localhost:8080',
});

const resolvedBaseUrl =
  Platform.OS === 'web' && configuredBaseUrl === 'http://10.0.2.2:8080'
    ? fallbackBaseUrl
    : configuredBaseUrl || fallbackBaseUrl;

export const apiBaseUrl = (resolvedBaseUrl || '').replace(/\/$/, '');

export class ApiError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export async function analyzeProduct(image: PickedImage): Promise<AnalysisResult> {
  if (!apiBaseUrl) {
    throw new ApiError('API base URL is not configured.');
  }

  const form = new FormData();
  form.append('image', await multipartImageFrom(image));

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/analyze`, {
      method: 'POST',
      body: form,
    });
  } catch (caught) {
    const detail = caught instanceof Error && caught.message ? ` ${caught.message}` : '';
    throw new ApiError(`Cannot reach RateWise API at ${apiBaseUrl}.${detail}`);
  }

  if (!response.ok) {
    throw new ApiError(await messageFrom(response), response.status);
  }

  try {
    return normalizeResult(await response.json());
  } catch {
    throw new ApiError('The server returned an invalid analysis response.');
  }
}

async function multipartImageFrom(image: PickedImage): Promise<Blob> {
  const name = image.fileName || `product-label.${extensionFor(image.mimeType)}`;
  const type = image.mimeType || 'image/jpeg';

  if (Platform.OS === 'web') {
    try {
      const response = await fetch(image.uri);
      const blob = await response.blob();
      const fileType = blob.type || type;

      if (typeof File !== 'undefined') {
        return new File([blob], name, { type: fileType });
      }

      return new Blob([blob], { type: fileType });
    } catch (caught) {
      const detail = caught instanceof Error && caught.message ? ` ${caught.message}` : '';
      throw new ApiError(`Could not prepare the selected image for upload.${detail}`);
    }
  }

  return {
    uri: image.uri,
    name,
    type,
  } as unknown as Blob;
}

function extensionFor(mimeType?: string | null) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function messageFrom(response: Response) {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string') return data.error;
    if (data?.error?.message) return String(data.error.message);
  } catch {
    // Use the generic status message below.
  }

  return `Analysis failed (${response.status}).`;
}

function normalizeResult(value: unknown): AnalysisResult {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    analysisStatus: data.analysisStatus === 'unrecognized_image' ? 'unrecognized_image' : 'analyzed',
    rating: numberValue(data.rating, 0),
    decision: stringValue(data.decision, 'CONSIDER'),
    reason: stringValue(data.reason, 'Review the label before buying.'),
    trustScore: integerValue(data.trustScore, 0),
    healthScore: integerValue(data.healthScore, 0),
    valueScore: integerValue(data.valueScore, 0),
    ingredientsAnalysis: stringArray(data.ingredientsAnalysis),
    warnings: stringArray(data.warnings),
    expiryAnalysis: stringValue(data.expiryAnalysis, 'No expiry issue detected.'),
    alternativeProduct: alternativeFrom(data.alternativeProduct),
    productName: data.productName ? String(data.productName) : undefined,
    nutrition: stringArray(data.nutrition),
    risks: stringArray(data.risks),
  };
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function integerValue(value: unknown, fallback: number) {
  return Math.round(numberValue(value, fallback));
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function alternativeFrom(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const name = stringValue(data.name, '');
  const reason = stringValue(data.reason, '');
  const rating = numberValue(data.rating, 0);

  return name && reason && rating ? { name, reason, rating } : null;
}
