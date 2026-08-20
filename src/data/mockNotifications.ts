import type { Notification } from '../types';

// ============================================================
// Pre-seeded mock notifications
// ============================================================

const now = new Date('2026-08-19T19:10:00+05:30');
function minutesAgo(m: number): string {
  return new Date(now.getTime() - m * 60 * 1000).toISOString();
}

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    message: 'Complaint CR-2026-004821 has been assigned to Central Roads Team.',
    type: 'success',
    timestamp: minutesAgo(15),
    read: false,
    complaintId: 'CR-2026-004821',
  },
  {
    id: 'n2',
    message: 'Your complaint CR-2026-004715 is being actively worked on by Emergency Water Team.',
    type: 'info',
    timestamp: minutesAgo(45),
    read: false,
    complaintId: 'CR-2026-004715',
  },
  {
    id: 'n3',
    message: 'Complaint CR-2026-004712 has been escalated to Level 1 — Department Head notified.',
    type: 'warning',
    timestamp: minutesAgo(90),
    read: false,
    complaintId: 'CR-2026-004712',
  },
  {
    id: 'n4',
    message: 'Complaint CR-2026-004819 has been resolved. Streetlights are now operational.',
    type: 'success',
    timestamp: minutesAgo(200),
    read: true,
    complaintId: 'CR-2026-004819',
  },
  {
    id: 'n5',
    message: 'Complaint CR-2026-004690 has been closed after successful park repair.',
    type: 'success',
    timestamp: minutesAgo(500),
    read: true,
    complaintId: 'CR-2026-004690',
  },
  {
    id: 'n6',
    message: 'AI detected recurring garbage issues in Market Area (27 complaints in 30 days).',
    type: 'warning',
    timestamp: minutesAgo(700),
    read: true,
  },
];
