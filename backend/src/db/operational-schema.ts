import { pgTable, text, integer, numeric, boolean, index } from 'drizzle-orm/pg-core';
import { properties, inventoryItems, appUsers, organisations, travelPackages, inquiries } from './schema';

export const menuItems = pgTable('hotel_menu_items', {
  id: text('id').primaryKey(), propertyId: text('property_id').notNull().references(() => properties.id),
  name: text('name').notNull(), category: text('category').notNull(), priceRupees: numeric('price_rupees', { precision: 16, scale: 2, mode: 'number' }).notNull(),
  available: boolean('available').notNull().default(true), version: integer('version').notNull().default(1), updatedAt: text('updated_at').notNull(),
}, t => [index('hotel_menu_property').on(t.propertyId)]);
export const lostFound = pgTable('hotel_lost_found', {
  id: text('id').primaryKey(), propertyId: text('property_id').notNull().references(() => properties.id),
  description: text('description').notNull(), location: text('location').notNull(), custody: text('custody').notNull(),
  status: text('status').notNull().default('FOUND'), version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [index('hotel_lost_found_property').on(t.propertyId,t.status)]);
export const inventoryMovements = pgTable('inventory_movements', {
  id: text('id').primaryKey(), propertyId: text('property_id').notNull().references(() => properties.id),
  itemId: text('item_id').notNull().references(() => inventoryItems.id), delta: integer('delta').notNull(), balance: integer('balance').notNull(),
  reason: text('reason').notNull(), actorId: text('actor_id').notNull().references(() => appUsers.id), actorName: text('actor_name').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('inventory_movements_property').on(t.propertyId,t.createdAt)]);

export const tours = pgTable('travel_tours', {
 id:text('id').primaryKey(),organisationId:text('organisation_id').notNull().references(()=>organisations.id),packageId:text('package_id').notNull().references(()=>travelPackages.id),name:text('name').notNull(),departureDate:text('departure_date').notNull(),capacity:integer('capacity').notNull(),managerId:text('manager_id').references(()=>appUsers.id),status:text('status').notNull().default('SELLING'),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull(),
},t=>[index('travel_tours_org').on(t.organisationId,t.departureDate)]);
export const participants=pgTable('travel_participants',{
 id:text('id').primaryKey(),organisationId:text('organisation_id').notNull().references(()=>organisations.id),tourId:text('tour_id').notNull().references(()=>tours.id),name:text('name').notNull(),sharing:text('sharing').notNull(),notes:text('notes').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[index('travel_participants_tour').on(t.organisationId,t.tourId)]);
export const communicationDrafts=pgTable('communication_drafts',{
 id:text('id').primaryKey(),organisationId:text('organisation_id').notNull().references(()=>organisations.id),inquiryId:text('inquiry_id').notNull().references(()=>inquiries.id),channel:text('channel').notNull(),recipient:text('recipient').notNull(),subject:text('subject').notNull(),body:text('body').notNull(),status:text('status').notNull().default('DRAFT'),createdAt:text('created_at').notNull(),
},t=>[index('communication_drafts_org').on(t.organisationId,t.createdAt)]);
