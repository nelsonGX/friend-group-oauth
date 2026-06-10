/**
 * Official Discord brand mark. lucide-react dropped brand icons, so the one
 * brand glyph we need lives here. Inherits color via `currentColor` and takes
 * the same props shape as a lucide icon (`size`, `className`).
 */
export function DiscordIcon({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M20.3 4.4c-1.5-.7-3-1.1-4.9-1.5-.2.4-.4.9-.6 1.2-1.8-.3-3.7-.3-5.5 0-.2-.4-.4-.9-.6-1.2-1.8.4-3.4.8-4.9 1.5C.5 9-.3 13.6.1 18.1c2 1.5 4 2.4 6 3 .5-.6.9-1.3 1.2-2-.7-.2-1.3-.5-1.9-.9.1-.1.3-.2.4-.3 3.9 1.8 8.2 1.8 12.1 0 .1.1.3.2.4.3-.6.4-1.2.7-1.9.9.4.7.8 1.4 1.2 2 2-.6 4-1.5 6-3 .6-5.2-.7-9.7-3.3-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-.9 2.4-2.2 2.4z" />
    </svg>
  );
}
