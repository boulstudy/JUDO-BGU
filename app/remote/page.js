import RemoteControl from './RemoteControl';

export const metadata = {
  title: 'שלט אימון — Judo BGU',
  manifest: '/remote-manifest.json',
};

export default function RemotePage() {
  return <RemoteControl />;
}
