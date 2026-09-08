import { HotelPlatform } from './hotel-platform';
import { appMode } from '@/lib/server/app-mode';

export default function Home() {
  return <HotelPlatform appMode={appMode()} />;
}
