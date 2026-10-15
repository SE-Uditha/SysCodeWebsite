import { BadgeCheck, Boxes, BrushCleaning, CreditCard, LayoutDashboard, ShoppingCart, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type Service = {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  features: string[];
  bestFor: string[];
  technologies: string[];
  icon: LucideIcon;
};

export const services: Service[] = [
  {
    id: 'business-websites',
    title: 'Business Website Development',
    shortDescription: 'Professional websites that present your brand and convert visitors into customers.',
    description:
      'We design and build business websites that give your company a strong digital presence, clear value proposition, and professional online identity.',
    features: ['Up to 3–7 pages', 'Responsive layouts', 'Contact and WhatsApp integration', 'SEO-ready structure'],
    bestFor: ['Startups', 'Service providers', 'Retail businesses', 'Professional firms'],
    technologies: ['Next.js', 'Tailwind CSS', 'SEO', 'Performance'],
    icon: LayoutDashboard,
  },
  {
    id: 'ecommerce',
    title: 'E-Commerce Development',
    shortDescription: 'Online stores built for product sales, conversions, and smooth customer experience.',
    description:
      'From boutique shops to online product catalogs, we create storefronts that are easy to navigate and designed to support digital sales.',
    features: ['Product catalogs', 'Cart and checkout flow', 'Order tracking', 'Mobile-first buying experience'],
    bestFor: ['Retail shops', 'Boutiques', 'Product sellers', 'Local brands'],
    technologies: ['Next.js', 'Payment flow', 'Product CMS', 'UI/UX'],
    icon: ShoppingCart,
  },
  {
    id: 'custom-software',
    title: 'Custom Software Development',
    shortDescription: 'Tailored systems built to solve real operational challenges for your business.',
    description:
      'We develop custom web applications and internal tools that simplify business operations, save time, and improve productivity.',
    features: ['Business dashboards', 'Booking systems', 'Client portals', 'Operational workflows'],
    bestFor: ['Growing businesses', 'Schools', 'Agencies', 'Operations teams'],
    technologies: ['React', 'Node.js', 'MySQL', 'Custom APIs'],
    icon: Boxes,
  },
  {
    id: 'pos-systems',
    title: 'POS System Development',
    shortDescription: 'Sales and inventory systems designed for retail and service businesses.',
    description:
      'We build practical point-of-sale systems that help businesses manage sales, inventory, and reports with better control and speed.',
    features: ['Sales tracking', 'Inventory management', 'Receipts and billing', 'User roles'],
    bestFor: ['Shops', 'Restaurants', 'Beauty salons', 'Retail stores'],
    technologies: ['Web POS', 'Inventory', 'Billing', 'Reporting'],
    icon: CreditCard,
  },
  {
    id: 'redesign',
    title: 'Website Redesign',
    shortDescription: 'Modernize outdated websites with improved layout, speed, and customer experience.',
    description:
      'We refresh older websites with contemporary design systems, better mobile usability, improved messaging, and stronger conversion paths.',
    features: ['Modern UI refresh', 'Improved structure', 'Mobile optimization', 'Better user flow'],
    bestFor: ['Established businesses', 'Service websites', 'Local brands', 'Leaders in transition'],
    technologies: ['UX audit', 'Responsive design', 'Performance', 'Content updates'],
    icon: BrushCleaning,
  },
  {
    id: 'maintenance',
    title: 'Website Maintenance & Support',
    shortDescription: 'Reliable technical support to keep your site secure, fast, and up to date.',
    description:
      'Our support plans help businesses keep systems stable with ongoing updates, content changes, bug fixes, and performance improvements.',
    features: ['Security updates', 'Bug fixes', 'Speed optimization', 'Content updates'],
    bestFor: ['Active businesses', 'E-commerce shops', 'Content sites', 'Digital operations'],
    technologies: ['Monitoring', 'Maintenance', 'Uptime support', 'SEO checks'],
    icon: Wrench,
  },
];

export const reasons = [
  {
    title: 'Affordable Solutions',
    description: 'Clear website packages to suit your business and budget.',
    icon: Sparkles,
  },
  {
    title: 'Modern Technologies',
    description: 'Built using reliable and modern web technologies.',
    icon: BadgeCheck,
  },
  {
    title: 'Mobile-First Design',
    description: 'Excellent website experience across smartphones, tablets, and computers.',
    icon: LayoutDashboard,
  },
  {
    title: 'Custom Development',
    description: 'Solutions designed for your business requirements.',
    icon: Boxes,
  },
  {
    title: 'Performance Focused',
    description: 'Websites designed for speed, usability, and scalability.',
    icon: Sparkles,
  },
  {
    title: 'Customer Support',
    description: 'Technical assistance to help keep your website running smoothly.',
    icon: Wrench,
  },
];
