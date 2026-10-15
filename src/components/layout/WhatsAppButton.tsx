import { MessageCircleMore } from 'lucide-react';
import { company } from '@/config/company';

export function WhatsAppButton() {
  const message = encodeURIComponent(company.whatsappMessage);
  const href = `https://wa.me/${company.whatsappNumber.replace('+', '')}?text=${message}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="motion-button group fixed right-3 bottom-[calc(1.25rem_+_env(safe-area-inset-bottom))] z-50 inline-flex h-11 w-11 items-center justify-center rounded-md border border-orange-200 bg-white text-orange-700 transition-colors hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:right-5"
      title="Chat With Us"
    >
      <MessageCircleMore className="h-5 w-5" />
    </a>
  );
}
