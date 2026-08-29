import React from 'react';
import { motion } from 'motion/react';
import MapView from '../../components/MapView';
import { useAdminComplaints } from '../../hooks/useComplaints';
import type { Complaint, MapMarker } from '../../types';
import { Layers, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import PageTransition from '../../components/PageTransition';
import { StaggerContainer, StaggerItem } from '../../components/StaggerContainer';
import { buttonGestures } from '../../utils/motion';
import { validateCoordinates } from '../../utils/mapConfig';

function buildMarkers(complaints: Complaint[]): MapMarker[] {
  return complaints.map((c) => ({
    id:          `m-${c.id}`,
    complaintId: c.id,
    x: 50,   // legacy — MapView uses lat/lng from complaint directly
    y: 50,
    priority:   c.priority,
    status:     c.status,
    title:      c.title ?? '',
    category:   c.category,
    department: c.department ?? '',
    location:   c.location ?? '',
  }));
}

export default function AdminMapPage() {
  const { complaints, loading, error, refetch } = useAdminComplaints();
  const markers = React.useMemo(() => buildMarkers(complaints), [complaints]);

  const high     = complaints.filter((c) => ['HIGH','CRITICAL'].includes(c.priority)).length;
  const resolved = complaints.filter((c) => ['Resolved','Closed'].includes(c.status)).length;
  const active   = complaints.filter((c) => !['Resolved','Closed'].includes(c.status)).length;

  // Only complaints with mathematically valid coordinates will appear on the map
  const validCoordsList = React.useMemo(
    () =>
      complaints
        .map((c) => ({ complaint: c, ...validateCoordinates(c.latitude, c.longitude) }))
        .filter((item) => item.valid && item.latitude !== null && item.longitude !== null),
    [complaints],
  );

  const withCoordsCount = validCoordsList.length;
  const missingCoords = complaints.length - withCoordsCount;

  // Auto-compute centre from real complaint coordinates
  const mapCenter: [number, number] = React.useMemo(() => {
    if (validCoordsList.length > 0) {
      const avgLat = validCoordsList.reduce((s, c) => s + c.latitude!, 0) / validCoordsList.length;
      const avgLng = validCoordsList.reduce((s, c) => s + c.longitude!, 0) / validCoordsList.length;
      return [avgLat, avgLng];
    }
    return [17.3850, 78.4867];
  }, [validCoordsList]);

  return (
    <PageTransition className="p-6 flex flex-col gap-5" style={{ height: 'calc(100vh - 56px)' }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white font-display">Civic Issue Map</h1>
          <p className="text-white/40 text-sm mt-0.5 font-sans">
            Each marker is placed at the exact GPS coordinates submitted with the complaint.
            Click any marker to view complaint details.
          </p>
        </div>
        <motion.button
          {...buttonGestures}
          onClick={() => void refetch()}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-semibold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl transition-colors self-start sm:self-center font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E10600]' : ''}`} />
          <span>Refresh Map</span>
        </motion.button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4 bg-[#181111] border-[#E10600]/30 rounded-2xl flex items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-[#E10600] flex-shrink-0" />
            <p className="text-xs text-white/80 font-mono">{error}</p>
          </div>
          <button onClick={() => void refetch()} className="btn-primary py-1.5 px-3 text-xs font-semibold flex-shrink-0 font-mono">
            Retry
          </button>
        </motion.div>
      )}

      <div className="speed-line" />

      {/* Stats + info */}
      <StaggerContainer className="flex flex-wrap gap-3">
        {[
          { color: 'bg-[#E10600]', text: 'text-[#E10600]', border: 'border-[#E10600]/20', label: `${high} High Priority`,  pulse: false },
          { color: 'bg-[#FFC400]', text: 'text-[#FFC400]', border: 'border-[#FFC400]/20', label: `${active} Active`,        pulse: true  },
          { color: 'bg-[#22C55E]', text: 'text-[#22C55E]', border: 'border-[#22C55E]/20', label: `${resolved} Resolved`,    pulse: false },
          { color: 'bg-blue-400',  text: 'text-blue-400',  border: 'border-blue-400/20',  label: `${withCoordsCount} Mapped`, pulse: false },
        ].map((s) => (
          <StaggerItem key={s.label}
            className={`flex items-center gap-2 bg-white/5 border ${s.border} rounded-xl px-4 py-2`}>
            <div className={`w-2.5 h-2.5 ${s.color} rounded-full ${s.pulse ? 'animate-pulse' : ''}`} />
            <span className={`text-sm font-bold font-mono ${s.text}`}>{s.label}</span>
          </StaggerItem>
        ))}
        <StaggerItem className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-4 py-2 ml-auto">
          <Layers className="w-3.5 h-3.5 text-white/40" />
          <span className="text-xs text-white/40 font-semibold font-mono">Dark · Satellite · Street</span>
        </StaggerItem>
      </StaggerContainer>

      {/* Info about missing coordinates */}
      {missingCoords > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-2 bg-[#FFC400]/8 border border-[#FFC400]/20 rounded-xl px-4 py-3"
        >
          <Info className="w-4 h-4 text-[#FFC400] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#FFC400]/80">
            <strong className="text-[#FFC400]">{missingCoords} complaint{missingCoords !== 1 ? 's' : ''}</strong> {missingCoords === 1 ? 'was' : 'were'} submitted without GPS coordinates and cannot be shown on the map.
            Only complaints where the citizen confirmed a map location will appear here.
          </p>
        </motion.div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-[400px] rounded-2xl overflow-hidden border border-white/8">
        <MapView
          markers={markers}
          complaints={complaints}
          center={mapCenter}
          zoom={withCoordsCount > 0 ? 13 : 12}
          height="100%"
        />
      </div>

    </PageTransition>
  );
}
