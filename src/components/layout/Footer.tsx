import Link from 'next/link';
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { company } from '@/config/company';
import { BrandLogo } from '@/components/ui/BrandLogo';

export async function Footer() {
  'use cache';

  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/40 bg-brand font-heading font-semibold text-white">
      <div className="site-container pt-12 pb-7 sm:pt-16 sm:pb-8">
        <div className="grid min-w-0 gap-x-6 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-4 lg:gap-x-10 [&>div]:min-w-0">
          <div className="min-[480px]:col-span-2">
            <Link href="/#home" className="mb-6 inline-flex min-h-11 max-w-full items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-950">
              <BrandLogo size="footer" />
            </Link>
            <p className="max-w-[32ch] text-base leading-7 text-white [overflow-wrap:anywhere] sm:text-lg sm:leading-8">{company.tagline}</p>
            <Link href="/#contact" className="mt-6 inline-flex min-h-11 items-center gap-3 rounded-full border border-white/40 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-950">
              Let’s build something great <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </div>

          <div>
            <h3 className="mb-5 border-b border-white/30 pb-4 text-xs font-bold tracking-[0.16em] text-white uppercase">What we build</h3>
            <ul className="space-y-3 text-sm leading-6 [overflow-wrap:anywhere] min-[1600px]:text-base">
              <li>Website Development</li>
              <li>E-Commerce</li>
              <li>Custom Software</li>
              <li>POS Systems</li>
              <li>Website Maintenance</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-5 border-b border-white/30 pb-4 text-xs font-bold tracking-[0.16em] text-white uppercase">Let’s connect</h3>
            <ul className="space-y-3 text-sm leading-6 [overflow-wrap:anywhere] min-[1600px]:text-base">
              <li><a href={`mailto:${company.email}`} className="flex min-h-8 items-start gap-2 rounded-sm underline-offset-4 hover:underline"><Mail className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><span>{company.email}</span></a></li>
              <li><a href={`tel:${company.phone.replace(/\s/g, '')}`} className="flex min-h-8 items-start gap-2 rounded-sm underline-offset-4 hover:underline"><Phone className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><span>{company.phone}</span></a></li>
              <li><a href={`https://wa.me/${company.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-start gap-2 rounded-sm underline-offset-4 hover:underline">WhatsApp <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /></a></li>
              <li className="flex items-start gap-2"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><span>{company.location}</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex min-w-0 flex-col items-start justify-between gap-3 border-t border-white/30 pt-6 sm:mt-14 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="min-w-0 max-w-[55ch] text-sm leading-6 text-white [overflow-wrap:anywhere]">© {year} SysCode Software Solutions. All Rights Reserved.</p>
          <div className="flex min-w-0 max-w-full flex-wrap gap-x-5 gap-y-1 text-sm text-white">
            <Link href="/privacy-policy" className="inline-flex min-h-11 max-w-full items-center rounded-sm px-2 font-bold text-white transition-colors hover:bg-orange-700 hover:text-white focus-visible:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-950">
              Privacy Policy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 max-w-full items-center rounded-sm px-2 font-bold text-white transition-colors hover:bg-orange-700 hover:text-white focus-visible:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-950">
              Terms & Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
