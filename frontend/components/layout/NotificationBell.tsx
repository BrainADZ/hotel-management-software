"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Bell } from 'lucide-react';
import { buildNotifications } from '@/lib/notifications';
import type { DemoState } from '@/app/hotel-platform';
import type { FeatureView } from '@/lib/navigation';
export function NotificationBell({state,onOpen}:{state:DemoState|null;onOpen:(view:FeatureView)=>void}) {
 const [open,setOpen]=useState(false);const container=useRef<HTMLDivElement>(null);
 const key=`hotel-notifications:${state?.organisationId}:${state?.property.id}:${state?.actor.id}`;
 const stored=useSyncExternalStore(subscribe,()=>readStorage(key),()=> '[]');
 let read:string[]=[];
 try{const parsed:unknown=JSON.parse(stored);if(Array.isArray(parsed))read=parsed.filter((id):id is string=>typeof id==='string');}catch{/* Ignore damaged browser preferences. */}
 useEffect(()=>{if(!open)return;const close=(event:MouseEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape);};},[open]);
 const items=state?buildNotifications(state):[],unread=items.filter(item=>!read.includes(item.id));
 function mark(ids:string[]){const next=JSON.stringify([...new Set([...read,...ids])].slice(-1000));sessionReads.set(key,next);try{localStorage.setItem(key,next);}catch{/* Keep read state in memory when storage is unavailable. */}window.dispatchEvent(new Event('hotel-notifications-read'));}
 return <div ref={container} className="notification-container"><button type="button" className="icon-button notification-button" aria-label={`Notifications${unread.length?`, ${unread.length} unread`:''}`} aria-expanded={open} aria-controls="hotel-notifications" onClick={()=>setOpen(!open)}><Bell size={18}/>{unread.length>0&&<span className="notification-count">{unread.length>99?'99+':unread.length}</span>}</button>{open&&<section id="hotel-notifications" className="notification-panel" aria-label="Notifications"><div className="card-heading"><h2>Notifications</h2><button className="text-button" disabled={!unread.length} onClick={()=>mark(items.map(i=>i.id))}>Mark all read</button></div>{items.length?items.map(item=><button className={`notification-item ${read.includes(item.id)?'is-read':''}`} key={item.id} onClick={()=>{mark([item.id]);setOpen(false);onOpen(item.view);}}><strong>{item.title}</strong><small>{item.detail}</small></button>):<p className="empty-state">No pending alerts.</p>}</section>}</div>;
}

const sessionReads=new Map<string,string>();
function readStorage(key:string){try{return localStorage.getItem(key)??sessionReads.get(key)??'[]';}catch{return sessionReads.get(key)??'[]';}}
function subscribe(listener:()=>void){window.addEventListener('storage',listener);window.addEventListener('hotel-notifications-read',listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener('hotel-notifications-read',listener);};}
