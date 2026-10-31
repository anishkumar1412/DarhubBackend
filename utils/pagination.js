/**
 * Page / page-size from a request, never trusted as-is: a missing or invalid page is 1, a missing or invalid size is
 * the endpoint's default, and no size can exceed MAX_PAGE_SIZE (a request for limit=1000000 used to load the whole
 * table into memory).
 */
export const MAX_PAGE_SIZE = 100;

export const clampPage = (value) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

export const clampLimit = (value, fallback = 20, max = MAX_PAGE_SIZE) => {
  const n = parseInt(value, 10);
  return Math.min(Number.isInteger(n) && n > 0 ? n : fallback, max);
};
