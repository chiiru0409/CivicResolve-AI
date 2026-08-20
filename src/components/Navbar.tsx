import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, User, LogOut, LayoutDashboard, AlertCircle, Search, Info, Home, Phone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import EagleEyeLogo from './EagleEyeLogo';

const Navbar: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate  = useNavigate();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const publicLinks = [
    { label: 'Home',         path: '/',             icon: <Home className="w-4 h-4" /> },
    { label: 'How It Works', path: '/how-it-works',  icon: <Info className="w-4 h-4" /> },
    { label: 'Track',        path: '/track',         icon: <Search className="w-4 h-4" /> },
    { label: 'Call AI',      path: '/call',          icon: <Phone className="w-4 h-4" /> },
  ];

  const citizenLinks = [
    { label: 'Dashboard',    path: '/dashboard',      icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Report Issue', path: '/report',         icon: <AlertCircle className="w-4 h-4" /> },
    { label: 'Call AI',      path: '/call',          icon: <Phone className="w-4 h-4" /> },
    { label: 'My Complaints',path: '/my-complaints',  icon: <Search className="w-4 h-4" /> },
  ];

  const navLinks = isAuthenticated ? citizenLinks : publicLinks;

  const handleLogout = () => { logout(); navigate('/'); setMenuOpen(false); };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-[#0D0D0D]/95 backdrop-blur-md border-b border-white/8 shadow-dark-md' : 'bg-[#0D0D0D]/80 backdrop-blur-sm'
    }`}>
      {/* Top accent */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
              <div className="w-8 h-8 bg-[#141414] border border-white/12 rounded-lg flex items-center justify-center group-hover:border-[#E10600]/50 transition-colors shadow-sm p-0.5">
                <EagleEyeLogo size={26} />
              </div>
              <div className="leading-none flex items-baseline gap-0.5">
                <span className="font-black text-white text-sm tracking-tight">CIVIC</span>
                <span className="font-black text-[#E10600] text-sm tracking-tight">RESOLVE</span>
                <span className="font-black text-[#FFC400] text-[10px] ml-0.5">AI</span>
              </div>
            </Link>
            <span className="hidden xl:inline-flex items-center gap-1.5 ml-3 font-mono text-[10px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              SYS_ONLINE
            </span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1 bg-[#111] border border-white/8 rounded-full p-1 shadow-inner">
            {navLinks.map((link) => (
              <Link key={link.path} to={link.path}
                className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
                  isActive(link.path)
                    ? 'text-white bg-[#E10600] shadow-sm'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {/* Quick Call Button */}
            <Link
              to="/call"
              className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm"
              title="Call CivicResolve Voice AI Helpline"
            >
              <Phone className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden sm:inline">Call AI</span>
            </Link>

            {isAuthenticated ? (
              <>
                <Link to="/profile"
                  className="hidden md:flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/8 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-all">
                  <div className="w-5 h-5 bg-[#E10600]/20 rounded-full flex items-center justify-center text-[#E10600] text-[10px] font-black">
                    {user?.full_name?.charAt(0).toUpperCase() ?? 'C'}
                  </div>
                  <span className="hidden lg:block">{user?.full_name?.split(' ')[0]}</span>
                </Link>
                <button onClick={handleLogout}
                  className="hidden md:flex items-center gap-1.5 text-xs text-white/40 hover:text-white px-2.5 py-1.5 rounded-xl hover:bg-white/5 transition-all">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <Link to="/login"
                  className="hidden md:flex text-xs text-white/60 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 font-semibold transition-all">
                  Sign In
                </Link>
                <Link to="/register"
                  className="hidden md:flex items-center gap-1.5 btn-primary text-xs py-2 px-3.5 rounded-xl">
                  <User className="w-3.5 h-3.5" /> Register
                </Link>
              </>
            )}

            <button onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#0D0D0D] border-t border-white/8 px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <Link key={link.path} to={link.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive(link.path) ? 'bg-[#E10600]/10 text-[#E10600] border-l-2 border-[#E10600]' : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}>
              {link.icon}{link.label}
            </Link>
          ))}
          {isAuthenticated ? (
            <>
              <Link to="/profile" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white">
                <User className="w-4 h-4" /> Profile
              </Link>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login"   className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white"><User className="w-4 h-4" />Sign In</Link>
              <Link to="/register" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-[#E10600] text-white mt-1"><User className="w-4 h-4" />Register Free</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
