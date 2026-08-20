import type { Complaint } from '../types';

// ============================================================
// Pre-seeded mock complaints — covers all categories
// ============================================================

const now = new Date('2026-08-19T19:10:00+05:30');

function daysAgo(d: number): string {
  const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function hoursAgo(h: number): string {
  const date = new Date(now.getTime() - h * 60 * 60 * 1000);
  return date.toISOString();
}

export const mockComplaints: Complaint[] = [
  // ── Roads ──────────────────────────────────────────────────
  {
    id: 'CR-2026-004821',
    title: 'Large pothole near college bus stop',
    description:
      'There is a huge pothole near the college bus stop and vehicles are struggling to pass. Two-wheelers have already fallen due to this.',
    category: 'Roads',
    priority: 'HIGH',
    status: 'Assigned',
    department: 'Municipal Roads & Infrastructure Department',
    location: 'Main Road, Near College Bus Stop',
    latitude: 12.9716,
    longitude: 77.5946,
    landmark: 'Government Engineering College',
    submittedAt: hoursAgo(2),
    updatedAt: hoursAgo(1.5),
    assignedTo: 'Central Roads Team',
    estimatedResponse: '24-48 hours',
    aiConfidence: 94,
    aiReason:
      'Large road damage combined with its location near a high-traffic area creates a potential safety risk.',
    zone: 'Zone 2',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: hoursAgo(2), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: hoursAgo(2), status: 'completed', note: 'Category: Roads | Priority: HIGH | Confidence: 94%' },
      { id: 't3', label: 'Routed to Roads Department', timestamp: hoursAgo(1.9), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: hoursAgo(1.5), status: 'completed', note: 'Assigned to Central Roads Team' },
      { id: 't5', label: 'Site Inspection', timestamp: null, status: 'pending' },
      { id: 't6', label: 'Resolution in Progress', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Garbage ────────────────────────────────────────────────
  {
    id: 'CR-2026-004820',
    title: 'Garbage overflow at market area',
    description:
      'Garbage has been accumulating for three days near the market. The bins are overflowing and the stench is unbearable. Flies and rodents are visible.',
    category: 'Garbage',
    priority: 'MEDIUM',
    status: 'In Progress',
    department: 'Sanitation & Waste Management Department',
    location: 'City Market Area, Gandhi Nagar',
    latitude: 12.9726,
    longitude: 77.5956,
    landmark: 'Gandhi Nagar Market',
    submittedAt: daysAgo(1),
    updatedAt: hoursAgo(5),
    assignedTo: 'Zone 3 Sanitation Team',
    estimatedResponse: '12-24 hours',
    aiConfidence: 91,
    aiReason:
      'Accumulated waste in a high-footfall public area requires urgent sanitation intervention.',
    zone: 'Zone 3',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(1), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(1), status: 'completed' },
      { id: 't3', label: 'Routed to Sanitation Department', timestamp: daysAgo(1), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: hoursAgo(20), status: 'completed', note: 'Zone 3 Sanitation Team dispatched' },
      { id: 't5', label: 'Cleaning in Progress', timestamp: hoursAgo(5), status: 'current', note: 'Team on site' },
      { id: 't6', label: 'Resolution Complete', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Streetlights ───────────────────────────────────────────
  {
    id: 'CR-2026-004819',
    title: 'Multiple streetlights broken on Park Road',
    description:
      'Three consecutive streetlights on Park Road near the children\'s park are not working. The area is completely dark after 8 PM creating safety hazard.',
    category: 'Streetlights',
    priority: 'LOW',
    status: 'Resolved',
    department: 'Electrical & Street Lighting Division',
    location: 'Park Road, Near City Park',
    latitude: 12.9736,
    longitude: 77.5966,
    landmark: 'City Children Park',
    submittedAt: daysAgo(3),
    updatedAt: daysAgo(1),
    assignedTo: 'North Lighting Team',
    estimatedResponse: '48-72 hours',
    aiConfidence: 88,
    aiReason: 'Non-functional streetlights in residential/park area pose nighttime safety risk.',
    zone: 'Zone 1',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(3), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(3), status: 'completed' },
      { id: 't3', label: 'Routed to Electrical Department', timestamp: daysAgo(3), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: daysAgo(2), status: 'completed' },
      { id: 't5', label: 'Inspection Complete', timestamp: daysAgo(2), status: 'completed' },
      { id: 't6', label: 'Lights Repaired', timestamp: daysAgo(1), status: 'completed', note: 'All 3 lights replaced and operational' },
      { id: 't7', label: 'Complaint Closed', timestamp: daysAgo(1), status: 'completed' },
    ],
  },

  // ── Drainage ───────────────────────────────────────────────
  {
    id: 'CR-2026-004712',
    title: 'Severe drainage blockage causing flooding',
    description:
      'The main drainage channel near Residency Road is completely blocked. Water is overflowing onto the road. Even light rain causes significant flooding.',
    category: 'Drainage',
    priority: 'HIGH',
    status: 'Escalated',
    department: 'Drainage & Stormwater Management',
    location: 'Residency Road, Near Post Office',
    latitude: 12.9706,
    longitude: 77.5936,
    landmark: 'Residency Post Office',
    submittedAt: daysAgo(5),
    updatedAt: daysAgo(2),
    assignedTo: 'Drainage Inspection Team',
    estimatedResponse: '24-48 hours',
    aiConfidence: 96,
    aiReason: 'Drainage blockage with active flooding poses serious risk to property and public safety.',
    zone: 'Zone 2',
    escalationLevel: 1,
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(5), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(5), status: 'completed' },
      { id: 't3', label: 'Routed to Drainage Department', timestamp: daysAgo(5), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: daysAgo(4), status: 'completed' },
      { id: 't5', label: 'Escalated - No Action Taken', timestamp: daysAgo(2), status: 'current', note: 'Escalated to Level 1 — Department Head notified' },
      { id: 't6', label: 'Resolution', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Water ──────────────────────────────────────────────────
  {
    id: 'CR-2026-004715',
    title: 'Broken water pipeline causing water loss',
    description:
      'A major underground water pipeline has burst near MG Road. Water is gushing out continuously for the past 6 hours. Several homes have no water supply.',
    category: 'Water',
    priority: 'HIGH',
    status: 'In Progress',
    department: 'Water Supply & Distribution Department',
    location: 'MG Road, Near Shopping Complex',
    latitude: 12.9746,
    longitude: 77.5976,
    landmark: 'Reliance Shopping Complex',
    submittedAt: hoursAgo(8),
    updatedAt: hoursAgo(3),
    assignedTo: 'Emergency Water Team',
    estimatedResponse: '6-12 hours',
    aiConfidence: 97,
    aiReason: 'Active pipeline burst causing water loss and supply disruption requires emergency response.',
    zone: 'Zone 1',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: hoursAgo(8), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: hoursAgo(8), status: 'completed' },
      { id: 't3', label: 'Routed to Water Department', timestamp: hoursAgo(7.9), status: 'completed' },
      { id: 't4', label: 'Emergency Team Dispatched', timestamp: hoursAgo(7), status: 'completed' },
      { id: 't5', label: 'Repair in Progress', timestamp: hoursAgo(3), status: 'current', note: 'Pipeline excavation underway' },
      { id: 't6', label: 'Resolution', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Infrastructure ─────────────────────────────────────────
  {
    id: 'CR-2026-004750',
    title: 'Collapsed footpath near school zone',
    description:
      'The footpath in front of the government school has completely collapsed. Children are forced to walk on the main road which is dangerous.',
    category: 'Infrastructure',
    priority: 'HIGH',
    status: 'Assigned',
    department: 'Public Works & Infrastructure Department',
    location: 'School Road, Near Government High School',
    latitude: 12.9726,
    longitude: 77.5986,
    landmark: 'Government High School No. 3',
    submittedAt: daysAgo(2),
    updatedAt: hoursAgo(12),
    assignedTo: 'Civil Works Team',
    estimatedResponse: '48-72 hours',
    aiConfidence: 93,
    aiReason: 'Collapsed footpath near school zone presents immediate danger to children and pedestrians.',
    zone: 'Zone 3',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(2), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(2), status: 'completed' },
      { id: 't3', label: 'Routed to PWD', timestamp: daysAgo(2), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: hoursAgo(12), status: 'completed' },
      { id: 't5', label: 'Site Inspection', timestamp: null, status: 'pending' },
      { id: 't6', label: 'Repair Works', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Roads (Low priority) ───────────────────────────────────
  {
    id: 'CR-2026-004800',
    title: 'Faded road markings on highway junction',
    description:
      'Road lane markings and pedestrian crossing at the Old Airport junction have completely faded. This is causing traffic confusion and near-accident situations.',
    category: 'Roads',
    priority: 'LOW',
    status: 'Submitted',
    department: 'Municipal Roads & Infrastructure Department',
    location: 'Old Airport Junction',
    latitude: 12.9756,
    longitude: 77.5906,
    landmark: 'Old Airport Junction Signal',
    submittedAt: hoursAgo(0.5),
    updatedAt: hoursAgo(0.5),
    estimatedResponse: '72-96 hours',
    aiConfidence: 85,
    aiReason: 'Faded road markings at a busy junction create traffic hazard and pedestrian risk.',
    zone: 'Zone 4',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: hoursAgo(0.5), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: hoursAgo(0.5), status: 'completed' },
      { id: 't3', label: 'Routing to Department', timestamp: null, status: 'current' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: null, status: 'pending' },
      { id: 't5', label: 'Site Inspection', timestamp: null, status: 'pending' },
      { id: 't6', label: 'Road Marking Works', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Garbage (High) ─────────────────────────────────────────
  {
    id: 'CR-2026-004780',
    title: 'Illegal garbage dumping near residential area',
    description:
      'Someone has been illegally dumping construction waste and household garbage near the residential colony entrance. It is blocking the road and creating health hazard.',
    category: 'Garbage',
    priority: 'HIGH',
    status: 'Routed',
    department: 'Sanitation & Waste Management Department',
    location: 'Harmony Colony Entrance, Ring Road',
    latitude: 12.9766,
    longitude: 77.5926,
    landmark: 'Harmony Colony Gate',
    submittedAt: daysAgo(1),
    updatedAt: hoursAgo(22),
    estimatedResponse: '12-24 hours',
    aiConfidence: 89,
    aiReason: 'Illegal dumping near residential area with road obstruction requires immediate sanitation action.',
    zone: 'Zone 2',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(1), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(1), status: 'completed' },
      { id: 't3', label: 'Routed to Sanitation Department', timestamp: hoursAgo(22), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: null, status: 'current' },
      { id: 't5', label: 'Cleaning in Progress', timestamp: null, status: 'pending' },
      { id: 't6', label: 'Resolution Complete', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Streetlights (Medium) ──────────────────────────────────
  {
    id: 'CR-2026-004760',
    title: 'Flickering streetlights disturbing residents',
    description:
      'Streetlights on the entire stretch of Brigade Road are flickering continuously since last week. This is causing eye strain and disturbing sleep for nearby residents.',
    category: 'Streetlights',
    priority: 'MEDIUM',
    status: 'In Progress',
    department: 'Electrical & Street Lighting Division',
    location: 'Brigade Road, Sector 4',
    latitude: 12.9716,
    longitude: 77.5996,
    landmark: 'Brigade Road Circle',
    submittedAt: daysAgo(4),
    updatedAt: daysAgo(2),
    assignedTo: 'South Lighting Team',
    estimatedResponse: '48-72 hours',
    aiConfidence: 82,
    aiReason: 'Persistent flickering across entire road stretch indicates systemic electrical issue requiring inspection.',
    zone: 'Zone 1',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(4), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(4), status: 'completed' },
      { id: 't3', label: 'Routed to Electrical Department', timestamp: daysAgo(4), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: daysAgo(3), status: 'completed' },
      { id: 't5', label: 'Electrical Repair in Progress', timestamp: daysAgo(2), status: 'current' },
      { id: 't6', label: 'Lights Fixed', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Water (Medium) ─────────────────────────────────────────
  {
    id: 'CR-2026-004730',
    title: 'No water supply for 3 days in Lake View Colony',
    description:
      'Entire Lake View Colony area has been without water supply for the past 3 days. Residents are struggling and have to buy water from tankers at high cost.',
    category: 'Water',
    priority: 'MEDIUM',
    status: 'Inspection',
    department: 'Water Supply & Distribution Department',
    location: 'Lake View Colony, Sector 7',
    latitude: 12.9786,
    longitude: 77.5946,
    landmark: 'Lake View Park Entrance',
    submittedAt: daysAgo(3),
    updatedAt: daysAgo(1),
    assignedTo: 'Supply Management Team',
    estimatedResponse: '24-48 hours',
    aiConfidence: 90,
    aiReason: 'Multi-day water supply failure affecting entire colony requires urgent investigation.',
    zone: 'Zone 3',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(3), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(3), status: 'completed' },
      { id: 't3', label: 'Routed to Water Department', timestamp: daysAgo(3), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: daysAgo(2), status: 'completed' },
      { id: 't5', label: 'Inspection Ongoing', timestamp: daysAgo(1), status: 'current', note: 'Pump station under inspection' },
      { id: 't6', label: 'Supply Restored', timestamp: null, status: 'pending' },
      { id: 't7', label: 'Complaint Closed', timestamp: null, status: 'pending' },
    ],
  },

  // ── Infrastructure (Resolved) ──────────────────────────────
  {
    id: 'CR-2026-004690',
    title: 'Broken park bench and damaged play equipment',
    description:
      'Multiple benches in Nehru Park are broken and the children\'s play area has damaged swings which could injure children. The area needs urgent repair.',
    category: 'Infrastructure',
    priority: 'LOW',
    status: 'Resolved',
    department: 'Public Works & Infrastructure Department',
    location: 'Nehru Park, Central Zone',
    latitude: 12.9796,
    longitude: 77.5966,
    landmark: 'Nehru Park Main Gate',
    submittedAt: daysAgo(7),
    updatedAt: daysAgo(3),
    assignedTo: 'Public Facility Team',
    estimatedResponse: '72-96 hours',
    aiConfidence: 79,
    aiReason: 'Damaged public park infrastructure including play equipment requires prompt repair for public safety.',
    zone: 'Zone 1',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(7), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(7), status: 'completed' },
      { id: 't3', label: 'Routed to PWD', timestamp: daysAgo(7), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: daysAgo(6), status: 'completed' },
      { id: 't5', label: 'Inspection Complete', timestamp: daysAgo(5), status: 'completed' },
      { id: 't6', label: 'Repairs Complete', timestamp: daysAgo(3), status: 'completed', note: '4 benches replaced, swings repaired' },
      { id: 't7', label: 'Complaint Closed', timestamp: daysAgo(3), status: 'completed' },
    ],
  },

  // ── Drainage (Resolved) ────────────────────────────────────
  {
    id: 'CR-2026-004650',
    title: 'Storm drain clogged near bus terminal',
    description:
      'Storm water drain near the main bus terminal is clogged with debris and plastic waste. Even small rain causes water logging in the bus bay.',
    category: 'Drainage',
    priority: 'MEDIUM',
    status: 'Resolved',
    department: 'Drainage & Stormwater Management',
    location: 'KSRTC Bus Terminal Road',
    latitude: 12.9706,
    longitude: 77.5956,
    landmark: 'KSRTC Central Bus Terminal',
    submittedAt: daysAgo(10),
    updatedAt: daysAgo(7),
    assignedTo: 'Maintenance Team',
    estimatedResponse: '48-72 hours',
    aiConfidence: 88,
    aiReason: 'Clogged storm drain near transit hub causing flooding requires drain cleaning.',
    zone: 'Zone 2',
    timeline: [
      { id: 't1', label: 'Complaint Submitted', timestamp: daysAgo(10), status: 'completed' },
      { id: 't2', label: 'AI Analysis Completed', timestamp: daysAgo(10), status: 'completed' },
      { id: 't3', label: 'Routed to Drainage Department', timestamp: daysAgo(10), status: 'completed' },
      { id: 't4', label: 'Assigned to Field Officer', timestamp: daysAgo(9), status: 'completed' },
      { id: 't5', label: 'Drain Cleaning Complete', timestamp: daysAgo(8), status: 'completed' },
      { id: 't6', label: 'Drainage Restored', timestamp: daysAgo(7), status: 'completed' },
      { id: 't7', label: 'Complaint Closed', timestamp: daysAgo(7), status: 'completed' },
    ],
  },
];

export default mockComplaints;
