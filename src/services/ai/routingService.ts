/**
 * routingService.ts — Municipal Department, Ward Jurisdiction & SLA Routing Service
 */

import type { Category, Priority } from '../../types';

export interface DepartmentRoutingInfo {
  department: string;
  code: string;
  assignedTeam: string;
  slaHours: number;
  slaDescription: string;
  escalationTier: 1 | 2 | 3;
  wardJurisdiction?: string;
  contactHelpline: string;
}

export const MUNICIPAL_DEPARTMENTS: Record<Category, DepartmentRoutingInfo> = {
  Roads: {
    department: 'Roads & Infrastructure Maintenance (BBMP)',
    code: 'DEPT-ROADS',
    assignedTeam: 'Road Rapid Repair Unit #QRF-1',
    slaHours: 24,
    slaDescription: '24h Emergency Tarmac & Cavitation SLA',
    escalationTier: 1,
    wardJurisdiction: 'Central Infrastructure Zone',
    contactHelpline: '1800-425-ROADS',
  },
  Garbage: {
    department: 'Solid Waste & Sanitation Management',
    code: 'DEPT-SWM',
    assignedTeam: 'Sanitation Dispatch Crew #SW-04',
    slaHours: 12,
    slaDescription: '12h Biohazard & Sanitation Clearance SLA',
    escalationTier: 1,
    wardJurisdiction: 'Ward Sanitation Wing',
    contactHelpline: '1800-425-CLEAN',
  },
  Drainage: {
    department: 'Drainage & Stormwater Flood Operations',
    code: 'DEPT-DRAIN',
    assignedTeam: 'Stormwater Response Team #SWD-2',
    slaHours: 18,
    slaDescription: '18h Inundation & Culvert Clearance SLA',
    escalationTier: 1,
    wardJurisdiction: 'Flood Mitigation Directorate',
    contactHelpline: '1800-425-FLOOD',
  },
  Water: {
    department: 'Water Supply & Pipeline Operations (BWSSB)',
    code: 'DEPT-WATER',
    assignedTeam: 'Pipeline Leak Mitigation Squad #WTR-07',
    slaHours: 16,
    slaDescription: '16h Pressure Main Restoration SLA',
    escalationTier: 1,
    wardJurisdiction: 'Water Distribution Circle',
    contactHelpline: '1800-425-WATER',
  },
  Streetlights: {
    department: 'Electrical Grid & Street Lighting Division (BESCOM)',
    code: 'DEPT-ELEC',
    assignedTeam: 'High-Voltage Grid Emergency Unit #LT-03',
    slaHours: 8,
    slaDescription: '8h Shock Hazard & Illumination Restoration SLA',
    escalationTier: 1,
    wardJurisdiction: 'Urban Lighting Authority',
    contactHelpline: '1800-425-LIGHT',
  },
  Infrastructure: {
    department: 'Public Works & Structural Safety Directorate',
    code: 'DEPT-PWD',
    assignedTeam: 'Structural Engineering Evaluation Unit #PWD-5',
    slaHours: 48,
    slaDescription: '48h Structural Integrity & Repair SLA',
    escalationTier: 2,
    wardJurisdiction: 'Public Asset Administration',
    contactHelpline: '1800-425-WORKS',
  },
  Other: {
    department: 'Municipal Citizen Redressal Hub',
    code: 'DEPT-GEN',
    assignedTeam: 'General Triage Response Team #GEN-01',
    slaHours: 72,
    slaDescription: '72h Standard Citizen Service SLA',
    escalationTier: 3,
    wardJurisdiction: 'General Grievance Cell',
    contactHelpline: '1800-425-CIVIC',
  },
};

/** Calculate exact SLA deadline from submission date and priority */
export function calculateSlaDeadline(submittedAt: string | Date, priority: Priority, category: Category): {
  deadline: Date;
  slaHours: number;
  isBreached: boolean;
  remainingHours: number;
  formattedCountdown: string;
} {
  const submitDate = new Date(submittedAt);
  const deptInfo = MUNICIPAL_DEPARTMENTS[category] || MUNICIPAL_DEPARTMENTS.Other;

  let multiplier = 1.0;
  if (priority === 'CRITICAL') multiplier = 0.35; // e.g. 8h -> 2.8h
  else if (priority === 'HIGH') multiplier = 0.65;
  else if (priority === 'MEDIUM') multiplier = 1.0;
  else multiplier = 1.5;

  const effectiveHours = Math.max(2, Math.round(deptInfo.slaHours * multiplier));
  const deadline = new Date(submitDate.getTime() + effectiveHours * 3600 * 1000);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const remainingHours = diffMs / (3600 * 1000);
  const isBreached = diffMs < 0;

  let formattedCountdown = '00:00:00';
  if (!isBreached) {
    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    formattedCountdown = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    const overdueSecs = Math.floor(Math.abs(diffMs) / 1000);
    const hrs = Math.floor(overdueSecs / 3600);
    const mins = Math.floor((overdueSecs % 3600) / 60);
    formattedCountdown = `OVERDUE by ${hrs}h ${mins}m`;
  }

  return {
    deadline,
    slaHours: effectiveHours,
    isBreached,
    remainingHours: Number(remainingHours.toFixed(1)),
    formattedCountdown,
  };
}
