import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BrainADZ Hospitality OS',
    short_name: 'Hospitality OS',
    description: 'Registered-device hotel continuity and Master Hub operations.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f5ed',
    theme_color: '#6f8d70',
    orientation: 'any',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
