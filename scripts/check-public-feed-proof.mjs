import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assessRoutedFeedFreshness } from './check-routed-feed-freshness.mjs';
export const DESTINATION = 'https://koltregaskesphotography.com/news-digests/news-feed-latest.json';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export async function collectFeedProof(expected, { now = new Date(), fetchImpl = fetch, runUrl = null, head = null } = {}) {
 const report = { checkedAt: new Date(now).toISOString(), runUrl, head, destination: DESTINATION, status:'unverified', failureAlert:'Existing GitHub failed-run notification; recipient delivery is not verified by this check', empty: null, generatedAt:null, newestSourceAt:null };
 try {
  const feed = JSON.parse(expected.toString());
  const assessment = assessRoutedFeedFreshness(feed, now);
  report.generatedAt = assessment.generatedAt;
  report.empty = feed.articles.length === 0;
  report.articleCount = feed.articles.length;
  report.sourceTimestampBasis = 'feed.articles[].date as declared by the fetched sources, not independently authenticated';
  report.newestSourceAt = report.empty ? null : assessment.newestItemAt;
  report.committedSha256 = digest(expected);
  if(assessment.warn) throw new Error('Committed generation is at least 24 hours old');
  const response = await fetchImpl(DESTINATION, {redirect:'error',signal:AbortSignal.timeout(15000), headers:{'cache-control':'no-cache'}});
  report.http = response.status;
  if(!response.ok || (response.url && response.url !== DESTINATION)) { await response.body?.cancel(); throw new Error('Public feed HTTP status or destination is unverified'); }
  const bytes = Buffer.from(await response.arrayBuffer());
  report.publicSha256 = digest(bytes);
  if(report.publicSha256 !== report.committedSha256) throw new Error('Public feed does not match committed feed');
  report.status='match';
 } catch(error) {
  // Fixed reasons only. Do not print responses, source titles, query strings or
  // exception text from the network/provider in an operational report.
  report.reason = ['Committed generation is at least 24 hours old','Public feed HTTP status or destination is unverified','Public feed does not match committed feed'].includes(error.message) ? error.message : 'Feed validation or public readback failed';
 }
 return report;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const report = await collectFeedProof(await fs.readFile('news-digests/news-feed-latest.json'), {runUrl: process.env.GITHUB_RUN_ID ? 'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID : null, head: process.env.GITHUB_SHA || null});
 const output = process.argv[2];
 if(output) { await fs.mkdir(new URL('.', pathToFileURL(output)),{recursive:true}); await fs.writeFile(output,JSON.stringify(report,null,2)+'\n'); }
 console.log(JSON.stringify(report));
 if(report.status!=='match') process.exitCode=1;
}
