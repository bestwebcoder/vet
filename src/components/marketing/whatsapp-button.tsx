/**
 * A real click-to-chat link (wa.me — WhatsApp's own official URL scheme),
 * sourced from the organization's admin-editable WhatsApp number, never a
 * hardcoded number in code. Renders nothing when no number is set, same
 * fallback pattern as the hero image and doctor photos.
 */
export function WhatsAppButton({ whatsappNumber }: { whatsappNumber: string | null }) {
  if (!whatsappNumber) return null;

  const digits = whatsappNumber.replace(/[^0-9]/g, "");

  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed right-5 bottom-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-7" aria-hidden>
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.14c-.24.68-1.4 1.32-1.93 1.4-.5.08-1.13.11-1.82-.11-.42-.14-.96-.31-1.65-.61-2.9-1.25-4.8-4.16-4.94-4.35-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.44.29.15.46.13.63-.05.17-.19.72-.84.91-1.13.19-.29.38-.24.63-.14.26.1 1.63.77 1.91.91.29.15.48.22.55.34.07.13.07.75-.17 1.43Z" />
      </svg>
    </a>
  );
}
