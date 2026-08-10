import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authClient } from '../lib/authClient';
import './Header.css';

const Header = () => {
  const { isAuthenticated, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate('/');
  };

  const tabClass = ({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`;

  // Publish the header's real height as --header-h. The game page needs a
  // definite height to size the board against, and it used to guess `64px` —
  // but the nav wraps on a phone and the header is nearer 78px, so the guess
  // left the whole document scrollable. Measuring is the only version of this
  // that stays correct as the nav grows or the breakpoints move.
  const headerRef = useRef(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const publish = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="site-header" ref={headerRef}>
      <NavLink to="/" className="header-logo">
        Tarati
      </NavLink>
      <nav className="header-nav">
        <NavLink to="/" end className={tabClass}>
          Home
        </NavLink>
        <NavLink to="/rules" className={tabClass}>
          Rules
        </NavLink>
        <NavLink to="/strategy" className={tabClass}>
          Strategy
        </NavLink>
        <NavLink to="/ai" className={tabClass}>
          AI
        </NavLink>
        <NavLink to="/play" className={tabClass}>
          Play
        </NavLink>
        <NavLink to="/multiplayer" className={tabClass}>
          Multiplayer
        </NavLink>
      </nav>
      <div className="header-account">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          type="button"
          aria-pressed={isDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {/* Inline so the icon inherits currentColor and needs no asset. */}
          {isDark ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" fill="currentColor" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <line
                  key={deg}
                  x1="12" y1="2.6" x2="12" y2="5"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                  transform={`rotate(${deg} 12 12)`}
                />
              ))}
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
        {isAuthenticated ? (
          <>
            <NavLink to="/settings" className="header-account-name">
              {user?.name || 'Account'}
            </NavLink>
            <button className="header-signout" onClick={handleSignOut} type="button">
              Sign out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login" className="nav-tab">
              Log in
            </NavLink>
            <NavLink to="/signup" className="header-signup">
              Sign up
            </NavLink>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
