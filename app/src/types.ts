export type Decision = 'BUY' | 'CONSIDER' | "DON'T BUY";

export type AlternativeProduct = {
  name: string;
  rating: number;
  reason: string;
};

export type AnalysisResult = {
  analysisStatus: 'analyzed' | 'unrecognized_image';
  rating: number;
  decision: Decision | string;
  reason: string;
  trustScore: number;
  healthScore: number;
  valueScore: number;
  ingredientsAnalysis: string[];
  warnings: string[];
  expiryAnalysis: string;
  alternativeProduct: AlternativeProduct | null;
  productName?: string;
  nutrition: string[];
  risks: string[];
};

export type PickedImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};
