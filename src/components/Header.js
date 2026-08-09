import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authClient } from '../lib/authClient';
import './Header.css';

const Header = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate('/');
  };

  const tabClass = ({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`;

  return (
    <header className="site-header">
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
