import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconGrid = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></Svg>
);

export const IconHeart = (p: IconProps) => (
  <Svg {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" /></Svg>
);

export const IconSparkles = (p: IconProps) => (
  <Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}><path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5V6L12 3z" /><path d="m9 12 2 2 4-4" /></Svg>
);

export const IconStore = (p: IconProps) => (
  <Svg {...p}><path d="M5 3h14l2 4.5a3 3 0 0 1-5.5 2 3 3 0 0 1-5 0 3 3 0 0 1-5.5-2L5 3z" /><path d="M5 11v9h14v-9" /><path d="M10 20v-5h4v5" /></Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M10 11v6M14 11v6" /></Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg size={14} {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}><path d="M12 16V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7" /></Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}><path d="M10.3 3.9 2 18.2A2 2 0 0 0 3.7 21h16.6a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4.5M12 17.2h.01" /></Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}><path d="M21 13.4A8.5 8.5 0 0 1 10.6 3a8.5 8.5 0 1 0 10.4 10.4z" /></Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></Svg>
);

export const IconThumbUp = (p: IconProps) => (
  <Svg {...p}><path d="M7 21V10l4.5-7a2 2 0 0 1 3 2.2L13.5 9H19a2 2 0 0 1 2 2.4l-1.6 7.2A2 2 0 0 1 17.4 21H7z" /><path d="M7 10H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" /></Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c5.5 0 9 6 9 6a15 15 0 0 1-3 3.6" /><path d="M6.3 6.4A15 15 0 0 0 3 11s3.5 6 9 6a9.4 9.4 0 0 0 4.2-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3 3l18 18" /></Svg>
);

export const IconStar = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Svg size={15} fill={filled ? "currentColor" : "none"} {...p}>
    <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6z" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}><path d="M10 13a4 4 0 0 0 5.7.3l3-3A4 4 0 0 0 13 4.7l-1.7 1.6" /><path d="M14 11a4 4 0 0 0-5.7-.3l-3 3A4 4 0 0 0 11 19.3l1.7-1.6" /></Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></Svg>
);

export const IconBox = (p: IconProps) => (
  <Svg {...p}><path d="M21 8.5v7l-9 5-9-5v-7l9-5 9 5z" /><path d="m3 8.5 9 5 9-5" /><path d="M12 13.5V21" /></Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
);
