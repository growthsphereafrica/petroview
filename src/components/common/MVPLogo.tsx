import React from 'react'

export interface PetroViewLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  textColor?: string
  tagline?: boolean
  variant?: 'dark' | 'light' | 'auto'
  animated?: boolean
}

export const PetroViewFlameIcon: React.FC<{
  className?: string
  idPrefix?: string
  animated?: boolean
}> = ({ className = 'w-10 h-10', idPrefix = 'pv', animated = false }) => {
  const gradOuter = `${idPrefix}-flame-outer`
  const gradInner = `${idPrefix}-flame-inner`
  const gradGlow = `${idPrefix}-flame-glow`

  return (
    <svg
      className={`${className} shrink-0 drop-shadow-sm select-none ${
        animated ? 'transition-all duration-300 hover:scale-110 hover:rotate-1' : ''
      }`}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="PetroView Logo"
    >
      <defs>
        {/* Outer Flame Gradient: Deep fiery red-orange to bright solar gold */}
        <linearGradient id={gradOuter} x1="15%" y1="90%" x2="85%" y2="10%">
          <stop offset="0%" stopColor="#FF3800" />
          <stop offset="35%" stopColor="#FF6200" />
          <stop offset="70%" stopColor="#FF9100" />
          <stop offset="100%" stopColor="#FFBD00" />
        </linearGradient>

        {/* Inner Flame Core Gradient: Golden amber to brilliant glowing yellow */}
        <linearGradient id={gradInner} x1="30%" y1="90%" x2="90%" y2="15%">
          <stop offset="0%" stopColor="#FF5500" />
          <stop offset="40%" stopColor="#FFA000" />
          <stop offset="85%" stopColor="#FFCC00" />
          <stop offset="100%" stopColor="#FFE066" />
        </linearGradient>

        {/* Subtle Ambient Flame Glow */}
        <filter id={gradGlow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#FF6B00" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter={`url(#${gradGlow})`}>
        {/* Outer Dynamic Flame Wing */}
        <path
          d="M38 108 C23 99 14 84 14 65 C14 43 32 23 52 10 C46 25 48 38 56 48 C63 56 71 61 74 72 C77 82 72 94 62 102 C54 96 48 87 48 76 C48 68 51 60 55 53 C43 59 34 71 34 85 C34 94 38 102 44 107 C42 108 40 108 38 108 Z"
          fill={`url(#${gradOuter})`}
        />

        {/* Inner Flame Blossom / Core */}
        <path
          d="M66 109 C52 107 43 97 43 83 C43 71 52 59 63 50 C61 62 67 71 75 77 C84 83 88 92 85 101 C81 106 74 109 66 109 Z"
          fill={`url(#${gradInner})`}
        />

        {/* Dynamic Flame Tip Accent */}
        <path
          d="M52 10 C62 24 67 39 63 54 C59 44 57 32 52 10 Z"
          fill="#FFE57F"
          opacity="0.85"
        />
      </g>
    </svg>
  )
}

export const PetroViewLogo: React.FC<PetroViewLogoProps> = ({
  size = 'md',
  showText = true,
  textColor,
  tagline = false,
  variant = 'auto',
  animated = true
}) => {
  const iconSizes = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  }

  const textSizes = {
    xs: 'text-sm tracking-tight',
    sm: 'text-base tracking-tight',
    md: 'text-xl tracking-tight',
    lg: 'text-2xl tracking-tight',
    xl: 'text-4xl tracking-tight'
  }

  const defaultPetroColor =
    textColor ||
    (variant === 'light'
      ? 'text-slate-900'
      : variant === 'dark'
      ? 'text-white'
      : 'text-slate-900 dark:text-white')

  return (
    <div className="flex items-center gap-2.5 select-none group">
      {/* Dynamic Flame Vector Icon */}
      <PetroViewFlameIcon
        className={iconSizes[size]}
        idPrefix={`pv-${size}`}
        animated={animated}
      />

      {showText && (
        <div className="flex flex-col">
          {/* PETROVIEW Wordmark */}
          <div className={`font-display font-black leading-none flex items-baseline ${textSizes[size]}`}>
            <span className={`${defaultPetroColor} font-black transition-colors`}>
              PETRO
            </span>
            <span className="bg-gradient-to-r from-[#FF5500] via-[#FF8A00] to-[#FFB800] bg-clip-text text-transparent font-black ml-[1px]">
              VIEW
            </span>
          </div>

          {/* Subtitle / Forecourt OS Tagline */}
          {tagline && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] animate-pulse" />
              <span className="text-[9px] font-mono tracking-wider font-bold text-orange-400 uppercase leading-none">
                FORECOURT OS
              </span>
              <span className="text-[8px] font-mono text-slate-500 uppercase">
                · LOCAL-FIRST
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Named alias for full backward compatibility across all existing files
export const MVPLogo = PetroViewLogo
export default PetroViewLogo
