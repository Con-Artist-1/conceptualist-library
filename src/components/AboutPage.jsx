import React, { useState } from 'react';
import '../styles/secondary.css';
import { getArchiveCounts } from '../lib/routeCore.js';

const CITATION_HTML_SNIPPET = '<a href="https://www.conceptualist.uk/">Conceptualist Systems: International Exam Archive</a>';

const AboutPage = ({ meta = null, onGoHome }) => {
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const { uniqueFiles, totalFiles, totalBooks, audioCount, dfCount } = getArchiveCounts(meta);

  const handleCopySnippet = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(CITATION_HTML_SNIPPET).then(() => {
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 2000);
      }).catch(() => {});
    }
  };

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
          <h2>Our Mission &amp; Archive Scope</h2>
          <p>
            Finding paired past papers, mark schemes, examiner reports, grade thresholds, inserts, and reference books should take seconds, not dozens of tabs.
            Conceptualist Systems indexes <strong>{uniqueFiles.toLocaleString()}</strong> unique international examination resources ({totalFiles.toLocaleString()} total archived files) across 169 subjects, covering Pearson Edexcel International A-Level (IAL) &amp; IGCSE and Cambridge International (CAIE) AS &amp; A Level, IGCSE, and O Level, alongside <strong>{totalBooks}</strong> textbooks &amp; Solution Banks, <strong>{audioCount}</strong> listening audio tracks, and <strong>{dfCount}</strong> practical data packs.
          </p>
        </div>

        <div className="about-section">
          <h2>Cite or Link to Conceptualist Systems</h2>
          <p>
            Teachers, study guides, and student communities may link directly to the archive homepage using the verified brand citation below:
          </p>
          <div className="cite-snippet-box">
            <code>{CITATION_HTML_SNIPPET}</code>
            <button type="button" className="cite-copy-btn" onClick={handleCopySnippet}>
              {copiedSnippet ? 'Copied' : 'Copy HTML'}
            </button>
          </div>
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
