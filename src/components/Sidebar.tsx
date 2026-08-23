import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, ClipboardList, Map, Building2, AlertTriangle, BarChart3, Settings, X } from 'lucide-react';
import EagleEyeLogo from './EagleEyeLogo';

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

const navItems = [
  { label: 'Overview',     path: '/admin',              icon: LayoutDashboard, exact: true },
  { label: 'Complaints',   path: '/admin/complaints',   icon: ClipboardList },
  { label: 'Map View',     path: '/admin/map',          icon: Map },
  { label: 'Departments',  path: '/admin/departments',  icon: Building2 },
  { label: 'Escalations',  path: '/admin/escalations',  icon: AlertTriangle, badge: '!' },
  { label: 'Analytics',    path: '/admin/analytics',    icon: BarChart3 },
  { label: 'Settings',     path: '/admin/settings',     icon: Settings },
];

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onClose }) => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/\/$/, '') || '/';
  const isActive = (path: string, exact?: boolean) => {
    const targetPath = path.replace(/\/$/, '') || '/';
    return exact ? currentPath === targetPath : (currentPath === targetPath || currentPath.startsWith(`${targetPath}/`));
  };

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-[#0D0D0D] border-r border-white/8 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:relative lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#E10600]/60 to-transparent" />

        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="w-8 h-8 bg-[#141414] border border-white/12 rounded-xl flex items-center justify-center p-0.5 shadow-md shadow-[#E10600]/10"
            >
              <EagleEyeLogo size={22} />
            </motion.div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-black text-white text-xs tracking-tight font-display">CIVIC</span>
              <span className="font-black text-[#E10600] text-xs tracking-tight font-display">RESOLVE</span>
              <span className="font-black text-[#FFC400] text-[9px] ml-0.5 font-mono">AI</span>
            </div>
          </Link>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="mx-4 mt-4 mb-3 bg-[#E10600]/8 border border-[#E10600]/15 rounded-2xl px-3 py-2.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-[#E10600] flex items-center gap-1.5 font-mono uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[#E10600] shadow-[0_0_8px_#E10600] animate-pulse" />
              COMMAND CENTER
            </p>
            <span className="text-[9px] font-mono text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded border border-[#22C55E]/20 font-bold">
              SYS ONLINE
            </span>
          </div>
          <p className="text-[11px] text-white/40 mt-1 font-mono">Authority Telemetry</p>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.path, item.exact);
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className="relative block"
              >
                {active && (
                  <motion.div
                    layoutId="active-admin-nav-indicator"
                    className="absolute inset-0 bg-[#E10600]/12 border border-[#E10600]/30 rounded-xl"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}

                <motion.div
                  whileHover={{ x: 3, transition: { duration: 0.15 } }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                    active
                      ? 'text-white font-bold'
                      : 'text-white/40 hover:text-white hover:bg-white/4'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#E10600]' : 'text-white/40'}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="bg-[#E10600] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 shadow-[0_0_8px_#E10600]">
                      {item.badge}
                    </span>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/8">
          <Link
            to="/"
            className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1.5 font-mono"
          >
            ← Citizen Portal
          </Link>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
