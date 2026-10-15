import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Read the privacy policy for SysCode Software Solutions website and contact inquiries.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="site-container py-16 sm:py-24 lg:py-28">
      <SectionHeading as="h1" eyebrow="The details" title="Privacy Policy" description="This privacy policy explains how we handle information you share through our website and contact forms." />

      <div className="premium-panel mt-10 max-w-[76ch] space-y-6 break-words p-6 leading-8 text-black/75 [overflow-wrap:anywhere] sm:p-10">
        <p>SysCode Software Solutions respects your privacy and is committed to protecting personal information shared through our website.</p>
        <p>We may collect information such as your name, email address, phone number, and project details when you submit an enquiry through our contact form.</p>
        <p>This information is used only to respond to your enquiry, understand your requirements, and provide relevant information about our services.</p>
        <p>We do not sell or rent personal data to third parties. Information may be shared only with trusted service providers that help us operate our website and communicate with clients, where required.</p>
        <p>We use reasonable security practices to protect submitted information and ensure that contact form data is handled responsibly.</p>
        <p>By using this website, you consent to the collection and use of your information as described above.</p>
      </div>
    </div>
  );
}
