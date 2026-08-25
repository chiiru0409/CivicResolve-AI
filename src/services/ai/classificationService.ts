/**
 * classificationService.ts — Multimodal Civic Classification Engine
 *
 * Unifies Text, Image Evidence, Geolocation & Context into structured classifications.
 */

import type { Category, Priority, AIAnalysis } from '../../types';
import { MUNICIPAL_DEPARTMENTS, calculateSlaDeadline } from './routingService';

export interface MultimodalInput {
  description: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  imageLabels?: string[];
  imageSeverity?: 'Low' | 'Medium' | 'High';
  isAnonymous?: boolean;
}

export interface StructuredClassificationResult extends AIAnalysis {
  subcategory: string;
  safetyRisk: string;
  urgencyScore: number; // 1 to 10
  severity?: number;
  confidenceQuality: 'HIGH' | 'MEDIUM' | 'PROVISIONAL';
  jurisdictionWard: string;
  slaDeadline: string;
  whyClassification: {
    textClues: string[];
    visualEvidenceClues: string[];
    locationClues: string[];
    rationale: string;
  };
}

const CATEGORY_TAXONOMY: Record<Category, { keywords: string[]; subcategories: string[]; defaultRisk: string }> = {
  Roads: {
    keywords: ['pothole', 'road', 'highway', 'street', 'tarmac', 'pavement', 'asphalt', 'crater', 'sinkhole', 'broken road', 'bump', 'divider'],
    subcategories: ['Severe Pothole Cavitation', 'Asphalt Surface Fissure', 'Median Divider Damage', 'Road Cavitation / Sinkhole'],
    defaultRisk: 'Vehicular accident hazard & two-wheeler skid risk',
  },
  Garbage: {
    keywords: ['garbage', 'trash', 'waste', 'litter', 'rubbish', 'dump', 'bin', 'stench', 'smell', 'filth', 'overflowing', 'debris', 'dumpster'],
    subcategories: ['Overflowing Dumpster', 'Illegal Street Dumping', 'Sanitation Hazard', 'Bio-waste Accumulation'],
    defaultRisk: 'Public health biohazard & pest proliferation',
  },
  Drainage: {
    keywords: ['drain', 'drainage', 'flood', 'waterlogging', 'sewage', 'sewer', 'blockage', 'clog', 'clogged', 'blocked', 'overflow', 'nala', 'gutter'],
    subcategories: ['Stormwater Drain Blockage', 'Street Waterlogging', 'Sewage Overflow', 'Open Manhole Hazard'],
    defaultRisk: 'Inundation risk to residences and pedestrian safety hazard',
  },
  Water: {
    keywords: ['water supply', 'pipeline', 'pipe', 'leak', 'leaking', 'leakage', 'burst', 'contaminated', 'dirty water', 'no water', 'gushing'],
    subcategories: ['Pressurized Main Rupture', 'Potable Water Pipeline Leak', 'Severe Supply Disruption', 'Water Contamination'],
    defaultRisk: 'Clean water wastage and local utility supply deprivation',
  },
  Streetlights: {
    keywords: ['light', 'streetlight', 'lamp', 'dark', 'bulb', 'electricity', 'flickering', 'lamppost', 'no light', 'wire', 'cable', 'live wire', 'exposed', 'sparking', 'electric pole'],
    subcategories: ['Non-operational Street Luminaire', 'Exposed High-Voltage Cable', 'Damaged Lighting Pole', 'Unlit Public Corridor'],
    defaultRisk: 'Nighttime pedestrian vulnerability and electrocution risk',
  },
  Infrastructure: {
    keywords: ['bridge', 'sidewalk', 'bench', 'park', 'building', 'wall', 'structure', 'crack', 'collapse', 'broken', 'damaged', 'bus shelter', 'footbridge'],
    subcategories: ['Damaged Pedestrian Footpath', 'Unsafe Civic Structure', 'Damaged Bus Shelter', 'Public Facility Fracture'],
    defaultRisk: 'Physical pedestrian injury & structural collapse danger',
  },
  Other: {
    keywords: ['noise', 'encroachment', 'tree', 'illegal', 'stray', 'nuisance'],
    subcategories: ['General Civic Grievance', 'Public Nuisance', 'Municipal Inquiry'],
    defaultRisk: 'General public inconvenience',
  },
};

const CRITICAL_KEYWORDS = [
  'critical', 'life threatening', 'electrocution', 'live wire', 'exposed wire', 'exposed cable',
  'building collapse', 'collapsed bridge', 'gas leak', 'sparking wire', 'massive sinkhole', 'electric shock',
];

const HIGH_KEYWORDS = [
  'accident', 'dangerous', 'emergency', 'urgent', 'collapsed', 'burst', 'gushing', 'flooding',
  'injured', 'severe', 'major', 'unsafe', 'blocked road', 'deep crater', 'open drain', 'open manhole',
];

const MEDIUM_KEYWORDS = [
  'overflowing', 'accumulating', 'days', 'week', 'several', 'continuous', 'repeated', 'traffic jam', 'flickering',
];

/** Perform multimodal classification */
export function classifyCivicIssue(input: MultimodalInput): StructuredClassificationResult {
  const combinedText = `${input.description} ${input.location || ''} ${(input.imageLabels || []).join(' ')}`.toLowerCase();
  
  // 1. Detect Category with Keyword Scoring & Image Synergy
  let bestCategory: Category = 'Other';
  let highestScore = 0;
  const textCluesFound: string[] = [];

  for (const [cat, data] of Object.entries(CATEGORY_TAXONOMY)) {
    let score = 0;
    for (const kw of data.keywords) {
      if (combinedText.includes(kw)) {
        score += kw.split(' ').length * 2;
        if (!textCluesFound.includes(kw)) textCluesFound.push(kw);
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestCategory = cat as Category;
    }
  }

  // Visual evidence clues
  const visualClues = input.imageLabels && input.imageLabels.length > 0
    ? input.imageLabels
    : input.imageUrl ? ['Photo proof attached (Visual verification pending)'] : ['No photographic evidence provided'];

  // Location clues
  const locationClues = input.location
    ? [input.location, input.latitude ? `GPS: ${input.latitude.toFixed(4)}°, ${input.longitude?.toFixed(4)}°` : 'Manual Location Address']
    : ['Location unspecified'];

  // 2. Detect Priority & Urgency Score (1-10)
  let priority: Priority = 'LOW';
  let urgencyScore = 4;

  if (CRITICAL_KEYWORDS.some((kw) => combinedText.includes(kw))) {
    priority = 'CRITICAL';
    urgencyScore = 9.8;
  } else if (HIGH_KEYWORDS.some((kw) => combinedText.includes(kw)) || input.imageSeverity === 'High') {
    priority = 'HIGH';
    urgencyScore = 8.5;
  } else if (MEDIUM_KEYWORDS.some((kw) => combinedText.includes(kw)) || input.imageSeverity === 'Medium') {
    priority = 'MEDIUM';
    urgencyScore = 6.2;
  } else {
    priority = 'LOW';
    urgencyScore = 3.8;
  }

  // 3. Routing & SLA
  const deptInfo = MUNICIPAL_DEPARTMENTS[bestCategory] || MUNICIPAL_DEPARTMENTS.Other;
  const slaCalc = calculateSlaDeadline(new Date(), priority, bestCategory);

  // 4. Subcategory & Rationale
  const taxonomy = CATEGORY_TAXONOMY[bestCategory];
  const subcategory = taxonomy.subcategories[0] || 'General Report';
  const safetyRisk = priority === 'CRITICAL' || priority === 'HIGH' ? taxonomy.defaultRisk : 'Moderate civic inconvenience';

  const whyRationale = `Identified as ${bestCategory} (${priority} priority) based on textual terms [${textCluesFound.slice(0, 4).join(', ')}] ${input.imageLabels ? `and visual features [${input.imageLabels.slice(0, 2).join(', ')}]` : ''}. Assigned to ${deptInfo.department} with a strict ${slaCalc.slaHours}h response window.`;

  // Calculated honest confidence
  const confidence = Math.min(98, Math.max(78, 80 + textCluesFound.length * 4 + (input.imageUrl ? 6 : 0)));

  return {
    title: `${subcategory} reported at ${input.location || 'Municipal Area'}`,
    category: bestCategory,
    subcategory,
    priority,
    severity: urgencyScore,
    department: deptInfo.department,
    location: input.location || 'Location not specified',
    confidence,
    confidenceQuality: confidence >= 90 ? 'HIGH' : confidence >= 80 ? 'MEDIUM' : 'PROVISIONAL',
    reason: deptInfo.slaDescription,
    assignedTeam: deptInfo.assignedTeam,
    estimatedResponse: `${slaCalc.slaHours} hours (SLA)`,
    safetyRisk,
    urgencyScore,
    jurisdictionWard: deptInfo.wardJurisdiction || 'Zone Command 4',
    slaDeadline: slaCalc.deadline.toISOString(),
    whyClassification: {
      textClues: textCluesFound,
      visualEvidenceClues: visualClues,
      locationClues,
      rationale: whyRationale,
    },
  };
}
