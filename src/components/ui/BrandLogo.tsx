import Image from 'next/image';

export function BrandLogo({ className = '', size = 'header' }: { className?: string; size?: 'header' | 'footer' }) {
  const width = size === 'footer'
    ? 'w-[clamp(14rem,24vw,22rem)]'
    : 'w-[clamp(8.5rem,14vw,11rem)]';

  return (
    <Image
      src="/syscode-logo.svg"
      alt="SysCode Software Solutions"
      width={560}
      height={155}
      unoptimized
      className={`block h-auto max-w-full ${width} ${className}`}
    />
  );
}
