"use client";
import {offlineDb,cacheCloudPayload} from './offline-db';
import {roleCan} from '@hotel/shared/domain';
import type {DemoState} from '@/app/hotel-platform';
const KEY='production-offline-session';
const MAX_AGE=8*60*60*1000;
type Snapshot={state:DemoState;expiresAt:number};

export function validOfflineSnapshot(value:unknown,now=Date.now()):value is Snapshot{
 if(!value||typeof value!=='object')return false;
 const row=value as Partial<Snapshot>,state=row.state;
 return Boolean(typeof row.expiresAt==='number'&&row.expiresAt>now&&state?.sandbox.mode==='PRODUCTION'&&state.businessUnit==='HOTEL'&&state.organisationId&&state.property.id&&state.actor.id&&['OWNER','MANAGER','RECEPTION','HOUSEKEEPING'].includes(state.actor.role));
}
export async function readProductionOffline(){
 const value=(await offlineDb.syncMetadata.get(KEY))?.value;
 if(!validOfflineSnapshot(value))return null;
 return {...value.state,property:{...value.state.property,connectionStatus:'OFFLINE' as const}};
}
export async function clearProductionOffline(){
 await offlineDb.syncMetadata.delete(KEY);
 await Promise.all([offlineDb.cachedGuests.clear(),offlineDb.cachedBookings.clear(),offlineDb.cachedFolios.clear(),offlineDb.cachedFolioLines.clear(),offlineDb.deviceMetadata.delete('device')]);
}
export async function cacheProductionOffline(state:DemoState){
 if(state.businessUnit!=='HOTEL'||!['OWNER','MANAGER','RECEPTION','HOUSEKEEPING'].includes(state.actor.role)){await clearProductionOffline();return;}
 const scope={organisationId:state.organisationId!,propertyId:state.property.id,userId:state.actor.id,role:state.actor.role};
 // Offline storage contains only the signed-in role's snapshot. Account administration stays online.
 const cached={...state,operationalData:undefined,audit:[],housekeepingStaff:[],packages:[],inquiries:[],followUps:[],travelAssets:[],customPackages:[],customPackageItems:[],discountRequests:[]};
 await cacheCloudPayload({syncedAt:state.property.lastSyncAt,property:state.property,rooms:state.rooms,reservations:roleCan(state.actor.role,'offline.cached.read')?state.reservations:[],folios:roleCan(state.actor.role,'offline.bill.create')?state.folios:[],folioLines:[]},scope);
 await offlineDb.syncMetadata.put({key:KEY,value:{state:cached,expiresAt:Date.now()+MAX_AGE}});
}
