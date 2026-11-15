// 0 is acceptance, 1 is a confirmed failure, 2 needs further verification.
export function crawlExitCode(report) {
    if (report.broken > 0 || report.unsafe > 0) return 1;
    const fields = ['destinations', 'inactiveSources', 'reachable', 'broken', 'unsafe', 'unverified'];
    if (fields.some(key => !Number.isSafeInteger(report[key]) || report[key] < 0)) return 2;
    if (!report.destinations || report.inactiveSources || report.unverified) return 2;
    return report.reachable === report.destinations ? 0 : 2;
}
