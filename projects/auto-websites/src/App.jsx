import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Transform from "./components/Transform";
import Services from "./components/Services";
import Gallery from "./components/Gallery";
import Story from "./components/Story";
import Contact from "./components/Contact";
import CurveDivider from "./components/CurveDivider";

function App() {
  return (
    <div id="top" className="font-body">
      <Nav />
      <Hero />
      <Transform />
      <Services />
      <Gallery />
      <Story />
      <CurveDivider fill="var(--color-slate)" />
      <Contact />
      <footer className="bg-slate px-6 py-6 text-center text-sm text-limestone/60 sm:px-10">
        PB Home And Garden Design &middot; Farranree, Cork
      </footer>
    </div>
  );
}

export default App;
