export type FrontDeskCandidate={organisationId:string;propertyId:string;arrivalDate:string;departureDate:string;status:string};
export function appearsInFrontDesk(row:FrontDeskCandidate,view:'arrivals'|'expected'|'in-house',date:string,organisationId:string,propertyId:string):boolean{
 if(row.organisationId!==organisationId||row.propertyId!==propertyId)return false;
 if(view==='in-house')return row.status==='CHECKED_IN';
 if(!['PENDING','HOLD','CONFIRMED'].includes(row.status))return false;
 return view==='arrivals'?row.arrivalDate===date:row.arrivalDate>date;
}
