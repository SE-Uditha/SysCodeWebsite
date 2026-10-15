import type { Metadata } from 'next';
import { PortfolioGallery } from '@/components/sections/PortfolioGallery';
import { getSiteContent } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Explore SysCode project concepts and live demos for business websites, online stores, and custom software.',
};

export default async function PortfolioPage() {
  const { projects } = await getSiteContent();
  return <PortfolioGallery projects={projects} />;
}
