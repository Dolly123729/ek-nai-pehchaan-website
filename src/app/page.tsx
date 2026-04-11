import Chatbot from "../components/Chatbot";

export default function Home() {
  return (
    <main className="landing-page">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Brigham Young University Hawaii</p>
          <h1>Admissions support with a BYUH-inspired red campus feel.</h1>
          <p className="hero-text">
            Explore admissions guidance, scholarships, deadlines, and next
            steps through a chatbot grounded in official BYUH admissions
            content.
          </p>

          <div className="hero-actions">
            <a
              className="primary-link"
              href="https://admissions.byuh.edu"
              target="_blank"
              rel="noopener"
            >
              Visit BYUH Admissions
            </a>
            <a className="secondary-link" href="#chatbot">
              Ask the chatbot
            </a>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-card-badge">BYUH Admissions Assistant</div>
          <h2>Find answers faster</h2>
          <ul className="hero-points">
            <li>Admission requirements and document help</li>
            <li>Scholarship and tuition guidance</li>
            <li>Answers grounded in official BYUH sources</li>
          </ul>
        </div>
      </section>

      <section className="info-strip">
        <div className="info-block">
          <span className="info-label">Focus</span>
          <strong>Official BYUH admissions content</strong>
        </div>
        <div className="info-block">
          <span className="info-label">Experience</span>
          <strong>Simple, friendly, red campus-inspired layout</strong>
        </div>
        <div className="info-block">
          <span className="info-label">Best use</span>
          <strong>Ask questions about applying, studying, and planning</strong>
        </div>
      </section>

      <section className="chat-section" id="chatbot">
        <div className="section-heading">
          <p className="eyebrow">Chat Support</p>
          <h2>Start a conversation with the BYUH admissions chatbot</h2>
        </div>

        <Chatbot />
      </section>
    </main>
  );
}
