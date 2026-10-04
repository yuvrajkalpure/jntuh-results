import React, { useState, useEffect } from 'react';

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      const firstSemCard = document.querySelector('.semesters-container .result-card') || document.querySelector('.result-card');
      const threshold = firstSemCard ? (firstSemCard.offsetTop + (firstSemCard.offsetHeight * 0.7)) : 450;
      if (window.scrollY > threshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    toggleVisibility();
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="scroll-to-top-btn"
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      ↑
    </button>
  );
}
