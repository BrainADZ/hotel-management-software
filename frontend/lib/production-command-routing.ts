export type ProductionCommandRoute = { path: string; method: "POST" | "PATCH"; body: Record<string, unknown> };

const reservationActions = new Set(["CHANGE_DATES", "EXTEND_STAY", "SHORTEN_STAY", "CHANGE_ROOM", "UPGRADE_ROOM", "PLACE_HOLD", "RELEASE_HOLD", "RESTORE", "CANCEL", "MARK_NO_SHOW"]);
const operationsActions = new Set(["REGISTER_OFFLINE_BILL", "VERIFY_OFFLINE_BILL", "RECORD_HOUSEKEEPING_OUTCOME", "SUBMIT_ROOM_INSPECTION", "RESOLVE_DAMAGE_REPORT", "UPSERT_INVENTORY", "ASSIGN_HOUSEKEEPING_TASK", "SAVE_MENU_ITEM", "RECORD_LOST_ITEM", "RELEASE_LOST_ITEM", "CREATE_MAINTENANCE", "RESOLVE_MAINTENANCE", "MOVE_STOCK", "SAVE_ROOM", "CREATE_HOUSEKEEPING_TASK", "CREATE_RESTAURANT_ORDER", "UPDATE_RESTAURANT_ORDER", "SAVE_STAFF", "SAVE_PROPERTY", "BOOK_MEAL", "SERVE_MEAL"]);

function requiredId(payload: Record<string, unknown>, field: string) {
  const value = String(payload[field] ?? "").trim();
  if (!value || value === "undefined" || value === "null") throw new Error(`Production command requires ${field}.`);
  return encodeURIComponent(value);
}

export function routeProductionCommand(payload: Record<string, unknown>): ProductionCommandRoute {
  const action = String(payload.action ?? "").trim();
  if (['SAVE_TOUR','ADD_PARTICIPANT','SAVE_COMMUNICATION_DRAFT','CREATE_TRAVEL_PRODUCT','SAVE_TRAVEL_ASSET'].includes(action)) return {path:'/api/travel/workflows',method:'POST',body:payload};
  if (action === "CREATE_RESERVATION") return { path: "/api/reservations", method: "POST", body: { guestName: payload.guestName, email: payload.email, phone: payload.phone, roomId: payload.roomId, roomType: payload.roomType, arrivalDate: payload.arrivalDate, departureDate: payload.departureDate, adults: payload.guestCount ?? payload.adults ?? 1, children: payload.children ?? 0, status: "CONFIRMED", source: payload.source ?? "DIRECT", nightlyRatePaise: payload.nightlyRatePaise, taxRateBps: payload.taxRateBps ?? 0, specialRequests: payload.specialRequests, internalNotes: payload.internalNotes } };
  if (action === "EDIT_RESERVATION") return { path: `/api/reservations/${requiredId(payload, "reservationId")}`, method: "PATCH", body: (payload.changes ?? {}) as Record<string, unknown> };
  if (action === "CHECK_IN") return { path: `/api/reservations/${requiredId(payload, "reservationId")}/check-in`, method: "POST", body: {} };
  if (action === "CHECK_OUT") return { path: `/api/reservations/${requiredId(payload, "reservationId")}/check-out`, method: "POST", body: {} };
  if (operationsActions.has(action)) return { path: "/api/operations", method: "POST", body: payload };
  if (action === "CREATE_CUSTOM_PACKAGE") return { path: "/api/travel/packages", method: "POST", body: payload };
  if (action === "SET_PACKAGE_PRICING") return { path: `/api/travel/packages/${requiredId(payload, "packageId")}/pricing`, method: "PATCH", body: payload };
  if (action === "RESOLVE_DISCOUNT_REQUEST") return { path: `/api/travel/discount-requests/${requiredId(payload, "requestId")}/decision`, method: "POST", body: payload };
  if (action === "CREATE_INQUIRY") return { path: "/api/travel/inquiries", method: "POST", body: payload };
  if (action === "UPDATE_INQUIRY" || action === "UPDATE_PIPELINE_STAGE") return { path: `/api/travel/inquiries/${requiredId(payload, "inquiryId")}`, method: "PATCH", body: (payload.changes ?? payload) as Record<string, unknown> };
  if (action === "CREATE_FOLLOW_UP") return { path: "/api/travel/follow-ups", method: "POST", body: payload };
  if (action === "UPDATE_FOLLOW_UP" || action === "COMPLETE_FOLLOW_UP") return { path: `/api/travel/follow-ups/${requiredId(payload, "followUpId")}`, method: "PATCH", body: (payload.changes ?? payload) as Record<string, unknown> };
  if (reservationActions.has(action)) {
    const reservationId = requiredId(payload, "reservationId");
    return { path: `/api/reservations/${reservationId}/actions`, method: "POST", body: { ...payload, action: undefined, reservationId: undefined, type: String(payload.type ?? action) } };
  }
  throw new Error(`Unsupported production command: ${action || "(missing action)"}`);
}
