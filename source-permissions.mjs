// Shared by the refresh, build check and both news views. No publisher policy
// is inferred from an RSS URL or an article's destination hostname.
export function compileRegistry(document) {
  if (!Array.isArray(document?.sources)) throw new Error('Source permissions registry is missing sources.')
  const registry = new Map()
  for (const entry of document.sources) {
    if (!entry?.label || registry.has(entry.label)
      || !['permitted', 'link-only', 'excluded'].includes(entry.status)
      || !Array.isArray(entry.endpoints) || !Array.isArray(entry.permitted_fields)
      || !entry.evidence || !entry.attribution_required || !entry.retention
      || !entry.rate_limit || !entry.takedown_contact
      || !Number.isInteger(entry.max_excerpt_length) || entry.max_excerpt_length < 0) {
      throw new Error('Source permissions registry has an invalid or duplicate entry.')
    }
    if (entry.permitted_fields.some(field => !['headline', 'link', 'excerpt', 'image'].includes(field))
      || (entry.status !== 'permitted' && (entry.max_excerpt_length !== 0
        || entry.permitted_fields.some(field => ['excerpt', 'image'].includes(field))))
      || (entry.status === 'excluded' && entry.permitted_fields.length)
      || (entry.status === 'permitted' && (!/^https:\/\//.test(entry.evidence)
        || /permission unverified/i.test(entry.evidence)))) {
      throw new Error(`Inconsistent permissions for ${entry.label}.`)
    }
    for (const endpoint of entry.endpoints) {
      if (!/^https:\/\//.test(endpoint)) throw new Error(`Invalid endpoint for ${entry.label}.`)
    }
    registry.set(entry.label, entry)
  }
  return registry
}

export function acquisitionAllowed(source, registry) {
  const entry = registry.get(source.name)
  // Empty endpoints mean the exact collection route was not supplied/reviewed.
  return Boolean(entry && entry.status !== 'excluded' && entry.endpoints.includes(source.url))
}

export function applyFieldRules(article, registry) {
  const entry = registry.get(article?.source)
  if (!entry || entry.status === 'excluded') return null
  // A fixed output shape discards aliases such as content, description and
  // thumbnail too. Multiline archive headings sometimes contain copied prose.
  const result = {
    title: entry.permitted_fields.includes('headline') ? String(article.title || '').split(/\r?\n/)[0].trim() : '',
    url: entry.permitted_fields.includes('link') ? article.url : '',
    source: article.source,
    date: article.date,
    tags: article.tags,
    matching_tags: article.matching_tags,
    importance: article.importance,
    category: article.category,
  }
  if (entry.status === 'permitted' && entry.permitted_fields.includes('excerpt')) {
    result.summary = String(article.summary || '').slice(0, entry.max_excerpt_length)
  }
  if (entry.status === 'permitted' && entry.permitted_fields.includes('image') && article.image) result.image = article.image
  return result
}

export function assertPublishedItem(article, registry) {
  const entry = registry.get(article?.source)
  if (!entry || entry.status === 'excluded') throw new Error(`Unregistered or excluded published source: ${article?.source || 'missing'}.`)
  const clean = applyFieldRules(article, registry)
  const allowed = new Set(Object.keys(clean))
  for (const [field, value] of Object.entries(article)) {
    if (!allowed.has(field) && value !== '' && value != null) throw new Error(`Disallowed ${field} for ${entry.label}.`)
  }
  if (article.title !== clean.title || article.url !== clean.url
    || (article.summary || '') !== (clean.summary || '') || (article.image || '') !== (clean.image || '')) {
    throw new Error(`Disallowed publication fields for ${entry.label}.`)
  }
}
