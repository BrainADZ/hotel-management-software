import { describe, expect, it, vi } from 'vitest';
import { buildNotifications } from './notifications';
import { operatingMetrics } from './operating-metrics';
import { loadReservationPages } from './load-reservations';
import { routeProductionCommand } from './production-command-routing';
import { roleCan, type AppRole } from '@hotel/shared/domain';

const snapshot = { actor: { role: 'OWNER' as AppRole }, housekeeping: [{ id: 'task', roomNumber: '101', status: 'UNASSIGNED', version: 1 }], inventory: [{ id: 'item', name: 'Towels', currentQuantity: 2, minimumQuantity: 3 }], maintenance: [{ id: 'ticket', issue: 'Leak', status: 'OPEN' }], restaurantOrders: [{ id: 'order', roomNumber: '101', status: 'PENDING' }], damageReports: [{ id: 'damage', status: 'PENDING_REVIEW', description: 'Broken lamp' }], followUps: [] };

describe('operational alerts and permissions', () => {
  it('shows actionable operational alerts to the owner', () => {
    expect(buildNotifications(snapshot).map(n => n.view)).toEqual(['Housekeeping', 'Inventory', 'Maintenance', 'Restaurant Orders', 'Overview']);
  });
  it.each(['HOUSEKEEPING', 'RECEPTION'] as AppRole[])('does not expose financial, stock or restaurant alerts to %s', role => {
    expect(buildNotifications({...snapshot, actor:{role}}).map(n => n.view)).toEqual(['Housekeeping']);
  });
  it('removes resolved work and changes identity when an order advances', () => {
    expect(buildNotifications({...snapshot, housekeeping:[{status:'COMPLETED'}], inventory:[], maintenance:[], restaurantOrders:[], damageReports:[]})).toEqual([]);
    const first=buildNotifications({...snapshot,restaurantOrders:[{id:'order',version:1,status:'PENDING'}]}).find(n=>n.view==='Restaurant Orders');
    const next=buildNotifications({...snapshot,restaurantOrders:[{id:'order',version:2,status:'READY'}]}).find(n=>n.view==='Restaurant Orders');
    expect(first?.id).not.toBe(next?.id);
  });
  it('restricts account administration to owners while preserving reception assignment', () => {
    expect(roleCan('OWNER','staff.manage')).toBe(true);
    expect(roleCan('MANAGER','staff.manage')).toBe(false);
    expect(roleCan('RECEPTION','housekeeping.assign')).toBe(true);
    expect(roleCan('RESTAURANT','rooms.manage')).toBe(false);
  });
});

describe('live operating data', () => {
  it('counts vacant clean rooms separately from dirty and maintenance rooms', () => {
    const result=operatingMetrics([{occupancyStatus:'OCCUPIED',operationalStatus:'CLEAN'},{occupancyStatus:'VACANT',operationalStatus:'CLEAN'},{occupancyStatus:'VACANT',operationalStatus:'VACANT_DIRTY'},{occupancyStatus:'VACANT',operationalStatus:'MAINTENANCE'}],[{status:'CHECKED_IN',arrivalDate:'2026-09-11',departureDate:'2026-09-12',adults:2,children:1,nightlyRateRupees:2000},{status:'CANCELLED',arrivalDate:'2026-09-11'}],[{totalRupees:5000,outstandingRupees:2000}],{},'2026-09-11');
    expect(result).toMatchObject({totalRooms:4,occupiedRooms:1,occupancyPercent:25,readyRooms:1,dirtyRooms:1,maintenanceRooms:1,inHouseGuests:3,arrivalsToday:1,pendingPayments:1,adrRupees:2000,revParRupees:500});
  });
  it('loads reservations beyond the first page', async () => {
    const api=vi.fn().mockResolvedValueOnce({items:Array.from({length:100},(_,id)=>({id})),total:102}).mockResolvedValueOnce({items:[{id:100},{id:101}],total:102});
    expect((await loadReservationPages(api)).items).toHaveLength(102);
    expect(api).toHaveBeenLastCalledWith('/api/reservations?pageSize=100&page=2');
  });
  it.each(['SAVE_MENU_ITEM','SAVE_STAFF','SAVE_ROOM','CREATE_MAINTENANCE','RESOLVE_MAINTENANCE','MOVE_STOCK','CREATE_HOUSEKEEPING_TASK','CREATE_RESTAURANT_ORDER','UPDATE_RESTAURANT_ORDER','RECORD_LOST_ITEM','RELEASE_LOST_ITEM','BOOK_MEAL','SERVE_MEAL','SAVE_PROPERTY'])('routes %s to authenticated operations', action => {
    expect(routeProductionCommand({action}).path).toBe('/api/operations');
  });
});
