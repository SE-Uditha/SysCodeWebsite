import type { Metadata } from 'next';
import { PricingCard } from '@/components/sections/PricingCard';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { getSiteContent } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'View SysCode pricing packages for small business websites, business websites, and premium website development in Sri Lanka.',
};

export default async function PricingPage() {
  const { packages } = await getSiteContent();
  const formatPrice = (price: number) => `Rs. ${new Intl.NumberFormat('en-LK').format(price)}`;
  const startingPrice = formatPrice(Math.min(...packages.map((tier) => tier.startPrice)));
  const features = [...new Map(packages.flatMap((tier) => tier.features).map((feature) => [feature.trim().toLocaleLowerCase(), feature])).entries()];
  const packageFeatures = packages.map((tier) => new Set(tier.features.map((feature) => feature.trim().toLocaleLowerCase())));
  return (
    <div className="site-container py-16 sm:py-24 lg:py-28">
      <AnimatedSection>
        <SectionHeading as="h1"
          eyebrow="Pricing"
          title="Clear packages. A confident next step."
          description={`Choose the perfect website package for your business. Start your online journey from ${startingPrice}.`}
        />
      </AnimatedSection>

      <div className="mt-10 grid min-w-0 gap-6 sm:mt-12 lg:grid-cols-3 2xl:gap-8">
        {packages.map((tier) => (
          <AnimatedSection key={tier.id} className="min-w-0">
            <PricingCard tier={tier} />
          </AnimatedSection>
        ))}
      </div>

      <AnimatedSection className="mt-16 min-w-0 border-t border-orange-100 pt-12 sm:mt-24 sm:pt-16">
        <SectionHeading eyebrow="At a glance" title="Compare the details." />
        <div className="premium-panel mt-9 min-w-0 overflow-hidden">
          <div role="region" aria-label="Website package comparison" tabIndex={0} className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[40rem] table-fixed text-left text-sm text-black [overflow-wrap:anywhere]">
              <caption className="sr-only">Features included in each website package</caption>
              <thead className="bg-gradient-to-r from-white to-orange-50/80 text-xs uppercase tracking-[0.12em] text-black">
                <tr>
                  <th scope="col" className="w-2/5 px-5 py-5 font-semibold">Feature</th>
                  {packages.map((tier) => (
                    <th key={tier.id} scope="col" className="min-w-36 break-words px-5 py-5 font-semibold">{tier.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <th scope="row" className="border-t border-orange-100 px-5 py-4 font-medium">Starting price</th>
                  {packages.map((tier) => <td key={tier.id} className="border-t border-orange-100 px-5 py-4">{formatPrice(tier.startPrice)}</td>)}
                </tr>
                {features.map(([featureKey, label]) => (
                  <tr key={featureKey} className="bg-white">
                    <th scope="row" className="border-t border-orange-100 px-5 py-4 font-medium">{label}</th>
                    {packages.map((tier, index) => (
                      <td key={tier.id} className="border-t border-orange-100 px-5 py-4">
                        {packageFeatures[index].has(featureKey) ? 'Included' : 'Not listed'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}
