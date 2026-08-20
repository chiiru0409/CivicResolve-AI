import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Map, Building2, AlertTriangle, BarChart3, Settings, X } from 'lucide-react';
import EagleEyeLogo from './EagleEyeLogo';

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

const navItems = [
  { label: 'Overview',     path: '/admin',              icon: <LayoutDashboard className="w-5 h-5" />, exact: true },
  { label: 'Complaints',   path: '/admin/complaints',   icon: <ClipboardList className="w-5 h-5" /> },
  { label: 'Map View',     path: '/admin/map',          icon: <Map className="w-5 h-5" /> },
  { label: 'Departments',  path: '/admin/departments',  icon: <Building2 className="w-5 h-5" /> },
  { label: 'Escalations',  path: '/admin/escalations',  icon: <AlertTriangle className="w-5 h-5" />, badge: '!' },
  { label: 'Analytics',    path: '/admin/analytics',    icon: <BarChart3 className="w-5 h-5" /> },
  { label: 'Settings',     path: '/admin/settings',     icon: <Settings className="w-5 h-5" /> },
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
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={`fixed top-0 left-0 h-full w-60 bg-[#0D0D0D] border-r border-white/8 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:relative lg:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#E10600]/50 to-transparent" />

        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#141414] border border-white/12 rounded-lg flex items-center justify-center p-0.5">
              <EagleEyeLogo size={22} />
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-black text-white text-xs tracking-tight">CIVIC</span>
              <span className="font-black text-[#E10600] text-xs tracking-tight">RESOLVE</span>
              <span className="font-black text-[#FFC400] text-[9px] ml-0.5">AI</span>
            </div>
          </Link>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="mx-4 mt-4 mb-3 bg-[#E10600]/8 border border-[#E10600]/15 rounded-xl px-3 py-2.5">
          <p className="text-xs font-bold text-[#E10600] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E10600] animate-pulse" />
            COMMAND CENTER
          </p>
          <p className="text-xs text-white/30 mt-0.5">Authority Access</p>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 text-sm ${
                isActive(item.path, item.exact)
                  ? 'bg-[#E10600]/10 text-[#E10600] border-l-2 border-[#E10600] font-semibold pl-[14px]'
                  : 'text-white/40 hover:bg-white/5 hover:text-white'
              }`}>
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="bg-[#E10600] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/8">
          <Link to="/" className="text-xs text-white/30 hover:text-white transition-colors flex items-center gap-1.5">
            ← Citizen Portal
          </Link>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
