export function classifyExternalResponse(status, original, destination=original) {
 if (status === 404 || status === 410) return 'broken';
 if (status < 200 || status >= 400 || (new URL(original).protocol === 'https:' && new URL(destination).protocol !== 'https:')) return 'unverified';
 return 'ok';
}
