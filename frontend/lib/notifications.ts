import { roleCan, type AppRole } from '@hotel/shared/domain';
import { roleViewAccess, type FeatureView } from './navigation';
type Row = Record<string,unknown>;
export type HotelNotification={id:string;title:string;detail:string;view:FeatureView};
export function buildNotifications(state:{actor:{role:AppRole};housekeeping:Row[];inventory:Row[];maintenance:Row[];restaurantOrders:Row[];damageReports:Row[];followUps:Row[]},now=Date.now()):HotelNotification[] {
 const alerts:HotelNotification[]=[];
 if(state.actor.role==='HOUSEKEEPING'||roleCan(state.actor.role,'housekeeping.assign'))for(const t of state.housekeeping.filter(t=>!['COMPLETED','CANCELLED'].includes(String(t.status))))alerts.push({id:`task:${t.id}:${t.version}`,title:`Room ${t.roomNumber} · ${t.assignedTo?'Housekeeping due':'Unassigned task'}`,detail:String(t.notes??t.taskType).replaceAll('_',' '),view:'Housekeeping'});
 if(roleCan(state.actor.role,'inventory.write'))for(const item of state.inventory.filter(i=>Number(i.currentQuantity)<=Number(i.minimumQuantity)))alerts.push({id:`stock:${item.id}:${item.updatedAt}`,title:`Low stock: ${item.name}`,detail:`${item.currentQuantity} ${item.unit} remaining`,view:'Inventory'});
 if(roleCan(state.actor.role,'maintenance.manage'))for(const t of state.maintenance.filter(t=>!['RESOLVED','CLOSED'].includes(String(t.status))))alerts.push({id:`maintenance:${t.id}:${t.version}`,title:'Maintenance requires attention',detail:String(t.issue),view:'Maintenance'});
 if(roleCan(state.actor.role,'restaurant.manage'))for(const t of state.restaurantOrders.filter(t=>['PENDING','PREPARING','READY'].includes(String(t.status))))alerts.push({id:`order:${t.id}:${t.version}`,title:`Room ${t.roomNumber??'—'} · ${t.status}`,detail:'Open restaurant order',view:t.orderType==='ROOM_SERVICE'?'Room Service':'Restaurant Orders'});
 if(roleCan(state.actor.role,'damage.review'))for(const t of state.damageReports.filter(t=>t.status==='PENDING_REVIEW'))alerts.push({id:`damage:${t.id}:${t.version}`,title:'Damage report awaiting review',detail:String(t.description),view:'Overview'});
 if(roleCan(state.actor.role,'travel.read'))for(const f of state.followUps.filter(f=>f.status==='PENDING'&&Date.parse(String(f.dueAt))<=now))alerts.push({id:`followup:${f.id}:${f.version}`,title:'Follow-up overdue',detail:String(f.notes??f.channel),view:'Follow-ups'});
 const access=roleViewAccess[state.actor.role];return alerts.filter(a=>!access||access.includes(a.view));
}
