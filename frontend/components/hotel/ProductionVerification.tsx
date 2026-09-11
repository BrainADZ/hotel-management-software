"use client";
import {useEffect,useState} from 'react';
import {roleCan} from '@hotel/shared/domain';
import {getBillBlob,getLocalOfflineBills,type LocalOfflineBill} from '@/lib/offline-db';
import {PageHeading,Status,money,downloadBlob,type PlatformViewProps,type Row} from '@/app/hotel-platform';
import {WorkflowForm} from './OperationalWorkspace';

export function ProductionVerification({state,command,refresh,notify,setView}:PlatformViewProps){
 const [local,setLocal]=useState<LocalOfflineBill[]>([]),[selected,setSelected]=useState<LocalOfflineBill|null>(null),[pending,setPending]=useState('');
 useEffect(()=>{void getLocalOfflineBills().then(setLocal);},[]);
 const canVerify=roleCan(state.actor.role,'offline.bill.verify');
 const registered=state.offlineBills;
 const register=async(values:Row)=>{
  if(!selected)return;
  const pdf=await getBillBlob(selected.id);if(!pdf)throw new Error('The original PDF is missing from this device.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await pdf.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==selected.documentHash)throw new Error('The saved PDF failed its integrity check.');
  await command({action:'REGISTER_OFFLINE_BILL',id:selected.id,offlineReference:selected.offlineReference,bookingReference:values.bookingReference,deviceId:selected.deviceId,localAmountPaise:selected.totalPaise,taxPaise:selected.taxPaise,documentHash:hash,generatedAt:selected.generatedAt});
  await refresh();setSelected(null);notify('Reference registered and compared with the current folio.');
 };
 return <><PageHeading eyebrow="Offline centre" title="Billing reconciliation" description="Compare retained device bills with current guest folios. Verification records the comparison; the original PDF remains on its device."/>
 <div className="table-card"><table><thead><tr><th>Reference</th><th>Booking</th><th>Device total</th><th>Folio total</th><th>Status</th><th>Action</th></tr></thead><tbody>{registered.map(row=><tr key={String(row.id)}><td>{String(row.offlineReference)}</td><td>{String(row.bookingReference)}</td><td>{money(row.localAmountPaise)}</td><td>{money(row.cloudAmountPaise)}</td><td><Status value={String(row.status)}/></td><td>{row.status!=='VERIFIED'&&canVerify&&<button className="text-button" disabled={pending===row.id} onClick={async()=>{setPending(String(row.id));try{await command({action:'VERIFY_OFFLINE_BILL',offlineBillId:row.id});await refresh();notify('Reference verified against the current folio.');}catch(e){notify(e instanceof Error?e.message:'Verification failed.');}finally{setPending('');}}}>Check & verify</button>}<button className="text-button" onClick={()=>setView('Folios & Billing')}>Review folio</button></td></tr>)}</tbody></table>{!registered.length&&<p className="empty-state">No references registered for this property.</p>}</div>
 <section className="glass-card"><h2>Bills retained on this device</h2><p>Select the matching booking in this property when registering a reference. Folio corrections and payments must be recorded in Folios & Billing.</p>{local.map(bill=><div key={bill.id} className="card-heading"><span>{bill.offlineReference} / {bill.bookingReference} / {money(bill.totalPaise)}</span><div><button className="text-button" onClick={async()=>{const pdf=await getBillBlob(bill.id);if(pdf)downloadBlob(pdf,`${bill.offlineReference}.pdf`);else notify('Original PDF is missing from this device.');}}>Download original</button>{!registered.some(row=>row.id===bill.id)&&<button className="text-button" onClick={()=>setSelected(bill)}>Register reference</button>}</div></div>)}{!local.length&&<p>No retained bills on this device.</p>}</section>
 {selected&&<WorkflowForm title="Link bill to booking" fields={[{key:'bookingReference',label:'Master Hub booking',options:state.reservations.map(r=>({value:String(r.reference),label:`${r.reference} - ${r.guestName}`}))}]} initial={{bookingReference:state.reservations.find(r=>r.id===selected.reservationId||r.reference===selected.bookingReference)?.reference}} onSave={register} onClose={()=>setSelected(null)}/>}</>;
}
