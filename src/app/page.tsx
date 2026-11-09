import { PublicHero, PublicToolList } from "@/components/PublicLanding";

export default function Home() {
  return (
    <div className="space-y-10">
      <PublicHero />
      <PublicToolList />
    </div>
  );
}
