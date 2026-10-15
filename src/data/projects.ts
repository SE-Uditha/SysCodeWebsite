export type ProjectCategory = 'Business Websites' | 'E-Commerce' | 'Web Applications' | 'POS Systems';

export type Project = {
  id: string;
  name: string;
  category: ProjectCategory;
  overview: string;
  demoUrl?: string;
  previewImageUrl?: string;
  technologies: string[];
  accent: string;
  gradient: string;
};

export const portfolioProjects: Project[] = [
  {
    id: 'harbor-legal',
    name: 'Harbor Legal',
    category: 'Business Websites',
    overview: 'Professional law firm site designed to build trust, highlight services, and capture client enquiries.',
    technologies: ['Next.js', 'Tailwind CSS', 'SEO'],
    accent: 'from-orange-500 to-orange-200',
    gradient: 'bg-gradient-to-br from-orange-100 via-orange-50 to-white',
  },
  {
    id: 'saffron-garden',
    name: 'Saffron Garden',
    category: 'E-Commerce',
    overview: 'Modern storefront concept for an organic food brand with product browsing and checkout-ready flows.',
    technologies: ['E-Commerce', 'Shop UI', 'Mobile-first'],
    accent: 'from-orange-400 to-orange-100',
    gradient: 'bg-gradient-to-br from-white via-orange-50 to-orange-100',
  },
  {
    id: 'fleetops',
    name: 'FleetOps',
    category: 'Web Applications',
    overview: 'Operations dashboard concept for vehicle tracking, job scheduling, and reporting workflows.',
    technologies: ['Dashboard', 'React', 'Reporting'],
    accent: 'from-orange-600 to-orange-200',
    gradient: 'bg-gradient-to-br from-orange-50 via-white to-orange-100',
  },
  {
    id: 'sunrise-pos',
    name: 'Sunrise POS',
    category: 'POS Systems',
    overview: 'Retail and point-of-sale concept with billing, stock tracking, and reporting modules.',
    technologies: ['POS', 'Inventory', 'Billing'],
    accent: 'from-orange-500 to-orange-100',
    gradient: 'bg-gradient-to-br from-orange-100 via-orange-50 to-white',
  },
  {
    id: 'peakstudio',
    name: 'Peak Studio',
    category: 'Business Websites',
    overview: 'Creative agency landing page concept focused on portfolio storytelling and enquiry conversion.',
    technologies: ['Branding', 'Landing Page', 'UI/UX'],
    accent: 'from-orange-400 to-orange-200',
    gradient: 'bg-gradient-to-br from-white via-orange-50 to-orange-100',
  },
  {
    id: 'luna-portal',
    name: 'Luna Portal',
    category: 'Web Applications',
    overview: 'Customer portal concept for support requests, account updates, and internal service management.',
    technologies: ['Portal', 'Authentication', 'Workflow'],
    accent: 'from-orange-600 to-orange-100',
    gradient: 'bg-gradient-to-br from-orange-50 via-white to-orange-100',
  },
];

export const projectFilters = ['All', 'Business Websites', 'E-Commerce', 'Web Applications', 'POS Systems'] as const;
