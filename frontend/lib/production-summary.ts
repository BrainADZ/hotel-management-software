import { operatingMetrics } from '@hotel/shared/domain';
type Row = Record<string, unknown>;

export function productionSummary(property: Row, rooms: Row[], reservations: Row[], folios: Row[], operations: Row, now = new Date()) {
  const rows = (key: string) => (operations[key] as Row[] | undefined) ?? [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: String(property.timezone ?? 'Asia/Kolkata') }).format(now);
  const openInquiries = rows('inquiries').filter(row => !['CONVERTED', 'LOST', 'CLOSED'].includes(String(row.status)));
  return {
    metrics: (operations.dashboardMetrics as ReturnType<typeof operatingMetrics> | undefined) ?? operatingMetrics(rooms, reservations, folios, operations, today),
    travelMetrics: {
      activePackages: rows('packages').filter(row => row.status === 'ACTIVE').length,
      openInquiries: openInquiries.length,
      pipelineValueRupees: openInquiries.reduce((sum, row) => sum + Number(row.estimatedValueRupees ?? 0), 0),
      customQuotes: rows('customPackages').length,
      pendingApprovals: rows('discountRequests').filter(row => row.status === 'PENDING').length,
      overdueFollowUps: rows('followUps').filter(row => row.status === 'PENDING' && Date.parse(String(row.dueAt)) < now.getTime()).length,
    },
    offlineBills: rows('offlineBills'),
  };
}
