import { NavBar } from "@/components/layout/NavBar";
import { Hero } from "./(sections)/Hero";
import { Terminal } from "./(sections)/Terminal";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <>
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-20 py-12 md:py-24">
        <Hero />
        <Terminal />
      </main>
      <Footer />
    </>
  );
}
