// hooks/useScrollFadeIn.js
// Reusable scroll-triggered fade-in using IntersectionObserver + react-spring.
// Returns { ref, style } — attach ref to the element, spread style on an animated wrapper.

import { useRef, useEffect, useState } from 'react';
import { useSpring } from 'react-spring';

const useScrollFadeIn = ({ threshold = 0.15, delay = 0, translateY = 24 } = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const style = useSpring({
    opacity: inView ? 1 : 0,
    transform: inView ? 'translateY(0px)' : `translateY(${translateY}px)`,
    delay: inView ? delay : 0,
    config: { tension: 120, friction: 14 },
  });

  return { ref, style };
};

export default useScrollFadeIn;
