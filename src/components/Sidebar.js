// components/Sidebar.js
import React, { useState } from 'react';
import './Sidebar.css';

const Sidebar = ({ startNewGame, toggleDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <button className="hamburger" onClick={toggleSidebar}>
        ☰
      </button>
      <div className="sidebar-content">
        <button onClick={() => { startNewGame(); toggleSidebar(); }}>
          New Game
        </button>
        <button onClick={() => { /* Implement find player logic */ }}>
          Find Player Online
        </button>
        <button onClick={toggleDarkMode}>
          Toggle Dark Mode
        </button>
        <button onClick={() => { /* Open settings modal */ }}>
          Settings
        </button>
        <button onClick={() => { /* Open credits modal */ }}>
          Credits
        </button>
      </div>
    </div>
  );
};

export default Sidebar;