import ClubDetail from './ClubDetail';

export const metadata = {
  title: 'ניהול מועדון — Judo BGU',
};

export default function ClubDetailPage({ params }) {
  return <ClubDetail clubId={params.id} />;
}
