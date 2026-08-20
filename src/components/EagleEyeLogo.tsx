import React from 'react';

interface EagleEyeLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
  withContainer?: boolean;
}

export const EagleEyeLogo: React.FC<EagleEyeLogoProps> = ({
  size = 32,
  className = '',
  animated = true,
  withContainer = false,
}) => {
  return (
    <div
      className={`inline-flex items-center justify-center relative select-none flex-shrink-0 ${
        withContainer
          ? 'bg-[#E10600] rounded-lg shadow-sm hover:bg-[#C90000] transition-colors'
          : ''
      } ${className}`}
      style={{ width: size, height: size }}
      aria-label="CivicResolve Eagle Eye Logo"
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="eagleRedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF2E2E" />
            <stop offset="100%" stopColor="#C90000" />
          </linearGradient>

          <linearGradient id="eagleGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="50%" stopColor="#FFC400" />
            <stop offset="100%" stopColor="#E5A800" />
          </linearGradient>

          <radialGradient id="pupilGlow" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#FFC400" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#070707" stopOpacity="1" />
          </radialGradient>

          <filter id="eagleEyeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Embedded Scoped Animation Styles */}
        {animated && (
          <style>{`
            @keyframes eagleBlink {
              0%, 78%, 84%, 100% {
                transform: scaleY(1);
              }
              81% {
                transform: scaleY(0.08);
              }
            }

            @keyframes pupilScan {
              0%, 100% {
                transform: translate(0px, 0px);
              }
              25% {
                transform: translate(-1.2px, -0.4px);
              }
              50% {
                transform: translate(1.4px, 0.2px);
              }
              75% {
                transform: translate(0.4px, -0.6px);
              }
            }

            @keyframes reticlePulse {
              0%, 100% {
                opacity: 0.55;
                transform: scale(1);
              }
              45% {
                opacity: 0.95;
                transform: scale(1.08);
              }
              80% {
                opacity: 0.2;
              }
            }

            @keyframes browVigilance {
              0%, 100% {
                transform: translateY(0);
              }
              45% {
                transform: translateY(0.4px);
              }
            }

            .eagle-eyelid-group {
              transform-origin: 24px 25px;
              animation: eagleBlink 4.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
            }

            .eagle-pupil-group {
              transform-origin: 24px 25px;
              animation: pupilScan 4.6s ease-in-out infinite;
            }

            .eagle-reticle-pulse {
              transform-origin: 24px 25px;
              animation: reticlePulse 4.6s ease-in-out infinite;
            }

            .eagle-brow-group {
              transform-origin: 24px 14px;
              animation: browVigilance 4.6s ease-in-out infinite;
            }

            @media (prefers-reduced-motion: reduce) {
              .eagle-eyelid-group,
              .eagle-pupil-group,
              .eagle-reticle-pulse,
              .eagle-brow-group {
                animation: none !important;
              }
            }
          `}</style>
        )}

        {/* ── Geometric Eagle Crest & Forehead Contour ── */}
        <g className="eagle-brow-group">
          {/* Dominant Raptor Brow Blade */}
          <path
            d="M 6 18 C 14 11, 30 11, 42 16 C 36 14, 24 13.5, 14 17.5 L 6 18 Z"
            fill="#FFFFFF"
            fillOpacity="0.95"
          />
          {/* Subtle Red Accenting Ridge */}
          <path
            d="M 10 15.5 C 18 10.5, 32 11, 40 14.5"
            stroke="#E10600"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* ── Animated Eye Body & Eyelid Structure ── */}
        <g className="eagle-eyelid-group">
          {/* Sclera / Outer Eye Socket (Dark Obsidian) */}
          <path
            d="M 7 25 C 12 16.5, 34 16.5, 41 24.5 C 34 32.5, 12 32.5, 7 25 Z"
            fill="#090909"
            stroke="#FFFFFF"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />

          {/* Golden Eagle Iris Ring */}
          <circle
            cx="24"
            cy="24.8"
            r="6.8"
            fill="url(#eagleGoldGrad)"
            stroke="#FFC400"
            strokeWidth="0.8"
            className="eagle-reticle-pulse"
          />

          {/* AI Precision Target Reticle Arc (Telemetry Rings) */}
          <circle
            cx="24"
            cy="24.8"
            r="8.2"
            stroke="#FFC400"
            strokeWidth="0.6"
            strokeDasharray="2.5 2.5"
            strokeOpacity="0.75"
            fill="none"
            className="eagle-reticle-pulse"
          />

          {/* ── Inner Pupil & Scanning AI Glint ── */}
          <g className="eagle-pupil-group">
            {/* Deep Pupil Core */}
            <circle
              cx="24"
              cy="24.8"
              r="3.8"
              fill="#070707"
              stroke="#E10600"
              strokeWidth="0.8"
            />

            {/* Central Optical Specular Reflection (AI Vision Sensor Glint) */}
            <circle
              cx="22.6"
              cy="23.4"
              r="1.2"
              fill="#FFFFFF"
            />

            {/* Micro Reticle Crosshair Dot */}
            <circle
              cx="25.2"
              cy="25.8"
              r="0.55"
              fill="#FFC400"
            />
          </g>

          {/* Inner Corner (Canthus) Sharp Talon Accent */}
          <path
            d="M 7 25 L 12 24.5 L 9.5 26.5 Z"
            fill="#E10600"
          />
        </g>
      </svg>
    </div>
  );
};

export default EagleEyeLogo;
