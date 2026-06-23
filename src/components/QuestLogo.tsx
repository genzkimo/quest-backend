import React from 'react';

interface QuestLogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  textColor?: string; // Tailwind class like "text-white" or "text-[#1F2A44]"
}

export default function QuestLogo({ 
  className = '', 
  iconOnly = false,
  size = 'md',
  textColor = 'text-[#1F2A44]'
}: QuestLogoProps) {
  // Sizing definitions for container height & text font sizes
  const sizeClasses = {
    xs: { h: 'h-6', text: 'text-base' },
    sm: { h: 'h-8', text: 'text-xl' },
    md: { h: 'h-10', text: 'text-2xl md:text-3xl' },
    lg: { h: 'h-16', text: 'text-5xl' },
    xl: { h: 'h-24', text: 'text-7xl' }
  }[size];

  return (
    <div dir="ltr" className={`inline-flex flex-row items-center gap-2 select-none font-sans ${className}`}>
      {/* 🏃‍♂️ Mascot Container in SVG - Beautifully drawn vector reproduction */}
      <svg 
        viewBox="0 0 140 140" 
        className={`${sizeClasses.h} aspect-square shrink-0`}
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform="translate(18, 4) skewX(-12)">
          {/* Beautiful Slanted Quadrilateral Shape Backdrop matched from user's logo */}
          <rect 
            x="5" 
            y="5" 
            width="122" 
            height="122" 
            rx="36" 
            fill="#FC0D82" 
          />

          {/* White Mascot Figure - Running Action Pose */}
          {/* 1. Head */}
          <circle cx="72" cy="38" r="10.5" fill="white" />
          
          {/* 2. Backpack */}
          <rect x="42" y="48" width="13" height="28" rx="6.5" fill="white" />
          
          {/* 3. Torso / Body Line */}
          <path 
            d="M 58,50 C 62,64 68,76 72,78" 
            stroke="white" 
            strokeWidth="9" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* 4. Left Arm Swinging Behind */}
          <path 
            d="M 55,54 C 44,57 41,68 40,71" 
            stroke="white" 
            strokeWidth="7" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* 5. Right Arm Reaching Forward to Hold Document */}
          <path 
            d="M 68,54 L 86,60" 
            stroke="white" 
            strokeWidth="8" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* 6. Front Leg Active High-Knee Running Action */}
          <path 
            d="M 70,76 L 84,90 L 76,98" 
            stroke="white" 
            strokeWidth="9" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* 7. Back Leg Dynamic Trailing Motion */}
          <path 
            d="M 58,74 C 44,81 50,91 48,93" 
            stroke="white" 
            strokeWidth="9" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          
          {/* 8. White Document being Hand-delivered / Exchanged */}
          <rect x="94" y="42" width="20" height="29" rx="4.5" fill="white" />

          {/* 9. Small Heart Signature Accent inside the card */}
          <path 
            d="M 100,53 C 101,55 103.5,56.5 104,56.5 C 104.5,56.5 107,55 108,53 C 109,51 107.5,49.5 106.5,50.5 L 104,53 L 101.5,50.5 C 100.5,49.5 99,51 100,53 Z" 
            fill="#FC0D82" 
          />
        </g>
      </svg>

      {/* 📝 Heavy custom font text logo matching user image font styling */}
      {!iconOnly && (
        <span 
          style={{ letterSpacing: '-0.05em' }}
          className={`font-sans font-black italic tracking-tighter uppercase select-none ${textColor} ${sizeClasses.text}`}
        >
          QUEST
        </span>
      )}
    </div>
  );
}
