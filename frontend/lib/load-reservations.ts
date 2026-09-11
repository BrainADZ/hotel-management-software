type Row=Record<string,unknown>;
export async function loadReservationPages(api:(path:string)=>Promise<Row>):Promise<{items:Row[]}>{
 const items:Row[]=[];let page=1;
 for(;;){const result=await api(`/api/reservations?pageSize=100&page=${page}`);const chunk=(result.items as Row[])??[];items.push(...chunk);if(!chunk.length||items.length>=Number(result.total??items.length))break;page++;}
 return {items};
}
