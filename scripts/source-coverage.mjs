// Use precisely the same coverage policy as the public status notice.
import '../news-state.js'
export const { makeCoverage, validateCoverage, coverageMessage } = globalThis.KTPNewsState

export function coverageReport(coverage) {
  const checked = validateCoverage(coverage)
  return {
    level: checked.status === 'failed' ? 'error' : checked.status === 'degraded' ? 'warning' : 'notice',
    text: coverageMessage(checked) || `All ${checked.attempted} sources available.`,
    exitCode: checked.status === 'failed' ? 1 : 0,
  }
}

export function reportSourceStatus(coverage) {
  const report = coverageReport(coverage)
  console.log(`::${report.level} title=Routed feed source coverage::${report.text}`)
  return report
}
