import type { Metadata } from 'next';
import { Mail, MapPin, Phone, MessageCircleMore } from 'lucide-react';
import { ContactForm } from '@/components/forms/ContactForm';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { company } from '@/config/company';
import { getSiteContent } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact SysCode Software Solutions for a website quote, custom software enquiry, or digital consultation in Sri Lanka.',
};

export default async function ContactPage() {
  const { packages } = await getSiteContent();
  return (
    <div className="site-container py-16 sm:py-24 lg:py-28">
      <SectionHeading as="h1"
        eyebrow="Contact"
        title="Let's talk about your next step."
        description="Have a business idea or need a professional website? Contact SysCode Software Solutions and get a quotation for your project."
      />

      <div className="mt-10 grid min-w-0 gap-10 sm:mt-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <aside className="min-w-0 space-y-4">
          <div className="premium-panel flex items-start gap-4 p-5 sm:p-6">
            <div className="premium-icon shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black">Email</p>
              <a href={`mailto:${company.email}`} className="mt-1 inline-flex min-h-11 max-w-full items-center break-words text-base text-black [overflow-wrap:anywhere] hover:text-orange-700">
                {company.email}
              </a>
            </div>
          </div>

          <div className="premium-panel flex items-start gap-4 p-5 sm:p-6">
            <div className="premium-icon shrink-0">
              <Phone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black">Phone</p>
              <p className="mt-2 break-words text-base text-black [overflow-wrap:anywhere]">{company.phone}</p>
            </div>
          </div>

          <div className="premium-panel flex items-start gap-4 p-5 sm:p-6">
            <div className="premium-icon shrink-0">
              <MessageCircleMore className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black">WhatsApp</p>
              <p className="mt-2 break-words text-base text-black [overflow-wrap:anywhere]">{company.whatsapp}</p>
            </div>
          </div>

          <div className="premium-panel flex items-start gap-4 p-5 sm:p-6">
            <div className="premium-icon shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black">Location</p>
              <p className="mt-2 break-words text-base leading-7 text-black [overflow-wrap:anywhere]">{company.location}</p>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <ContactForm packages={packages} />
        </div>
      </div>
    </div>
  );
}
