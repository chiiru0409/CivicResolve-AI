import type { Complaint } from '../types';

// ============================================================
// Production: No fake/mock complaints.
// All complaints are dynamically retrieved from the backend database.
// ============================================================

export const mockComplaints: Complaint[] = [];
export default mockComplaints;
