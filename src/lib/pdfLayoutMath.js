// Pure layout & spread calculation helpers for WebPDF viewer panes.

const SPREAD_RESIZER_WIDTH = 8;
export const SPREAD_MIN_PCT = 22;
export const SPREAD_MAX_PCT = 78;

export function getSpreadStartPage(pageNum, coverOffset = false) {
  const p = Math.max(1, Number(pageNum) || 1);
  if (coverOffset) {
    if (p === 1) return 1;
    return p % 2 === 0 ? p : p - 1;
  }
  return p % 2 === 1 ? p : p - 1;
}

export function computePageTargetWidth(containerWidth, scale, isMobile) {
  const safeWidth = Math.max(containerWidth - (isMobile ? 16 : 36), 200);
  if (scale === 'fit-width') return safeWidth;
  if (scale === 'fit-page') return Math.min(safeWidth, 640);
  if (typeof scale === 'number') return Math.max(safeWidth * scale, 200);
  return safeWidth;
}

export function computeSpreadLayout(
  containerWidth,
  containerHeight,
  scale,
  spreadSplitRatio,
  defaultAspectRatio,
  isMobile
) {
  const safeContainerW = Math.max(containerWidth, 320);
  const colPadding = isMobile ? 10 : 28;
  const isZoomedIn = typeof scale === 'number' && scale > 1;
  const stageWidth = isZoomedIn ? Math.round(safeContainerW * scale) : safeContainerW;
  const innerTotal = Math.max(240, stageWidth - SPREAD_RESIZER_WIDTH);

  const clampedRatio = Math.max(SPREAD_MIN_PCT, Math.min(SPREAD_MAX_PCT, spreadSplitRatio));
  const leftSlotW = Math.max(110, Math.round(innerTotal * (clampedRatio / 100)));
  const rightSlotW = Math.max(110, innerTotal - leftSlotW);
  const leftSafeW = Math.max(96, leftSlotW - colPadding);
  const rightSafeW = Math.max(96, rightSlotW - colPadding);

  let leftTargetWidth = leftSafeW;
  let rightTargetWidth = rightSafeW;

  if (scale === 'fit-page') {
    const ratio = defaultAspectRatio || 1.414;
    const availH = Math.max(220, (containerHeight || 680) - 56);
    const baseFitW = Math.max(120, Math.floor(availH / ratio));
    leftTargetWidth = Math.min(leftSafeW, Math.max(96, Math.floor(baseFitW * (clampedRatio / 50))));
    rightTargetWidth = Math.min(rightSafeW, Math.max(96, Math.floor(baseFitW * ((100 - clampedRatio) / 50))));
  } else if (typeof scale === 'number' && scale <= 1) {
    leftTargetWidth = Math.max(96, Math.floor(leftSafeW * scale));
    rightTargetWidth = Math.max(96, Math.floor(rightSafeW * scale));
  }

  return {
    stageWidth,
    isZoomedIn,
    leftTargetWidth,
    rightTargetWidth,
    leftWidthFraction: Math.min(1, leftTargetWidth / Math.max(1, leftSafeW)),
    rightWidthFraction: Math.min(1, rightTargetWidth / Math.max(1, rightSafeW))
  };
}
