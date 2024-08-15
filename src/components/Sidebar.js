// components/Sidebar.js
import React, { useState } from 'react';
import './Sidebar.css';

const Sidebar = ({ startNewGame, toggleDarkMode, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* <button className="hamburger" onClick={toggleSidebar}>
        ☰
      </button> */}
      <div className="sidebar-content">

        {/* Render Children */}
        {children}
      </div>
    </div>
  );
};

export default Sidebar;