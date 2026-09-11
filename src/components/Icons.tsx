/* Inline SVG icons — no icon library (brief §2.5). 24x24, currentColor stroke. */
type P = { className?: string };
const S = ({ children, className }: P & { children: React.ReactNode }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icon = {
  dashboard: (p: P) => (
    <S {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></S>
  ),
  folder: (p: P) => (
    <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></S>
  ),
  wand: (p: P) => (
    <S {...p}><path d="m3 21 12-12" /><path d="M15 6.5 17.5 9" /><path d="M18 3v3M21 6h-3M18 9V6M15 6h3" /><circle cx="6" cy="18" r="0.5" /></S>
  ),
  brain: (p: P) => (
    <S {...p}><path d="M9 3a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 9a3 3 0 0 0 1 5.7V16a3 3 0 0 0 4 2.8" /><path d="M15 3a3 3 0 0 1 3 3v.5A3 3 0 0 1 20 9a3 3 0 0 1-1 5.7V16a3 3 0 0 1-4 2.8" /><path d="M12 3v18" /></S>
  ),
  layers: (p: P) => (
    <S {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></S>
  ),
  cube: (p: P) => (
    <S {...p}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></S>
  ),
  gear: (p: P) => (
    <S {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></S>
  ),
  play: (p: P) => (<S {...p}><path d="M8 5v14l11-7-11-7Z" /></S>),
  upload: (p: P) => (<S {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></S>),
  download: (p: P) => (<S {...p}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></S>),
  trash: (p: P) => (<S {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></S>),
  logout: (p: P) => (<S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></S>),
  sun: (p: P) => (<S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></S>),
  moon: (p: P) => (<S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></S>),
  menu: (p: P) => (<S {...p}><path d="M4 6h16M4 12h16M4 18h16" /></S>),
  check: (p: P) => (<S {...p}><path d="m5 12 5 5L20 7" /></S>),
  chevron: (p: P) => (<S {...p}><path d="m9 6 6 6-6 6" /></S>),
  spark: (p: P) => (<S {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></S>),
  film: (p: P) => (<S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" /></S>),
  refresh: (p: P) => (<S {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></S>),
  x: (p: P) => (<S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>),
};

export type IconName = keyof typeof Icon;
