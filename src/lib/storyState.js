export function invalidatePageTranslations(translations, pageIndex) {
  const next = {};
  for (const [language, values] of Object.entries(translations || {})) {
    next[language] = Array.isArray(values) ? values.map((value, index) => index === pageIndex ? undefined : value) : values;
  }
  return next;
}

export const shouldSyncCoverForPage = (pageIndex) => pageIndex === 0;
