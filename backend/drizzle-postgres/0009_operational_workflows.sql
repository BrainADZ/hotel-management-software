CREATE TABLE hotel_menu_items (
 id text PRIMARY KEY, property_id text NOT NULL REFERENCES properties(id),
 name text NOT NULL, category text NOT NULL, price_paise integer NOT NULL CHECK(price_paise > 0),
 available boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, updated_at text NOT NULL
);
CREATE INDEX hotel_menu_property ON hotel_menu_items(property_id);
CREATE TABLE hotel_lost_found (
 id text PRIMARY KEY, property_id text NOT NULL REFERENCES properties(id),
 description text NOT NULL, location text NOT NULL, custody text NOT NULL,
 status text NOT NULL DEFAULT 'FOUND', version integer NOT NULL DEFAULT 1,
 created_at text NOT NULL, updated_at text NOT NULL
);
CREATE INDEX hotel_lost_found_property ON hotel_lost_found(property_id,status);
CREATE TABLE inventory_movements (
 id text PRIMARY KEY, property_id text NOT NULL REFERENCES properties(id), item_id text NOT NULL REFERENCES inventory_items(id),
 delta integer NOT NULL, balance integer NOT NULL CHECK(balance >= 0), reason text NOT NULL,
 actor_id text NOT NULL REFERENCES app_users(id), actor_name text NOT NULL, created_at text NOT NULL
);
CREATE INDEX inventory_movements_property ON inventory_movements(property_id,created_at);
ALTER TABLE maintenance_tickets ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE restaurant_orders ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE travel_tours (
 id text PRIMARY KEY, organisation_id text NOT NULL REFERENCES organisations(id), package_id text NOT NULL REFERENCES travel_packages(id),
 name text NOT NULL, departure_date text NOT NULL, capacity integer NOT NULL CHECK(capacity > 0),
 manager_id text REFERENCES app_users(id), status text NOT NULL DEFAULT 'SELLING', version integer NOT NULL DEFAULT 1, updated_at text NOT NULL
);
CREATE INDEX travel_tours_org ON travel_tours(organisation_id,departure_date);
CREATE TABLE travel_participants (
 id text PRIMARY KEY, organisation_id text NOT NULL REFERENCES organisations(id), tour_id text NOT NULL REFERENCES travel_tours(id),
 name text NOT NULL, sharing text NOT NULL, notes text NOT NULL DEFAULT '', created_at text NOT NULL
);
CREATE INDEX travel_participants_tour ON travel_participants(organisation_id,tour_id);
CREATE TABLE communication_drafts (
 id text PRIMARY KEY, organisation_id text NOT NULL REFERENCES organisations(id), inquiry_id text NOT NULL REFERENCES inquiries(id),
 channel text NOT NULL, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'DRAFT', created_at text NOT NULL
);
CREATE INDEX communication_drafts_org ON communication_drafts(organisation_id,created_at);
