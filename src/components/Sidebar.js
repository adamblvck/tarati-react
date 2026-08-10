import React, { useState, useRef } from 'react';
import { useSpring, animated } from 'react-spring';
import { Menu } from 'lucide-react';
import { useMediaQuery } from 'react-responsive';

const Sidebar = ({ children, show_help = true, helpContent }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery({ minWidth: 768 });
  const contentRef = useRef(null);

  const sidebarAnimation = useSpring({
    left: isOpen ? '0px' : '-240px',
    opacity: isOpen ? 1 : 0,
  });

  const contentAnimation = useSpring({
    width: show_help ? 0 : (contentRef.current ? 0 : 'auto'),
    marginLeft: isDesktop && isOpen ? '240px' : '0px',
    opacity: show_help ? 0 : 1,
    display: show_help ? 'none' : 'block',
  });

  const helpAnimation = useSpring({
    opacity: show_help ? 1 : 0,
    display: show_help ? 'block' : 'none',
  });

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    // `stretch` rather than the `minHeight: 100vh` this used to carry. The
    // panel below is `height: 100%` of this wrapper, so the wrapper needs a
    // real height or the drawer opens 240px wide and zero tall — which looks
    // exactly like a dead button. But 100vh sized it against the VIEWPORT
    // while sitting inside a row that is already shorter than that, so it
    // overflowed the document and made the whole page scrollable. Stretching
    // sizes it to the row instead: full height, nothing to overflow.
    <div style={{ marginTop: '40px', position: 'relative', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', }}>
      
      <button
        onClick={toggleSidebar}
        style={{
          
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 50,
          padding: '8px',
          ...sidebarAnimation,
        }}
        aria-label="Toggle Sidebar"
      >
        <Menu size={24} />
      </button>

      <animated.div
        style={{
          ...sidebarAnimation,
          position: 'absolute',
          top: 0,
          width: '240px',
          height: '100%',
          background: 'rgba(255, 255, 255, 0.68)',
          backdropFilter: 'blur(18px) saturate(130%)',
          WebkitBackdropFilter: 'blur(18px) saturate(130%)',
          boxShadow: '2px 0 8px rgba(0, 0, 0, 0.06)',
          zIndex: 40,
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '16px', paddingTop: '60px', paddingBottom: '40px' }}>{children}</div>
      </animated.div>
      <animated.div 
        ref={contentRef}
        style={{
          ...contentAnimation,
          position: 'relative',
          minHeight: '100vh',
          paddingLeft: '60px', // Space for the button
          paddingTop: '60px', // Space for the button
          overflow: 'hidden',
        }}
      >
        {/* Your main content goes here */}
      </animated.div>
      <animated.div
        style={{
          ...helpAnimation,
          position: 'absolute',
          top: '60px',
          left: '60px',
          right: 0,
          bottom: 0,
          overflow: 'auto',
        }}
      >
        {/* {helpContent} */}
        {/* Content */}
        <h1>Help</h1>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc
          consectetur, nunc nec varius tinc
        </p>
      </animated.div>
    </div>
  );
};

export default Sidebar;