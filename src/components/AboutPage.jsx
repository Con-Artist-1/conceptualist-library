import React from 'react';
import '../styles/secondary.css';

const AboutPage = ({ onGoHome }) => {
  return (
    <div className="about-container">
      <div className="about-card">
        <h1 className="about-title">About Conceptualist Systems</h1>
        <p className="about-lead">
          Conceptualist Systems is an independent academic resource platform dedicated to open, fast, and structured access to international examination materials.
        </p>

        <hr className="about-divider" />

        <div className="about-section">
          <h2>Who We Are</h2>
          <p>
            We are a team of educators and developers committed to indexing, organizing, and archiving examination resources for students and teachers worldwide.
          </p>
          <div className="team-grid">
            <div className="team-card">
              <div className="team-name">Nafiz.R</div>
              <div className="team-role">Founder &amp; Lead Architect</div>
            </div>
            <div className="team-card">
              <div className="team-name">Nazmul.K</div>
              <div className="team-role">Co-Founder &amp; Systems Lead</div>
            </div>
            <div className="team-card">
              <div className="team-name">Jemison Flaren</div>
              <div className="team-role">Systems Architect</div>
            </div>
            <div className="team-card">
              <div className="team-name">Gemin Arghen</div>
              <div className="team-role">Infrastructure Engineer</div>
            </div>
            <div className="team-card">
              <div className="team-name">Claudis Oppen</div>
              <div className="team-role">Research &amp; Intelligence Lead</div>
            </div>
            <div className="team-card">
              <div className="team-name">Gemin Fauré Hidrojen</div>
              <div className="team-role">Intern, Optimizer</div>
            </div>
          </div>
        </div>

        <div className="about-section">
          <h2>Our Mission</h2>
          <p>
            Navigating past papers, mark schemes, examiner reports, grade thresholds, inserts, and reference books should be effortless.
            Our platform indexes international examination qualifications — including Pearson Edexcel International A-Level (IAL) &amp; IGCSE and Cambridge International (CAIE) AS &amp; A Level, IGCSE, and O Level — into a fast, board-isolated study catalog.
          </p>
        </div>

        <div className="about-section">
          <h2>Non-Affiliation &amp; Educational Notice</h2>
          <p>
            Conceptualist Systems is an independent student study index and reader and is not affiliated with, endorsed by, sponsored by, or officially connected to Pearson plc / Edexcel or Cambridge University Press &amp; Assessment (CAIE). All trademarks and examination materials remain the property of their respective copyright holders and are provided strictly for personal revision and educational reference. Rights holders may contact us below for prompt removal.
          </p>
        </div>

        <div className="about-section">
          <h2>Contact & Inquiries</h2>
          <p>
            For resource submissions, feedback, or general inquiries, please contact us directly:
          </p>
          <div className="contact-box">
            <strong>Direct Email:</strong>{' '}
            <a href="mailto:diavlon.pxa@gmail.com">diavlon.pxa@gmail.com</a>
          </div>
        </div>

        <div style={{ marginTop: '28px' }}>
          <button
            type="button"
            className="search-button return-to-library-btn"
            onClick={onGoHome}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Return to Library Repository</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
