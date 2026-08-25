/**
 * aiService.ts — Central facade for CivicResolve AI Intelligence layer.
 */

import type { AIAnalysis, ImageAnalysis } from '../types';
import {
  classifyCivicIssue,
  analyzeImageEvidence,
  getIntelligentChatResponse,
  resetConversationState,
  type MultimodalInput,
  type StructuredClassificationResult,
  type ComprehensiveVisionResult,
  type ChatResponseResult,
} from './ai';

export * from './ai';

/** Public facade for analyzing complaints */
export async function analyzeComplaint(
  description: string,
  location: string,
  imageUrl?: string,
): Promise<StructuredClassificationResult> {
  const res = classifyCivicIssue({
    description,
    location,
    imageUrl,
  });
  return res;
}

/** Public facade for analyzing image evidence */
export async function analyzeImage(
  imageFile: File,
  description?: string
): Promise<ComprehensiveVisionResult> {
  return await analyzeImageEvidence(imageFile, description);
}

/** Public facade for chat response */
export async function getChatResponse(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  userEmail?: string
): Promise<ChatResponseResult> {
  return await getIntelligentChatResponse(userMessage, history, userEmail);
}

/** Public facade to reset conversation state */
export function resetChatState(): void {
  resetConversationState();
}
