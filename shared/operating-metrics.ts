type Row=Record<string,unknown>;
export function operatingMetrics(rooms:Row[],reservations:Row[],folios:Row[],operations:Row,today:string){
 const occupied=rooms.filter(r=>r.occupancyStatus==='OCCUPIED').length;
 const current=reservations.filter(r=>r.status==='CHECKED_IN');
 const maintenance=rooms.filter(r=>['MAINTENANCE','OUT_OF_ORDER','OUT_OF_SERVICE'].includes(String(r.operationalStatus))).length;
 const dirty=rooms.filter(r=>['DIRTY','VACANT_DIRTY'].includes(String(r.operationalStatus))).length;
 const ready=rooms.filter(r=>r.occupancyStatus==='VACANT'&&['CLEAN','READY','VACANT_CLEAN'].includes(String(r.operationalStatus))).length;
 const nightly=current.reduce((s,r)=>s+Number(r.nightlyRateRupees??0),0);
 return {totalRooms:rooms.length,occupiedRooms:occupied,occupancyPercent:rooms.length?Math.round(occupied/rooms.length*100):0,availableRooms:ready,readyRooms:ready,dirtyRooms:dirty,maintenanceRooms:maintenance,
 arrivalsToday:reservations.filter(r=>r.arrivalDate===today&&!['CANCELLED','NO_SHOW'].includes(String(r.status))).length,
 departuresToday:reservations.filter(r=>r.departureDate===today&&!['CANCELLED','NO_SHOW'].includes(String(r.status))).length,
 inHouseGuests:current.reduce((s,r)=>s+Number(r.adults??1)+Number(r.children??0),0),pendingPayments:folios.filter(f=>Number(f.outstandingRupees)>0).length,
 revenueRupees:folios.reduce((s,f)=>s+Number(f.totalRupees??0),0),adrRupees:current.length?Math.round(nightly/current.length):0,revParRupees:rooms.length?Math.round(nightly/rooms.length):0,
 lowStockCount:((operations.inventory as Row[])??[]).filter(r=>Number(r.currentQuantity)<=Number(r.minimumQuantity)).length,
 unresolvedMaintenance:((operations.maintenance as Row[])??[]).filter(r=>!['CLOSED','RESOLVED'].includes(String(r.status))).length,
 overdueFollowUps:((operations.followUps as Row[])??[]).filter(r=>r.status==='PENDING'&&String(r.dueAt).slice(0,10)<=today).length};
}
