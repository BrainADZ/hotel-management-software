import {expect,it} from 'vitest';
import {productionSummary} from './production-summary';

it('preserves authoritative reporting totals and reconciled bills in the application state',()=>{
 const metrics={totalRooms:24,revenuePaise:450000};const bills=[{id:'bill',status:'MATCHED'}];
 const summary=productionSummary({},[],[],[],{dashboardMetrics:metrics,offlineBills:bills});
 expect(summary.metrics).toBe(metrics);expect(summary.offlineBills).toBe(bills);
});
it('counts only open travel leads and pending approvals',()=>{
 const summary=productionSummary({},[],[],[],{packages:[{status:'ACTIVE'}],inquiries:[{status:'NEW',estimatedValuePaise:5000},{status:'CONVERTED',estimatedValuePaise:9000}],discountRequests:[{status:'PENDING'},{status:'APPROVED'}],followUps:[{status:'PENDING',dueAt:'2026-01-01T00:00:00Z'},{status:'COMPLETED',dueAt:'2026-01-01T00:00:00Z'}]},new Date('2026-02-01T00:00:00Z'));
 expect(summary.travelMetrics).toMatchObject({activePackages:1,openInquiries:1,pipelineValuePaise:5000,pendingApprovals:1,overdueFollowUps:1});
});
