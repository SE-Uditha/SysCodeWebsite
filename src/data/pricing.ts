export type PricingTier = {
  id: string;
  name: string;
  startPrice: number;
  currency: 'LKR';
  description: string;
  audience: string;
  features: string[];
  cta: string;
  popular?: boolean;
  accent?: 'default' | 'popular' | 'premium';
};

export const pricingTiers: PricingTier[] = [
  {
    id: 'basic',
    name: 'Basic Website',
    startPrice: 10000,
    currency: 'LKR',
    description: 'Perfect for startups, individuals, and small businesses starting online.',
    audience: 'Startups, individuals, and small businesses.',
    features: [
      'Up to 3 pages',
      'Mobile responsive design',
      'Professional UI',
      'Contact form',
      'WhatsApp button',
      'Basic SEO setup',
      'Social media links',
      'Basic deployment assistance',
    ],
    cta: 'Choose Basic',
    accent: 'default',
  },
  {
    id: 'business',
    name: 'Business Website',
    startPrice: 25000,
    currency: 'LKR',
    description: 'Ideal for growing businesses that need a stronger online presence.',
    audience: 'Growing businesses needing a stronger online presence.',
    features: [
      'Up to 7 pages',
      'Customized design',
      'Mobile responsive',
      'Contact form',
      'WhatsApp integration',
      'Basic on-page SEO',
      'Google Maps integration',
      'Gallery',
      'Performance optimization',
      'Deployment assistance',
    ],
    cta: 'Choose Business',
    popular: true,
    accent: 'popular',
  },
  {
    id: 'premium',
    name: 'Premium Website',
    startPrice: 45000,
    currency: 'LKR',
    description: 'Advanced website experiences for businesses with broader goals.',
    audience: 'Businesses requiring advanced websites.',
    features: [
      'Up to 12 pages',
      'Premium custom UI/UX',
      'Advanced animations',
      'Content management capability',
      'Blog functionality',
      'SEO foundations',
      'Advanced contact forms',
      'Analytics integration',
      'Responsive design',
      'Deployment assistance',
    ],
    cta: 'Choose Premium',
    accent: 'premium',
  },
];

