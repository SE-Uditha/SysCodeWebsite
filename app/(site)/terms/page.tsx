import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Read the terms and conditions for websites and digital services from SysCode Software Solutions.',
};

export default function TermsPage() {
  return (
    <div className="site-container py-16 sm:py-24 lg:py-28">
      <SectionHeading as="h1" eyebrow="The details" title="Terms & Conditions" description="These terms and conditions explain our service expectations and client responsibilities." />

      <div className="premium-panel mt-10 max-w-[76ch] space-y-6 break-words p-6 leading-8 text-black/75 [overflow-wrap:anywhere] sm:p-10">
        <p>By using our services or contacting SysCode Software Solutions, you agree to the terms described below.</p>
        <p>Project pricing depends on the scope, complexity, timeline, and required features. Any package price shown is a starting value and may vary based on your requirements.</p>
        <p>Domain registration, hosting, payment gateway integration, and other third-party services are subject to their own terms and may be charged separately.</p>
        <p>We aim to deliver quality work based on clear project requirements, timelines, and approved content. Client feedback and approvals are important for smooth delivery.</p>
        <p>We reserve the right to revise timelines if additional requirements, delayed feedback, or changes are introduced during the project.</p>
        <p>All content, design work, and custom development created for a client remains subject to the agreement signed or accepted for the project and its related arrangements.</p>
      </div>
    </div>
  );
}
