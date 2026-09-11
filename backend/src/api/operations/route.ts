import { and, desc, eq, inArray } from 'drizzle-orm';
import { appUsers, auditLogs, damageReports, housekeepingTasks, inquiries, integrationEvents, inventoryItems, maintenanceTickets, restaurantMealBookings, restaurantOrders, rooms, travelAssets, travelDiscountRequests, travelPackages, customTravelPackageItems, customTravelPackages } from '@/db/schema';
import { getDb } from '@/db';
import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { roleCan } from '@hotel/shared/domain';
import { mutateOperations } from '@/modules/operations/service';
import { operationalSnapshot } from '@/modules/operations/workflows';

export async function GET(request:Request) {
  try {
    const c=await requireReservationContext(request),db=getDb(),propertyId=c.property.id,organisationId=c.actor.organisationId;
    const operational=c.actor.role==='HOUSEKEEPING'||roleCan(c.actor.role,'housekeeping.assign');
    const financial=roleCan(c.actor.role,'billing.view');
    const travel=roleCan(c.actor.role,'travel.read');
    const [housekeeping,housekeepingStaff,maintenance,inventory,orders,meals,damage,packages,assets,customPackages,customItems,discounts,leads,audit,integrations,extra]=await Promise.all([
      operational?db.select({id:housekeepingTasks.id,propertyId:housekeepingTasks.propertyId,roomId:housekeepingTasks.roomId,roomNumber:rooms.number,reservationId:housekeepingTasks.reservationId,assignedUserId:housekeepingTasks.assignedUserId,assignedTo:housekeepingTasks.assignedTo,taskType:housekeepingTasks.taskType,priority:housekeepingTasks.priority,status:housekeepingTasks.status,outcome:housekeepingTasks.outcome,scheduledAt:housekeepingTasks.scheduledAt,deferredUntil:housekeepingTasks.deferredUntil,completedAt:housekeepingTasks.completedAt,updatedAt:housekeepingTasks.updatedAt,version:housekeepingTasks.version,notes:housekeepingTasks.notes}).from(housekeepingTasks).innerJoin(rooms,eq(rooms.id,housekeepingTasks.roomId)).where(c.actor.role==='HOUSEKEEPING'?and(eq(housekeepingTasks.propertyId,propertyId),eq(housekeepingTasks.assignedUserId,c.actor.id)):eq(housekeepingTasks.propertyId,propertyId)).orderBy(desc(housekeepingTasks.scheduledAt)).limit(200):[],
      roleCan(c.actor.role,'housekeeping.assign')?db.select({id:appUsers.id,name:appUsers.displayName,legalName:appUsers.name,role:appUsers.role}).from(appUsers).where(and(eq(appUsers.organisationId,organisationId),eq(appUsers.propertyId,propertyId),eq(appUsers.role,'HOUSEKEEPING'),eq(appUsers.active,true))).then(rows=>rows.map(({id,name,legalName,role})=>({id,name:name??legalName,role}))):[],
      operational?db.select().from(maintenanceTickets).where(eq(maintenanceTickets.propertyId,propertyId)).orderBy(desc(maintenanceTickets.openedAt)).limit(200):[],
      roleCan(c.actor.role,'inventory.write')?db.select().from(inventoryItems).where(and(eq(inventoryItems.propertyId,propertyId),c.actor.role==='RESTAURANT'?eq(inventoryItems.department,'RESTAURANT'):undefined)).orderBy(desc(inventoryItems.updatedAt)).limit(500):[],
      roleCan(c.actor.role,'restaurant.manage')||financial?db.select().from(restaurantOrders).where(eq(restaurantOrders.propertyId,propertyId)).orderBy(desc(restaurantOrders.createdAt)).limit(200):[],
      roleCan(c.actor.role,'restaurant.manage')?db.select().from(restaurantMealBookings).where(eq(restaurantMealBookings.propertyId,propertyId)).orderBy(desc(restaurantMealBookings.serviceDate)).limit(200):[],
      roleCan(c.actor.role,'damage.read')?db.select().from(damageReports).where(eq(damageReports.propertyId,propertyId)).orderBy(desc(damageReports.reportedAt)).limit(100):[],
      travel?db.select().from(travelPackages).where(eq(travelPackages.organisationId,organisationId)).limit(200):[],
      travel?db.select().from(travelAssets).where(eq(travelAssets.organisationId,organisationId)).limit(500):[],
      travel?db.select().from(customTravelPackages).where(eq(customTravelPackages.organisationId,organisationId)).limit(200):[],
      travel?db.select().from(customTravelPackageItems).innerJoin(customTravelPackages,eq(customTravelPackageItems.packageId,customTravelPackages.id)).where(eq(customTravelPackages.organisationId,organisationId)).then(rows=>rows.map(row=>row.custom_travel_package_items)):[],
      travel?db.select().from(travelDiscountRequests).where(eq(travelDiscountRequests.organisationId,organisationId)).limit(200):[],
      travel?db.select().from(inquiries).where(eq(inquiries.organisationId,organisationId)).limit(500):[],
      roleCan(c.actor.role,'reports.read')?db.select().from(auditLogs).where(eq(auditLogs.propertyId,propertyId)).orderBy(desc(auditLogs.timestamp)).limit(250):[],
      ['OWNER','MANAGER'].includes(c.actor.role)?db.select().from(integrationEvents).where(and(eq(integrationEvents.propertyId,propertyId),inArray(integrationEvents.status,['PENDING','FAILED','RETRYING','SUCCESS']))).orderBy(desc(integrationEvents.createdAt)).limit(200):[],
      operationalSnapshot(c),
    ]);
    return apiJson({...extra,housekeeping,housekeepingStaff,maintenance,inventory,restaurantOrders:orders,restaurantMealBookings:meals,damageReports:damage,packages,travelAssets:assets,customPackages,customPackageItems:customItems,discountRequests:discounts,inquiries:leads,audit,integrations});
  } catch(error){return apiError(error);}
}

export async function POST(request: Request) {
  try { const context = await requireReservationContext(request); return apiJson(await mutateOperations(context, await request.json())); }
  catch (error) { return apiError(error); }
}
