import type { Department } from '../types';

// ============================================================
// Mock municipal departments
// ============================================================

export const departments: Department[] = [
  {
    id: 'dept-roads',
    name: 'Municipal Roads & Infrastructure Department',
    shortName: 'Roads Dept',
    categories: ['Roads', 'Infrastructure'],
    head: 'Suresh Kumar',
    contact: '+91-80-2345-6789',
    zones: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
    teams: ['North Roads Team', 'South Roads Team', 'Central Roads Team', 'Emergency Response Team'],
    color: '#ef4444',
  },
  {
    id: 'dept-sanitation',
    name: 'Sanitation & Waste Management Department',
    shortName: 'Sanitation Dept',
    categories: ['Garbage'],
    head: 'Priya Sharma',
    contact: '+91-80-2345-6790',
    zones: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'],
    teams: ['Zone 1 Sanitation Team', 'Zone 2 Sanitation Team', 'Zone 3 Sanitation Team', 'Market Sanitation Team'],
    color: '#f97316',
  },
  {
    id: 'dept-drainage',
    name: 'Drainage & Stormwater Management',
    shortName: 'Drainage Dept',
    categories: ['Drainage'],
    head: 'Rajesh Patel',
    contact: '+91-80-2345-6791',
    zones: ['Zone 1', 'Zone 2', 'Zone 3'],
    teams: ['Drainage Inspection Team', 'Emergency Pump Team', 'Maintenance Team'],
    color: '#3b82f6',
  },
  {
    id: 'dept-water',
    name: 'Water Supply & Distribution Department',
    shortName: 'Water Dept',
    categories: ['Water'],
    head: 'Anita Singh',
    contact: '+91-80-2345-6792',
    zones: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
    teams: ['Pipeline Repair Team', 'Supply Management Team', 'Emergency Water Team'],
    color: '#06b6d4',
  },
  {
    id: 'dept-electrical',
    name: 'Electrical & Street Lighting Division',
    shortName: 'Electrical Dept',
    categories: ['Streetlights'],
    head: 'Vikram Reddy',
    contact: '+91-80-2345-6793',
    zones: ['Zone 1', 'Zone 2', 'Zone 3'],
    teams: ['Lighting Maintenance Team', 'Emergency Electrical Team', 'North Lighting Team', 'South Lighting Team'],
    color: '#eab308',
  },
  {
    id: 'dept-infra',
    name: 'Public Works & Infrastructure Department',
    shortName: 'PWD',
    categories: ['Infrastructure', 'Other'],
    head: 'Meena Krishnan',
    contact: '+91-80-2345-6794',
    zones: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
    teams: ['Civil Works Team', 'Bridge Maintenance Team', 'Public Facility Team'],
    color: '#8b5cf6',
  },
];

export function getDepartmentByCategory(category: string): Department {
  const dept = departments.find((d) => d.categories.includes(category as Department['categories'][0]));
  return dept || departments[departments.length - 1];
}

export function getDepartmentById(id: string): Department | undefined {
  return departments.find((d) => d.id === id);
}
