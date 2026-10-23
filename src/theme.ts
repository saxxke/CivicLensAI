/**
 * CivicLens AI Design System & Theme Tokens
 * Tuned for a high-contrast, modern, premium civic-tech mobile experience.
 */

export const THEME = {
  colors: {
    // Primary & Neutrals
    primaryNavy: '#0F172A', // Deep navy for high-priority headings & badges
    navyLight: '#1E293B',    // Card headers & emphasized subtitles
    slateMuted: '#64748B',   // Secondary copy & metadata
    slateLight: '#94A3B8',   // Placeholder & border accents
    slateBorder: '#E2E8F0',  // Subtle dividers & card outlines
    borderSubtle: '#F1F5F9', // Lightest card dividers

    // Brand Teal Highlights
    brandTeal: '#0D9488',    // Primary actions, interactive highlights
    tealDark: '#0F766E',     // Active badges & high-contrast teal text
    tealMuted: '#14B8A6',    // Bright vibrant accents
    tealSoft: '#F0FDFA',     // Subtle teal card tints
    tealBorder: '#CCFBF1',   // Delicate teal card borders
    tealGhost: 'rgba(13, 148, 136, 0.12)',

    // Surface Backgrounds
    background: '#F8FAFC',   // Clean light-grey neutral backdrop
    surface: '#FFFFFF',      // Pure white card surfaces
    surfaceHover: '#F1F5F9',

    // Status Colors (WCAG AA Compliant contrast)
    status: {
      reportedBg: '#FEF3C7',
      reportedText: '#B45309',
      reportedBorder: '#FDE68A',

      underReviewBg: '#E0E7FF',
      underReviewText: '#4338CA',
      underReviewBorder: '#C7D2FE',

      inProgressBg: '#E0F2FE',
      inProgressText: '#0369A1',
      inProgressBorder: '#BAE6FD',

      resolvedBg: '#DCFCE7',
      resolvedText: '#15803D',
      resolvedBorder: '#BBF7D0',

      rejectedBg: '#FEE2E2',
      rejectedText: '#B91C1C',
      rejectedBorder: '#FECACA',
    },

    // Priority Indicators
    priority: {
      highBg: '#FEE2E2',
      highText: '#B91C1C',
      highBorder: '#FECACA',

      mediumBg: '#FEF3C7',
      mediumText: '#B45309',
      mediumBorder: '#FDE68A',

      lowBg: '#F1F5F9',
      lowText: '#475569',
      lowBorder: '#E2E8F0',
    },

    // Alerts & Notifications
    errorBg: '#FEF2F2',
    errorText: '#B91C1C',
    errorBorder: '#FECACA',
    badgeRed: '#EF4444',
  },

  radius: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },

  shadows: {
    sm: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    lg: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 5,
    },
    tealGlow: {
      shadowColor: '#0D9488',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 4,
    },
  },
};
