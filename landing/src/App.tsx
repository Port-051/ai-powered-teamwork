import { useReveal } from "./hooks/useReveal";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import ProblemSection from "./components/ProblemSection";
import InMessengerAI from "./components/InMessengerAI";
import TeamKnowledge from "./components/TeamKnowledge";
import PersonalAI from "./components/PersonalAI";
import Trust from "./components/Trust";
import Benefits from "./components/Benefits";
import Faq from "./components/Faq";
import Footer from "./components/Footer";

export default function App() {
  useReveal();

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ProblemSection />
        <InMessengerAI />
        <TeamKnowledge />
        <PersonalAI />
        <Trust />
        <Benefits />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
