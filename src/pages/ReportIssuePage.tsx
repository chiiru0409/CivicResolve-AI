import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle, MapPin, Eye, EyeOff,
  ArrowRight, ChevronDown, Zap, CheckCircle, Phone,
} from 'lucide-react';
import ImageUpload from '../components/ImageUpload';
import LocationPicker, { type PickedLocation } from '../components/LocationPicker';
import { ToastContainer, useToast } from '../components/Toast';
import PageTransition from '../components/PageTransition';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import type { ImageAnalysis } from '../types';
import { buttonGestures, cardGestures } from '../utils/motion';

const ReportIssuePage: React.FC = () => {
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();

  const [description,       setDescription]       = useState('');
  const [landmark,          setLandmark]           = useState('');
  const [contactPreference, setContactPreference]  = useState('email');
  const [isAnonymous,       setIsAnonymous]        = useState(false);
  const [imageUrl,          setImageUrl]           = useState<string | null>(null);
  const [imageAnalysis,     setImageAnalysis]      = useState<ImageAnalysis | null>(null);

  // Location — set by LocationPicker; never exposed as raw fields to the citizen
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [showPicker,     setShowPicker]     = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImageUploaded = (_file: File, url: string, analysis?: ImageAnalysis) => {
    setImageUrl(url);
    if (analysis) setImageAnalysis(analysis);
    addToast('Image analyzed by Vision AI!', 'success');
  };

  const handleLocationConfirmed = (loc: PickedLocation) => {
    setPickedLocation(loc);
    setShowPicker(false);
    if (errors.location) setErrors((p) => ({ ...p, location: '' }));
    addToast('Location confirmed!', 'success');
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!description.trim()) {
      errs.description = 'Please describe the problem.';
    } else if (description.trim().length < 20) {
      errs.description = 'Description must be at least 20 characters. Please provide more detail.';
    }
    if (!pickedLocation) {
      errs.location = 'Please select a location for the issue.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      addToast('Please fill in a detailed description (min 20 chars) and select a location.', 'error');
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    // Store in sessionStorage for AI Analysis page
    sessionStorage.setItem('pendingComplaint', JSON.stringify({
      description,
      location:   pickedLocation!.address,
      latitude:   pickedLocation!.latitude.toString(),
      longitude:  pickedLocation!.longitude.toString(),
      accuracy:   pickedLocation!.accuracy?.toString() ?? '',
      landmark,
      contactPreference,
      isAnonymous: isAnonymous.toString(),
      imageUrl,
    }));
    navigate('/analyze');
  };

  return (
    <PageTransition className="min-h-screen bg-[#070707] pt-20 pb-12">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="max-w-2xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 bg-[#E10600]/10 border border-[#E10600]/20 text-[#E10600] text-sm font-bold px-4 py-2 rounded-full mb-4 font-mono shadow-[0_0_12px_rgba(225,6,0,0.15)]">
            <AlertCircle className="w-4 h-4" />
            Report a Civic Issue
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display">Describe the Problem</h1>
          <p className="text-white/50 mt-3 font-sans">
            Our AI will analyze your report and route it to the right department automatically.
          </p>
        </div>

        {/* Voice Call Helpline Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#22C55E]/8 border border-[#22C55E]/25 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#22C55E]/15 rounded-xl flex items-center justify-center text-[#22C55E] flex-shrink-0">
              <Phone className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-black text-white font-display">Prefer to speak instead of typing?</p>
              <p className="text-[11px] text-white/50 font-sans">Call our AI Voice Helpline — report your issue naturally in seconds.</p>
            </div>
          </div>
          <Link to="/call" className="flex-shrink-0">
            <motion.div
              {...buttonGestures}
              className="btn-primary py-2 px-3.5 text-xs whitespace-nowrap font-mono flex items-center gap-1.5"
            >
              <span>Call AI</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.div>
          </Link>
        </motion.div>

        <StaggerContainer className="space-y-4">

          {/* ── Description ──────────────────────────────────────────────── */}
          <StaggerItem className="card">
            <div className="flex items-center justify-between mb-3">
              <label className="label flex items-center gap-2 mb-0 font-display">
                <AlertCircle className="w-4 h-4 text-[#E10600]" />
                Describe the Problem *
              </label>
              <span className="telemetry-chip">[ 01 · INCIDENT REPORT ]</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); if (errors.description) setErrors((p) => ({ ...p, description: '' })); }}
              placeholder={`Describe the problem in your own words…\n\nExample: There is a large pothole near the main road beside the bus stop. Vehicles are struggling to pass and it is dangerous.`}
              rows={6}
              className={`input-field resize-none font-sans ${errors.description ? 'border-[#E10600] ring-2 ring-[#E10600]/20' : ''}`}
            />
            <div className="flex items-center justify-between mt-2 font-mono">
              {errors.description
                ? <p className="text-xs text-[#E10600]">{errors.description}</p>
                : <p className="text-xs text-white/40 font-sans">Be specific — include what, where, and since when.</p>
              }
              <p className="text-xs text-white/30">{description.length} chars</p>
            </div>
          </StaggerItem>

          {/* ── Image Upload & Evidence Quality ─────────────────────────── */}
          <StaggerItem className="card space-y-4">
            <div className="flex items-center justify-between mb-1">
              <label className="label flex items-center gap-2 mb-0 font-display">
                <span>📸 Photo Proof & Evidence Capture</span>
              </label>
              <span className="telemetry-chip">[ 02 · EVIDENCE CAPTURE ]</span>
            </div>
            
            <p className="text-xs text-white/50 leading-relaxed font-light font-sans">
              <strong className="text-white font-semibold">Photo proof is required for stronger verification.</strong> Uploading clear photo evidence allows municipal authorities to verify damage severity and dispatch field teams immediately.
            </p>

            <ImageUpload description={description} onImageUploaded={handleImageUploaded} />

            {/* Live Evidence Quality Indicator */}
            <AnimatePresence mode="wait">
              {imageUrl ? (
                <motion.div
                  key="verified"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5 bg-[#22C55E]/10 border border-[#22C55E]/25 rounded-2xl p-3.5 text-xs text-[#22C55E]"
                >
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <span className="font-bold uppercase tracking-wider block text-[11px] font-mono">Evidence: HIGH / VERIFIED BY PHOTO</span>
                    <span className="text-white/60 text-[11px] font-sans">Visual analysis active · High dispatch confidence assigned</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="unverified"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5 bg-[#FFC400]/8 border border-[#FFC400]/20 rounded-2xl p-3.5 text-xs text-[#FFC400]"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#FFC400]" />
                  <div>
                    <span className="font-bold uppercase tracking-wider block text-[11px] font-mono">Evidence: LOW — No photo proof provided</span>
                    <span className="text-white/50 text-[11px] font-sans">Reports without visual proof receive lower AI verification score and may require manual inspection.</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </StaggerItem>

          {/* ── Location ─────────────────────────────────────────────────── */}
          <StaggerItem className="card">
            <div className="flex items-center justify-between mb-3">
              <label className="label flex items-center gap-2 mb-0 font-display">
                <MapPin className="w-4 h-4 text-[#E10600]" />
                Select Location *
              </label>
              <span className="telemetry-chip">[ 03 · GEOLOCATION ]</span>
            </div>

            {/* Already picked → show confirmed card */}
            {pickedLocation && !showPicker ? (
              <div className="space-y-3">
                <div className="bg-[#22C55E]/8 border border-[#22C55E]/25 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-16 h-16 rounded-xl bg-[#090909] border border-white/12 relative overflow-hidden flex-shrink-0 flex items-center justify-center">
                        <div className="absolute inset-0 grid-bg opacity-40" />
                        <div className="w-6 h-6 rounded-full bg-[#E10600]/20 animate-ping absolute" />
                        <div className="w-3.5 h-3.5 rounded-full bg-[#E10600] border-2 border-white relative z-10 shadow" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-[#22C55E] uppercase tracking-wider font-mono">
                            ✓ Location Confirmed
                          </span>
                          <span className="text-[9px] font-mono text-white/30">
                            {pickedLocation.latitude.toFixed(4)}°N, {pickedLocation.longitude.toFixed(4)}°E
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white leading-snug font-display">
                          {pickedLocation.address}
                        </p>
                        {pickedLocation.accuracy && (
                          <p className={`text-[11px] mt-1 font-mono ${pickedLocation.accuracy <= 100 ? 'text-[#22C55E]' : 'text-[#FFC400]'}`}>
                            GPS accuracy: ±{Math.round(pickedLocation.accuracy)}m
                          </p>
                        )}
                      </div>
                    </div>
                    <motion.button
                      {...buttonGestures}
                      type="button"
                      onClick={() => setShowPicker(true)}
                      className="text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 font-medium font-mono"
                    >
                      Change
                    </motion.button>
                  </div>
                </div>
              </div>
            ) : showPicker ? (
              <LocationPicker
                onConfirm={handleLocationConfirmed}
                onCancel={() => { setShowPicker(false); }}
                initialLocation={pickedLocation ?? undefined}
              />
            ) : (
              <div className="space-y-3">
                {errors.location && (
                  <div className="flex items-center gap-2 bg-[#E10600]/10 border border-[#E10600]/20 rounded-xl px-4 py-3 font-mono">
                    <AlertCircle className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                    <p className="text-xs text-[#E10600]">{errors.location}</p>
                  </div>
                )}
                <motion.button
                  {...buttonGestures}
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/12 hover:border-[#E10600]/40 hover:bg-[#E10600]/5 rounded-2xl py-10 transition-colors group"
                >
                  <div className="w-14 h-14 bg-[#E10600]/10 group-hover:bg-[#E10600]/20 border border-[#E10600]/20 rounded-2xl flex items-center justify-center transition-colors">
                    <MapPin className="w-7 h-7 text-[#E10600]" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-white group-hover:text-white text-sm font-display">Select Issue Location</p>
                    <p className="text-xs text-white/40 mt-1 font-sans">
                      Use GPS · Search address · Click on map · Drag pin
                    </p>
                  </div>
                </motion.button>
              </div>
            )}
          </StaggerItem>

          {/* ── Optional Details ─────────────────────────────────────────── */}
          <StaggerItem className="card">
            <label className="label font-display">
              Additional Details
              <span className="text-white/20 font-normal ml-1 font-mono">(Optional)</span>
            </label>
            <div className="space-y-4">

              {/* Landmark */}
              <div>
                <label className="label text-xs font-mono">Nearby Landmark</label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Opposite Government Engineering College"
                  className="input-field font-sans"
                />
              </div>

              {/* Contact preference */}
              <div>
                <label className="label text-xs font-mono">Contact Preference</label>
                <div className="relative">
                  <select
                    value={contactPreference}
                    onChange={(e) => setContactPreference(e.target.value)}
                    className="input-field appearance-none pr-8 font-sans"
                  >
                    <option value="email" className="bg-[#181818] text-white">Email notification</option>
                    <option value="sms" className="bg-[#181818] text-white">SMS notification</option>
                    <option value="none" className="bg-[#181818] text-white">No notification</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                </div>
              </div>

              {/* Anonymous toggle */}
              <div className="flex items-center justify-between p-4 bg-white/4 border border-white/8 rounded-xl">
                <div className="flex items-center gap-3">
                  {isAnonymous
                    ? <EyeOff className="w-5 h-5 text-white/40" />
                    : <Eye    className="w-5 h-5 text-white" />
                  }
                  <div>
                    <p className="text-sm font-semibold text-white font-display">Anonymous Report</p>
                    <p className="text-xs text-white/40 font-sans">Your identity will not be shared with authorities</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAnonymous(!isAnonymous)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${isAnonymous ? 'bg-[#E10600]' : 'bg-white/15'}`}
                  role="switch"
                  aria-checked={isAnonymous}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${isAnonymous ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </StaggerItem>

        </StaggerContainer>

        {/* ── Submit ────────────────────────────────────────────────────── */}
        <motion.button
          {...buttonGestures}
          type="button"
          onClick={handleSubmit}
          className="btn-primary w-full justify-center py-4 text-base glow-red mt-6 font-display font-bold shadow-xl shadow-[#E10600]/20 flex items-center gap-2"
        >
          <Zap className="w-5 h-5" />
          <span>Analyze with CivicResolve AI</span>
          <ArrowRight className="w-5 h-5" />
        </motion.button>

        <p className="text-xs text-white/30 text-center mt-3 font-sans">
          By submitting, you agree our AI will analyze and route your complaint to the appropriate department.
        </p>
      </div>
    </PageTransition>
  );
};

export default ReportIssuePage;
