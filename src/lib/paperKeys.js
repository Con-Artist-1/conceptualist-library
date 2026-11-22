// Canonical DOM-free paper key and view count helpers shared between React UI and Web Worker.

export function getPaperViewKey(file) {
  if (!file) return '';
  if (file.id && String(file.id).includes('|')) return file.id;
  if (file.spec && file.subject && file.unitCode && file.session) {
    return `${file.spec}|${file.subject}|${file.unitCode}|${file.variant || ''}|${file.session}`;
  }
  return file.docs?.QP?.path || file.siblings?.QP?.path || file.path || file.name || '';
}

export function isQuestionPaperEligibleForViews(file) {
  if (!file) return false;
  if (
    file.category === 'Books' ||
    file.category === 'IAL Books' ||
    file.category === 'IGCSE Books' ||
    file.docType === 'Book'
  ) {
    return true;
  }
  if (file.isUnifiedSitting) return Boolean(file.docs?.QP || file.docType === 'QP' || file.isPendingSkeleton);
  return file.docType === 'QP' || Boolean(file.docs?.QP);
}

export function getPaperTotalViews(file, viewsMap) {
  if (!file || !viewsMap) return 0;
  const key = getPaperViewKey(file);
  if (!key) return 0;
  const count = Number(viewsMap[key]);
  return Number.isFinite(count) && count > 0 ? count : 0;
}
