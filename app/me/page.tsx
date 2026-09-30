import { Suspense } from "react";
import { Footer, Nav } from "@/components/Chrome";
import MyPasses from "@/components/MyPasses";

export const metadata = { title: "Your passes · Rare Friends Pass", robots: { index: false } };

export default function Me() {
  return (
    <main>
      <Nav />
      <div className="wrap" style={{ padding: "44px 0 72px" }}>
        <Suspense fallback={<p className="muted">Loading your passes…</p>}>
          <MyPasses />
        </Suspense>
      </div>
      <Footer />
    </main>
  );
}
