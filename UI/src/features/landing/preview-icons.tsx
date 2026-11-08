/** Önizlemedeki çizgi simgeler kabukla aynı. Sırf simge için kütüphane bağlanmıyor. */
const paths = {
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
  tasks: "M4 5h4v4H4zM11 7h9M4 15l2 2 3-3M11 16h9",
  calendar: "M8 3v4m8-4v4M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  timer: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
  matrix: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  inbox: "M4 13 6.5 5h11L20 13v6H4zM4 13h5l1 2h4l1-2h5",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  shapes:
    "M8.3 10a.7.7 0 0 1-.63-1.1l3.7-6a.7.7 0 0 1 1.2 0l3.7 6a.7.7 0 0 1-.6 1.1zM3 14h7v7H3zM21 17.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
  notes: "M6 3h9l4 4v14H6zM9 9h6M9 13h6M9 17h3",
  repeat: "M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4",
  chart: "M4 20h16M6 16l4-5 3 3 5-7",
  alarm: "M19 13a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM12 10v3l2 2M5 4 3 6m16-2 2 2",
  bell: "M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  search: "M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm3 9-4-4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  left: "m15 6-6 6 6 6",
  right: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  play: "M8 5v14l11-7z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  stop: "M5 5h14v14H5z",
  check: "m5 12 4 4 10-10",
  plus: "M12 5v14M5 12h14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
} as const;

export type PreviewIconName = keyof typeof paths;

export function PreviewIcon({ name, size = 18 }: { name: PreviewIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
