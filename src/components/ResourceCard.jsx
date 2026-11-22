import React from 'react';
import { formatBytes } from '../lib/libraryHelpers.js';

/**
 * Fallback download card rendered inside PreviewModal for non-PDF / non-audio archives
 * such as IT/CS Practical Data Files (.zip) or Word documents.
 */
export function ResourceCard({ singleTitle, currentDoc, singleExt, downloadUrl }) {
  return (
    <div className="modal-resource-card">
      <div className="modal-resource-box">
        <h3>{singleTitle}</h3>
        <p>{currentDoc.name || currentDoc.path}</p>
        <a
          href={downloadUrl}
          rel="noopener noreferrer"
          download
          className="modal-download-btn"
        >
          Download {singleExt.toUpperCase()} Resource ({formatBytes(currentDoc.size)})
        </a>
      </div>
    </div>
  );
}
