import * as route0 from './auth/me/route';
import * as route1 from './availability/route';
import * as route2 from './bookings/inbound/route';
import * as route3 from './context/route';
import * as route4 from './demo/route';
import * as route5 from './front-desk/route';
import * as route6 from './guests/route';
import * as route7 from './guests/[id]/history/route';
import * as route8 from './guests/[id]/identity-documents/route';
import * as route9 from './guests/[id]/route';
import * as route10 from './properties/route';
import * as route11 from './reservations/route';
import * as route12 from './reservations/[id]/actions/route';
import * as route13 from './reservations/[id]/assign-room/route';
import * as route14 from './reservations/[id]/check-in/route';
import * as route15 from './reservations/[id]/check-out/route';
import * as route16 from './reservations/[id]/guests/route';
import * as route17 from './reservations/[id]/history/route';
import * as route18 from './reservations/[id]/route';
import * as route19 from './rooms/route';
import * as route20 from './stays/[id]/keys/route';
import * as route21 from './stays/[id]/late-checkout/route';
import * as route22 from './stays/[id]/room-move/route';
import * as route23 from './folios/route';
import * as route24 from './folios/[id]/route';
import * as route25 from './folios/[id]/charges/route';
import * as route26 from './folios/[id]/room-charges/route';
import * as route27 from './folios/[id]/discounts/route';
import * as route28 from './folios/[id]/payments/route';
import * as route29 from './folios/[id]/invoice/route';
import * as route30 from './payments/[id]/reverse/route';
import * as route31 from './payments/[id]/refund/route';
import * as route32 from './payments/[id]/receipt/route';
import * as route33 from './invoices/[id]/route';
import * as route34 from './invoices/[id]/pdf/route';
import * as route35 from './reservations/[id]/financial-checkout/route';
import * as route36 from './operations/route';
import * as route37 from './auth/login/route';
import * as route38 from './auth/logout/route';
import * as route39 from './auth/google/route';
import * as route40 from './auth/google/callback/route';
import * as route41 from './profile/route';
import * as route42 from './profile/avatar/route';
import * as route43 from './profile/avatar/file/route';
import * as route44 from './travel/route';
import * as route45 from './travel/inquiries/route';
import * as route46 from './travel/inquiries/[id]/route';
import * as route47 from './travel/packages/route';
import * as route48 from './travel/packages/[id]/pricing/route';
import * as route49 from './travel/discount-requests/[id]/decision/route';
import * as route50 from './travel/follow-ups/route';
import * as route51 from './travel/follow-ups/[id]/route';
import * as route52 from './sync/mutations/route';

/*
 * Reservation-level room move resolver.
 * Frontend knows reservation ID; this route resolves
 * the active IN_HOUSE stay and invokes FrontDeskService.moveRoom().
 */
import * as route53 from './reservations/[id]/move-room/route';

import * as travelWorkflows from './travel/workflows/route';

export const routes = [
  {
    path: '/api/travel/workflows',
    handlers: travelWorkflows,
  },

  {
    path: '/api/auth/me',
    handlers: route0,
  },

  {
    path: '/api/availability',
    handlers: route1,
  },

  {
    path: '/api/bookings/inbound',
    handlers: route2,
  },

  {
    path: '/api/context',
    handlers: route3,
  },

  {
    path: '/api/demo',
    handlers: route4,
  },

  {
    path: '/api/front-desk',
    handlers: route5,
  },

  {
    path: '/api/guests',
    handlers: route6,
  },

  {
    path: '/api/guests/:id/history',
    handlers: route7,
  },

  {
    path: '/api/guests/:id/identity-documents',
    handlers: route8,
  },

  {
    path: '/api/guests/:id',
    handlers: route9,
  },

  {
    path: '/api/properties',
    handlers: route10,
  },

  {
    path: '/api/reservations',
    handlers: route11,
  },

  {
    path: '/api/reservations/:id/actions',
    handlers: route12,
  },

  {
    path: '/api/reservations/:id/assign-room',
    handlers: route13,
  },

  {
    path: '/api/reservations/:id/check-in',
    handlers: route14,
  },

  {
    path: '/api/reservations/:id/check-out',
    handlers: route15,
  },

  {
    path: '/api/reservations/:id/guests',
    handlers: route16,
  },

  {
    path: '/api/reservations/:id/history',
    handlers: route17,
  },

  /*
   * IMPORTANT:
   * Checked-in room moves from Reservation drawer
   * use this endpoint.
   */
  {
    path: '/api/reservations/:id/move-room',
    handlers: route53,
  },

  {
    path: '/api/reservations/:id',
    handlers: route18,
  },

  {
    path: '/api/rooms',
    handlers: route19,
  },

  {
    path: '/api/stays/:id/keys',
    handlers: route20,
  },

  {
    path: '/api/stays/:id/late-checkout',
    handlers: route21,
  },

  {
    path: '/api/stays/:id/room-move',
    handlers: route22,
  },

  {
    path: '/api/folios',
    handlers: route23,
  },

  {
    path: '/api/folios/:id',
    handlers: route24,
  },

  {
    path: '/api/folios/:id/charges',
    handlers: route25,
  },

  {
    path: '/api/folios/:id/room-charges',
    handlers: route26,
  },

  {
    path: '/api/folios/:id/discounts',
    handlers: route27,
  },

  {
    path: '/api/folios/:id/payments',
    handlers: route28,
  },

  {
    path: '/api/folios/:id/invoice',
    handlers: route29,
  },

  {
    path: '/api/payments/:id/reverse',
    handlers: route30,
  },

  {
    path: '/api/payments/:id/refund',
    handlers: route31,
  },

  {
    path: '/api/payments/:id/receipt',
    handlers: route32,
  },

  {
    path: '/api/invoices/:id',
    handlers: route33,
  },

  {
    path: '/api/invoices/:id/pdf',
    handlers: route34,
  },

  {
    path: '/api/reservations/:id/financial-checkout',
    handlers: route35,
  },

  {
    path: '/api/operations',
    handlers: route36,
  },

  {
    path: '/api/auth/login',
    handlers: route37,
  },

  {
    path: '/api/auth/logout',
    handlers: route38,
  },

  {
    path: '/api/auth/google',
    handlers: route39,
  },

  {
    path: '/api/auth/google/callback',
    handlers: route40,
  },

  {
    path: '/api/profile',
    handlers: route41,
  },

  {
    path: '/api/profile/avatar',
    handlers: route42,
  },

  {
    path: '/api/profile/avatar/file',
    handlers: route43,
  },

  {
    path: '/api/travel',
    handlers: route44,
  },

  {
    path: '/api/travel/inquiries',
    handlers: route45,
  },

  {
    path: '/api/travel/inquiries/:id',
    handlers: route46,
  },

  {
    path: '/api/travel/packages',
    handlers: route47,
  },

  {
    path: '/api/travel/packages/:id/pricing',
    handlers: route48,
  },

  {
    path: '/api/travel/discount-requests/:id/decision',
    handlers: route49,
  },

  {
    path: '/api/travel/follow-ups',
    handlers: route50,
  },

  {
    path: '/api/travel/follow-ups/:id',
    handlers: route51,
  },

  {
    path: '/api/sync/mutations',
    handlers: route52,
  },
];