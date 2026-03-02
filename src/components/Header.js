import React from 'react';
import { NavLink } from 'react-router-dom';
import './Header.css';

const Header = () => {
  return (
    <header className="site-header">
      <NavLink to="/" className="header-logo">
        Tarati
      </NavLink>
      <nav className="header-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          Home
        </NavLink>
        <NavLink
          to="/rules"
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          Rules
        </NavLink>
        <NavLink
          to="/ai"
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          AI
        </NavLink>
        <NavLink
          to="/play"
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          Play
        </NavLink>
      </nav>
    </header>
  );
};

export default Header;
