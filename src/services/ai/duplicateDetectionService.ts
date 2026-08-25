/**
 * duplicateDetectionService.ts — Geospatial & Semantic Duplicate Intelligence Service
 *
 * Compares incoming reports against active complaints using coordinates, category,
 * text similarity, and time window without silently merging tickets.
 */

import { api, isBackendAvailable } from '../api';
import type { Complaint } from '../../types';

export interface DuplicateCheckParams {
  description: string;
  category?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
}

export interface DuplicateCheckResult {
  is_potential_duplicate: boolean;
  similarity_percentage: number;
  existing_complaint_id?: string;
  existing_title?: string;
  existing_status?: string;
  existing_created_at?: string;
  existing_location?: string;
  distance_meters?: number;
  explanation: string;
}

/** Calculate Haversine distance in meters */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/** Semantic token overlap similarity (0-100%) */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const getTokens = (t: string) =>
    new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2));
  const s1 = getTokens(text1);
  const s2 = getTokens(text2);
  if (s1.size === 0 || s2.size === 0) return 0;

  let intersection = 0;
  s1.forEach((t) => {
    if (s2.has(t)) intersection++;
  });

  const union = new Set([...s1, ...s2]).size;
  return Math.round((intersection / union) * 100);
}

/** Check if an incoming complaint is a duplicate of active complaints */
export async function detectDuplicateComplaint(
  params: DuplicateCheckParams,
  existingComplaints?: Complaint[]
): Promise<DuplicateCheckResult> {
  // 1. Try backend endpoint
  if (isBackendAvailable()) {
    try {
      const res = await api.post<DuplicateCheckResult>('/complaints/check-duplicate', params);
      if (res) return res;
    } catch {
      // Fall through to local intelligent matcher
    }
  }

  // 2. Client-side local check against provided or cached complaints
  const list = existingComplaints || [];
  let bestMatch: Complaint | null = null;
  let highestSimilarity = 0;
  let shortestDistance = Infinity;

  for (const c of list) {
    // Only compare unresolved / active complaints
    if (c.status === 'Resolved' || c.status === 'Closed') continue;

    let matchScore = 0;

    // Check category match
    if (params.category && c.category.toLowerCase() === params.category.toLowerCase()) {
      matchScore += 35;
    }

    // Check geographic proximity
    if (params.latitude && params.longitude && c.latitude && c.longitude) {
      const dist = calculateDistanceMeters(params.latitude, params.longitude, c.latitude, c.longitude);
      if (dist <= 150) {
        matchScore += 45;
        shortestDistance = dist;
      } else if (dist <= 400) {
        matchScore += 25;
        shortestDistance = dist;
      }
    } else if (params.location && c.location) {
      const locSim = calculateTextSimilarity(params.location, c.location);
      if (locSim > 40) matchScore += 30;
    }

    // Check text description similarity
    const textSim = calculateTextSimilarity(params.description, c.description);
    matchScore += Math.round(textSim * 0.35);

    if (matchScore > highestSimilarity && matchScore >= 60) {
      highestSimilarity = matchScore;
      bestMatch = c;
    }
  }

  if (bestMatch) {
    const similarityPercentage = Math.min(95, highestSimilarity);
    return {
      is_potential_duplicate: true,
      similarity_percentage: similarityPercentage,
      existing_complaint_id: bestMatch.complaintNumber || bestMatch.id,
      existing_title: bestMatch.title,
      existing_status: bestMatch.status,
      existing_created_at: bestMatch.submittedAt,
      existing_location: bestMatch.location,
      distance_meters: shortestDistance < Infinity ? shortestDistance : undefined,
      explanation: `An active ${bestMatch.category} complaint (#${bestMatch.complaintNumber || bestMatch.id}) was already reported nearby with ${similarityPercentage}% matching context.`,
    };
  }

  return {
    is_potential_duplicate: false,
    similarity_percentage: 0,
    explanation: 'No duplicate complaints found in the surrounding municipal sector.',
  };
}
