export const company = {
  name: 'SysCode Software Solutions',
  tagline: 'Smart Digital Solutions for Growing Businesses.',
  shortName: 'SysCode',
  email: 'hello@syscode.dev',
  phone: '+94 700 000 000',
  whatsapp: '+94700000000',
  whatsappNumber: '+94700000000',
  location: 'Sri Lanka',
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  packages: {
    basic: 'Rs. 10,000',
    business: 'Rs. 25,000',
    premium: 'Rs. 45,000',
  },
  whatsappMessage:
    "Hello SysCode Software Solutions, I'm interested in developing a website. Can I get more details about your packages?",
};

export type NavigationItem = {
  label: string;
  href: string;
  sectionId: string;
  detailsHref?: string;
};

export const navItems: NavigationItem[] = [
  { label: 'Home', href: '/#home', sectionId: 'home' },
  { label: 'Services', href: '/#services', sectionId: 'services', detailsHref: '/services' },
  { label: 'About', href: '/#about', sectionId: 'about', detailsHref: '/about' },
  { label: 'Pricing', href: '/#pricing', sectionId: 'pricing', detailsHref: '/pricing' },
  { label: 'Portfolio', href: '/#portfolio', sectionId: 'portfolio', detailsHref: '/portfolio' },
  { label: 'FAQ', href: '/#faq', sectionId: 'faq' },
  { label: 'Contact', href: '/#contact', sectionId: 'contact', detailsHref: '/contact' },
];

export const socialLinks = {
  facebook: '',
  linkedin: '',
  instagram: '',
  github: '',
};
