import HomeChooser from './HomeChooser';

export const metadata = {
  title: 'Judo BGU Trainer',
  manifest: '/home-manifest.json',
};

export default function Home() {
  return <HomeChooser />;
}
