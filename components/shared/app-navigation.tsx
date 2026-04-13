'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { href: string; label: string };

const links: NavLink[] = [
  { href: '/cpq', label: 'CPQ - Bike Builder' },
  { href: '/cpq/setup', label: 'CPQ - Setup' },
  { href: '/cpq/results', label: 'CPQ - Sampler Results' },
];

export default function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="tabs" aria-label="Primary navigation">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            className={`tab ${isActive ? 'tabActive' : ''}`}
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
