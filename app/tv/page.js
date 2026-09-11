import ProjectionReceiver from "./ProjectionReceiver";

export const metadata = {
  title: "הקרנה — Judo Trainer",
  manifest: "/tv-manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080a10",
};

export default function TvPage() {
  return <ProjectionReceiver />;
}
