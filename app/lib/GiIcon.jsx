// A judogi (jacket + belt) in the colour of the side it marks. Drawn as SVG so
// it stays crisp on a 4K TV and carries the colour even where emoji would not.

const GI = {
  white: { fill: "#f4f6fa", stroke: "#9aa6ba", belt: "#1b1d24", beltEdge: "#000" },
  blue:  { fill: "#1f5fd6", stroke: "#8db6ff", belt: "#ffffff", beltEdge: "#c3cad8" },
};

export default function GiIcon({ color = "white", size = 48, style }) {
  const c = GI[color] || GI.white;
  return (
    <svg
      viewBox="0 0 64 64" aria-hidden="true" focusable="false"
      style={{ display: "block", flexShrink: 0, width: size, height: size, ...style }}
    >
      {/* jacket with sleeves */}
      <path
        d="M22 7 L32 12 L42 7 L61 19 L55 36 L47 31 L47 59 L17 59 L17 31 L9 36 L3 19 Z"
        fill={c.fill} stroke={c.stroke} strokeWidth="2.2" strokeLinejoin="round"
      />
      {/* crossed lapels */}
      <path d="M24 9 L38 36 M40 9 L26 36" stroke={c.stroke} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* belt and knot */}
      <rect x="15" y="35" width="34" height="6.5" rx="1.5" fill={c.belt} stroke={c.beltEdge} strokeWidth="1" />
      <path d="M30 41 L27 52 M34 41 L37 52" stroke={c.belt} strokeWidth="3.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
