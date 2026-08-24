import React from 'react';

export function Logo({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <img
      src="/GOOD-PRACTICE-SECONDARY-LOGO-RGB.png"
      alt="GP Certified Logo"
      className={className}
    />
  );
}