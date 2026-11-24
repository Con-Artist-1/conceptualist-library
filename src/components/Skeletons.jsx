import React from 'react';

// Skeleton Loader for PDF Document Pane (Modal & Deep Links)
export const PdfPaneSkeleton = ({ title, subtitle }) => (
  <div className="pdf-skeleton-wrapper" role="status" aria-live="polite">
    <div className="pdf-skeleton-sheet">
      <div className="pdf-skeleton-top-bar">
        <div className="skeleton-shimmer" style={{ width: '140px', height: '14px' }} />
        <div className="skeleton-shimmer" style={{ width: '90px', height: '14px' }} />
      </div>
      <div className="pdf-skeleton-header-box">
        <div className="skeleton-shimmer" style={{ width: '68%', height: '20px', marginBottom: '10px' }} />
        <div className="skeleton-shimmer" style={{ width: '46%', height: '13px' }} />
      </div>
      <div className="pdf-skeleton-questions">
        {[1, 2, 3].map((q) => (
          <div key={q} className="pdf-skeleton-q-block">
            <div className="skeleton-shimmer" style={{ width: '32px', height: '14px', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="skeleton-shimmer" style={{ width: '94%', height: '12px' }} />
              <div className="skeleton-shimmer" style={{ width: '82%', height: '12px' }} />
              <div className="skeleton-shimmer" style={{ width: '60%', height: '12px' }} />
              <div className="pdf-skeleton-lines" />
            </div>
          </div>
        ))}
      </div>
      <div className="pdf-skeleton-status-pill">
        <span className="pdf-skeleton-spinner" />
        <span>{title || 'Loading Examination PDF...'}</span>
        {subtitle && <small style={{ marginLeft: 6, opacity: 0.8 }}>{subtitle}</small>}
      </div>
    </div>
  </div>
);

// Skeleton Loader for Archive Table Pages (/ial, /igcse, /subject, /unit, /textbooks)
export const TableSkeletonLoader = ({ rows = 8, viewMode = 'unified' }) => (
  <div className="file-list skeleton-table-container" role="status" aria-label="Loading examination papers">
    <table className="file-table">
      <thead>
        <tr>
          <th scope="col" className="col-sitting" style={{ width: viewMode === 'unified' ? '40%' : '50%' }}>
            {viewMode === 'unified' ? 'Exam Sitting / Resource' : 'Document'}
          </th>
          <th scope="col" className="col-series" style={{ width: viewMode === 'unified' ? '19%' : '26%' }}>Course &amp; Session</th>
          <th scope="col" className="col-actions" style={{ width: viewMode === 'unified' ? '41%' : '24%' }}>
            {viewMode === 'unified' ? 'Open Paper / Mark Scheme / Report' : 'Type & Quick Links'}
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, idx) => (
          <tr key={idx} className="skeleton-table-row">
            <td className="file-title-cell">
              <div className="skeleton-shimmer" style={{ width: `${68 - (idx % 3) * 8}%`, height: '16px', marginBottom: '7px' }} />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div className="skeleton-shimmer" style={{ width: '180px', height: '12px' }} />
                <div className="skeleton-shimmer" style={{ width: '95px', height: '12px' }} />
              </div>
            </td>
            <td>
              <div className="skeleton-shimmer" style={{ width: '75%', height: '14px', marginBottom: '6px' }} />
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div className="skeleton-shimmer" style={{ width: '38px', height: '14px' }} />
                <div className="skeleton-shimmer" style={{ width: '88px', height: '14px' }} />
              </div>
            </td>
            <td>
              <div className="unified-actions-cell">
                <div className="skeleton-shimmer" style={{ width: '58px', height: '26px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ width: '108px', height: '26px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ width: '104px', height: '26px', borderRadius: '3px' }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
