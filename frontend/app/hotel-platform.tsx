"use client";
/* eslint-disable @next/next/no-img-element -- Runtime avatars and supplied local logos use direct image URLs. */
import { apiFetch, apiUrl } from "@/lib/api/client";
import { routeProductionCommand } from "@/lib/production-command-routing";
import { assertOfflineCommandQueueable, runOfflineSync } from "@/lib/offline-sync";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { NotificationBell } from '@/components/layout/NotificationBell';
import { OperationalWorkspace } from "@/components/hotel/OperationalWorkspace";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { OperatingSurfaceSwitcher } from "@/components/layout/OperatingSurfaceSwitcher";
import { OverviewView, RestaurantOverviewView } from "@/components/hotel/OverviewView";
import { ReservationsView } from "@/components/hotel/ReservationsView";
import { ConnectivityView } from "@/components/hotel/ConnectivityView";
import { FrontDeskView } from "@/components/hotel/FrontDeskView";
import { GuestsView } from "@/components/hotel/GuestsView";
import { FoliosBillingView } from "@/components/hotel/FoliosBillingView";
import { RoomCalendarView } from "@/components/hotel/RoomCalendarView";
import { ArrivalsDeparturesView } from "@/components/hotel/ArrivalsDeparturesView";
import { RoomTypesRatesView } from "@/components/hotel/RoomTypesRatesView";
import { GuestProfilesView } from "@/components/hotel/GuestProfilesView";
import { InvoicesView } from "@/components/hotel/InvoicesView";
import { HousekeepingOverviewView, HousekeepingView } from "@/components/hotel/HousekeepingView";
import { MaintenanceView } from "@/components/hotel/MaintenanceView";
import { InventoryView } from "@/components/hotel/InventoryView";
import { InventoryMovementsView } from "@/components/hotel/InventoryMovementsView";
import { LostFoundView } from "@/components/hotel/LostFoundView";
import { RestaurantOrdersView } from "@/components/hotel/RestaurantOrdersView";
import { RoomServiceView } from "@/components/hotel/RoomServiceView";
import { MealServiceView } from "@/components/hotel/MealServiceView";
import { MenuManagementView } from "@/components/hotel/MenuManagementView";
import { OfflineBillingView } from "@/components/hotel/OfflineBillingView";
import { VerificationView } from "@/components/hotel/VerificationView";
import { DeviceStatusView } from "@/components/hotel/DeviceStatusView";
import { IntegrationsView } from "@/components/hotel/IntegrationsView";
import { ReportsView } from "@/components/hotel/ReportsView";
import { AuditLogsView } from "@/components/hotel/AuditLogsView";
import { UsersPermissionsView } from "@/components/hotel/UsersPermissionsView";
import { PropertiesSettingsView } from "@/components/hotel/PropertiesSettingsView";
import { TravelOverviewView } from "@/components/travel/TravelOverviewView";
import { PackagesToursView } from "@/components/travel/PackagesToursView";
import { ToursView } from "@/components/travel/ToursView";
import { ParticipantsView } from "@/components/travel/ParticipantsView";
import { TourManagersView } from "@/components/travel/TourManagersView";
import { InquiryCRMView } from "@/components/travel/InquiryCRMView";
import { SalesPipelineView } from "@/components/travel/SalesPipelineView";
import { FollowUpsView } from "@/components/travel/FollowUpsView";
import { CommunicationsView } from "@/components/travel/CommunicationsView";
import { TravelReportsView } from "@/components/travel/TravelReportsView";
import { TravelAuditLogsView } from "@/components/travel/TravelAuditLogsView";
import { ProductionFrontDesk, ProductionGuests } from "./production-front-desk";
import {
  ReservationModal,
  StayDrawer,
} from "@/components/hotel/reservation-workflows";
import {
  hrefForView,
  navigationGroups,
  roleViewAccess,
  viewFromPathname,
  workspaceFromPathname,
  type FeatureView,
} from "@/lib/navigation";

import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  Palette,
  Plus,
  Search,
  User,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ComponentType,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  businessUnitsForRole,
  roleCan,
  type AppRole,
  type BusinessUnit,
} from "@hotel/shared/domain";
import {
  cacheApplicationSnapshot,
  enqueueOfflineMutation,
  cacheCloudPayload,
  createLocalWalkInReservation,
  getBillBlob,
  getApplicationSnapshot,
  getLocalOfflineReservations,
  getLocalOfflineBills,
  getPendingOfflineReservations,
  loadUiStyle,
  markOfflineReservationSynced,
  markOfflineReservationSyncFailed,
  saveUiStyle,
  updateLocalBillStatus,
  type LocalOfflineReservation,
  type LocalOfflineBill,
  type MealService,
  type UiStyle,
} from "@/lib/offline-db";

// Expanded sidebar logo: public/main-logo.png.
const FULL_LOGO = "/main-logo.png";
// Collapsed sidebar logo: public/sidebar-logo.png.
const COLLAPSED_LOGO = "/sidebar-logo.png";

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="sidebar-logo">
      {/* Keep existing branding as a fallback if a logo cannot be loaded. */}
      {!missing ? (
        <img
          src={collapsed ? COLLAPSED_LOGO : FULL_LOGO}
          alt="Hotel Management"
          onError={() => setMissing(true)}
        />
      ) : collapsed ? (
        <span aria-label="Hotel Management logo placeholder">HM</span>
      ) : (
        <>
          <strong>
            BrainADZ <span className="brand-live">Live</span>
          </strong>
          <small>Hospitality OS</small>
        </>
      )}
    </span>
  );
}

export type Row = Record<string, unknown>;
type Property = {
  id: string;
  name: string;
  city: string;
  timezone?: string;
  connectionStatus: "ONLINE" | "OFFLINE";
  lastSyncAt: string;
};
type Metrics = {
  occupancyPercent: number;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  readyRooms: number;
  dirtyRooms: number;
  maintenanceRooms: number;
  arrivalsToday: number;
  departuresToday: number;
  inHouseGuests: number;
  pendingPayments: number;
  revenuePaise: number;
  adrPaise: number;
  revParPaise: number;
  lowStockCount: number;
  unresolvedMaintenance: number;
  overdueFollowUps: number;
};
export type DamageSeverity = "LOW" | "MEDIUM" | "HIGH";
export type ReservationInspectionSummary = {
  reservationId: string;
  bookingReference?: string | null;
  roomNumber?: string | null;
  taskId: string;
  taskStatus: string;
  taskOutcome?: string | null;
  taskVersion: number;
  inspectionId?: string | null;
  inspectionStatus:
    | "PENDING"
    | "CLEARED"
    | "DAMAGE_REVIEW"
    | "DAMAGE_REPORTED"
    | "DAMAGE_CHARGED"
    | "DAMAGE_WAIVED";
  result?: "NO_DAMAGE" | "DAMAGE_FOUND" | null;
  inspectionNotes?: string | null;
  severity?: DamageSeverity | null;
  completedBy?: string | null;
  completedAt?: string | null;
  damageReportId?: string | null;
  damageStatus?: "PENDING_REVIEW" | "CHARGED" | "WAIVED" | null;
  damageDescription?: string | null;
  policyRuleId?: string | null;
  policyLabel?: string | null;
  policyLiabilityPaise?: number | null;
  repairCostPaise?: number | null;
  chargeAmountPaise?: number | null;
  decisionNote?: string | null;
  reportedBy?: string | null;
  reportedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  damageVersion?: number | null;
  folioId?: string | null;
  folioStatus?: string | null;
};
export type DemoState = {
  operationalData?: Row;
  organisationId?: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
    avatar?: string | null;
    provider?: string | null;
  };
  businessUnit: BusinessUnit;
  property: Property;
  metrics: Metrics;
  travelMetrics: {
    activePackages: number;
    openInquiries: number;
    pipelineValuePaise: number;
    customQuotes: number;
    pendingApprovals: number;
    overdueFollowUps: number;
  };
  rooms: Row[];
  reservations: Row[];
  folios: Row[];
  folioLines: Row[];
  offlineBills: Row[];
  housekeeping: Row[];
  housekeepingStaff: Row[];
  maintenance: Row[];
  inventory: Row[];
  restaurantOrders: Row[];
  restaurantMealBookings: Row[];
  restaurantArrivals: Row[];
  reservationInspectionSummaries: ReservationInspectionSummary[];
  damageReports: Row[];
  packages: Row[];
  inquiries: Row[];
  followUps: Row[];
  travelAssets: Row[];
  customPackages: Row[];
  customPackageItems: Row[];
  discountRequests: Row[];
  audit: Row[];
  cachePayload?: Parameters<typeof cacheCloudPayload>[0];
  sandbox: Record<string, string>;
};

type ViewName = FeatureView;
export type Surface = "MASTER_HUB" | "PROPERTY";

export type AppGlyphName =
  | "occupancy"
  | "booking-calendar"
  | "front-desk"
  | "guest"
  | "folio"
  | "housekeeping"
  | "maintenance"
  | "inventory"
  | "restaurant"
  | "travel"
  | "inquiry"
  | "offline"
  | "policy"
  | "payment"
  | "integrations"
  | "reports"
  | "audit"
  | "cloud-network"
  | "hotel"
  | "breakfast"
  | "brunch"
  | "lunch"
  | "high-tea"
  | "dinner"
  | "supper"
  | "room-ready"
  | "booking-feed"
  | "arrivals-departures"
  | "staff"
  | "wallet-alert"
  | "damage-alert"
  | "charge-receipt"
  | "waived-charge"
  | "device-status"
  | "phone-chat"
  | "email"
  | "channel-sync"
  | "smart-lock"
  | "attention-queue"
  | "offline-billing"
  | "receipt-verification";

type AppGlyphDefinition = Readonly<{
  column: number;
  row: number;
  grid: 4 | 5;
  atlas: string;
}>;

const primaryGlyph = (column: number, row: number): AppGlyphDefinition => ({
  column,
  row,
  grid: 5,
  atlas: "/icons/brainadz-hospitality-atlas-v2.png",
});
const statusGlyph = (column: number, row: number): AppGlyphDefinition => ({
  column,
  row,
  grid: 4,
  atlas: "/icons/brainadz-hospitality-status-atlas-v2.png",
});

const appGlyphCells: Record<AppGlyphName, AppGlyphDefinition> = {
  occupancy: primaryGlyph(0, 0),
  "booking-calendar": primaryGlyph(1, 0),
  "front-desk": primaryGlyph(2, 0),
  guest: primaryGlyph(3, 0),
  folio: primaryGlyph(4, 0),
  housekeeping: primaryGlyph(0, 1),
  maintenance: primaryGlyph(1, 1),
  inventory: primaryGlyph(2, 1),
  restaurant: primaryGlyph(3, 1),
  travel: primaryGlyph(4, 1),
  inquiry: primaryGlyph(0, 2),
  offline: primaryGlyph(1, 2),
  policy: primaryGlyph(2, 2),
  payment: primaryGlyph(3, 2),
  integrations: primaryGlyph(4, 2),
  reports: primaryGlyph(0, 3),
  audit: primaryGlyph(1, 3),
  "cloud-network": primaryGlyph(2, 3),
  hotel: primaryGlyph(3, 3),
  breakfast: primaryGlyph(4, 3),
  brunch: primaryGlyph(0, 4),
  lunch: primaryGlyph(1, 4),
  "high-tea": primaryGlyph(2, 4),
  dinner: primaryGlyph(3, 4),
  supper: primaryGlyph(4, 4),
  "room-ready": statusGlyph(0, 0),
  "booking-feed": statusGlyph(1, 0),
  "arrivals-departures": statusGlyph(2, 0),
  staff: statusGlyph(3, 0),
  "wallet-alert": statusGlyph(0, 1),
  "damage-alert": statusGlyph(1, 1),
  "charge-receipt": statusGlyph(2, 1),
  "waived-charge": statusGlyph(3, 1),
  "device-status": statusGlyph(0, 2),
  "phone-chat": statusGlyph(1, 2),
  email: statusGlyph(2, 2),
  "channel-sync": statusGlyph(3, 2),
  "smart-lock": statusGlyph(0, 3),
  "attention-queue": statusGlyph(1, 3),
  "offline-billing": statusGlyph(2, 3),
  "receipt-verification": statusGlyph(3, 3),
};

const navGlyphs: Record<ViewName, AppGlyphName> = {
  Overview: "occupancy",
  Reservations: "booking-calendar",
  Connectivity: "cloud-network",
  "Front Desk": "front-desk",
  Guests: "guest",
  "Folios & Billing": "folio",
  Housekeeping: "housekeeping",
  Maintenance: "maintenance",
  Inventory: "inventory",
  "Restaurant Orders": "restaurant",
  "Packages & Tours": "travel",
  "Inquiry CRM": "inquiry",
  "Offline Billing": "offline-billing",
  Verification: "receipt-verification",
  "Device Status": "device-status",
  Integrations: "integrations",
  Reports: "reports",
  "Audit Logs": "audit",
  "Room Calendar": "booking-calendar",
  "Arrivals & Departures": "arrivals-departures",
  "Room Types & Rates": "hotel",
  "Guest Profiles": "guest",
  Invoices: "charge-receipt",
  "Inventory Movements": "inventory",
  "Lost & Found": "guest",
  "Room Service": "restaurant",
  "Meal Service": "breakfast",
  "Menu Management": "restaurant",
  Tours: "travel",
  Participants: "guest",
  "Tour Managers": "staff",
  "Sales Pipeline": "inquiry",
  "Follow-ups": "phone-chat",
  Communications: "email",
  "Users & Permissions": "policy",
  "Properties & Settings": "hotel",
};

export function AppGlyph({
  name,
  size = 20,
  className = "",
}: {
  name: AppGlyphName;
  size?: number;
  className?: string;
}) {
  const { column, row, grid, atlas } = appGlyphCells[name];
  const step = 100 / (grid - 1);
  return (
    <span
      className={`app-glyph ${className}`.trim()}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${atlas})`,
        backgroundSize: `${grid * 100}% ${grid * 100}%`,
        backgroundPosition: `${column * step}% ${row * step}%`,
      }}
      aria-hidden="true"
    />
  );
}

const roles: Array<{ value: AppRole; label: string }> = [
  { value: "OWNER", label: "Owner / Super Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "RECEPTION", label: "Reception" },
  { value: "TRAVEL_AGENT", label: "Travel Agent" },
  { value: "TOUR_MANAGER", label: "Tour Manager" },
  { value: "ACCOUNTS", label: "Accounts" },
  { value: "HOUSEKEEPING", label: "Housekeeping" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "REPORTING", label: "Reporting User" },
];

export const mealOptions: Array<{
  value: MealService;
  label: string;
  glyph: AppGlyphName;
}> = [
  { value: "BREAKFAST", label: "Breakfast", glyph: "breakfast" },
  { value: "BRUNCH", label: "Brunch", glyph: "brunch" },
  { value: "LUNCH", label: "Lunch", glyph: "lunch" },
  { value: "HIGH_TEA", label: "High tea", glyph: "high-tea" },
  { value: "DINNER", label: "Dinner", glyph: "dinner" },
  { value: "SUPPER", label: "Supper", glyph: "supper" },
];

export function mealLabel(value: unknown) {
  return (
    mealOptions.find((item) => item.value === value)?.label ??
    String(value).replaceAll("_", " ")
  );
}

export function money(paise: unknown) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(paise ?? 0) / 100);
}

export function shortDate(value: unknown) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));
}

export function dateTime(value: unknown) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(String(value)));
}

export function localDateTimeInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

async function sendDemoCommand(
  role: AppRole,
  businessUnit: BusinessUnit,
  payload: Record<string, unknown>,
) {
  const requestPayload =
    payload.action === "POST_RESTAURANT" && !payload.clientOperationId
      ? { ...payload, clientOperationId: crypto.randomUUID() }
      : payload;
  const response = await apiFetch("/api/demo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demo-role": role,
      "x-business-unit": businessUnit,
    },
    body: JSON.stringify(requestPayload),
  });
  const body = (await response.json()) as {
    ok?: boolean;
    result?: Row;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(body.error?.message ?? "The operation failed.");
  return body.result ?? {};
}

export async function productionApi(
  path: string,
  init?: RequestInit,
): Promise<Row> {
  const response = await apiFetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await response.json()) as Row & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(body.error?.message ?? "The production operation failed.");
  return body;
}

function productionShell(
  context: Row,
  reservationItems: Row[],
  roomItems: Row[],
  folioItems: Row[],
  operations: Row,
): DemoState {
  const user = context.user as DemoState["actor"];
  const property = (context.property as Row | null) ?? {};
  const metrics: Metrics = {
    occupancyPercent: 0,
    totalRooms: roomItems.length,
    occupiedRooms: 0,
    availableRooms: roomItems.length,
    readyRooms: roomItems.length,
    dirtyRooms: 0,
    maintenanceRooms: 0,
    arrivalsToday: 0,
    departuresToday: 0,
    inHouseGuests: 0,
    pendingPayments: 0,
    revenuePaise: 0,
    adrPaise: 0,
    revParPaise: 0,
    lowStockCount: 0,
    unresolvedMaintenance: 0,
    overdueFollowUps: 0,
  };
  return {
    organisationId: String((context.organisation as Row)?.id ?? ""),
    operationalData: operations,
    actor: user,
    businessUnit: "HOTEL",
    property: {
      id: String(property.id ?? "travel-workspace"),
      name: String(property.name ?? (context.organisation as Row)?.name ?? "Travel & Sales"),
      city: "",
      timezone: String(property.timezone),
      connectionStatus: "ONLINE",
      lastSyncAt: new Date().toISOString(),
    },
    metrics,
    travelMetrics: {
      activePackages: 0,
      openInquiries: 0,
      pipelineValuePaise: 0,
      customQuotes: 0,
      pendingApprovals: 0,
      overdueFollowUps: 0,
    },
    rooms: roomItems,
    reservations: reservationItems.map((item) => ({
      ...item,
      guestName: item.primaryGuestName,
      email: item.guestEmail,
      phone: item.guestPhone,
      contactStatus: "ACKNOWLEDGED",
    })),
    folios: folioItems,
    folioLines: [],
    offlineBills: [],
    housekeeping: (operations.housekeeping as Row[]) ?? [],
    housekeepingStaff: (operations.housekeepingStaff as Row[]) ?? [],
    maintenance: (operations.maintenance as Row[]) ?? [],
    inventory: (operations.inventory as Row[]) ?? [],
    restaurantOrders: (operations.restaurantOrders as Row[]) ?? [],
    restaurantMealBookings: (operations.restaurantMealBookings as Row[]) ?? [],
    restaurantArrivals: [],
    reservationInspectionSummaries: [],
    damageReports: (operations.damageReports as Row[]) ?? [],
    packages: (operations.packages as Row[]) ?? [],
    inquiries: (operations.inquiries as Row[]) ?? [],
    followUps: (operations.followUps as Row[]) ?? [],
    travelAssets: (operations.travelAssets as Row[]) ?? [],
    customPackages: (operations.customPackages as Row[]) ?? [],
    customPackageItems: (operations.customPackageItems as Row[]) ?? [],
    discountRequests: (operations.discountRequests as Row[]) ?? [],
    audit: (operations.audit as Row[]) ?? [],
    sandbox: {
      mode: "PRODUCTION",
      integrations: String(
        (operations.integrations as Row[] | undefined)?.length ?? 0,
      ),
    },
  };
}

async function syncDeviceQueues(
  send: (payload: Record<string, unknown>) => Promise<Row>,
) {
  const pendingReservations = await getPendingOfflineReservations();
  let syncedReservations = 0;
  let reservationConflicts = 0;
  for (const reservation of pendingReservations) {
    try {
      const synced = await send({
        action: "SYNC_OFFLINE_RESERVATION",
        clientOperationId: reservation.id,
        localReference: reservation.localReference,
        guestName: reservation.guestName,
        email: reservation.email,
        phone: reservation.phone,
        city: reservation.city,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        roomType: reservation.roomType,
        mealPlan: reservation.mealPlan,
        guestCount: reservation.guestCount,
        dietaryRequirements: reservation.dietaryRequirements,
        createdById: reservation.createdById,
        createdByName: reservation.createdByName,
        createdByRole: reservation.createdByRole,
      });
      await markOfflineReservationSynced(reservation.id, {
        reservationId: String(synced.reservationId),
        reference: String(synced.reference),
      });
      syncedReservations += 1;
    } catch (cause) {
      reservationConflicts += 1;
      await markOfflineReservationSyncFailed(
        reservation.id,
        cause instanceof Error ? cause.message : "Sync requires review.",
      );
    }
  }

  const reservationRecords = await getLocalOfflineReservations();
  const localBills = await getLocalOfflineBills();
  let uploadedCount = 0;
  let deferredBills = 0;
  let missingDocuments = 0;
  for (const bill of localBills.filter((item) => !item.uploadedAt)) {
    const localReservation = reservationRecords.find(
      (reservation) =>
        reservation.id === bill.reservationId ||
        reservation.localReference === bill.bookingReference,
    );
    if (localReservation && localReservation.syncStatus !== "SYNCED") {
      deferredBills += 1;
      continue;
    }
    const document = await getBillBlob(bill.id);
    if (!document) {
      missingDocuments += 1;
      continue;
    }
    try {
      const uploaded = await send({
        action: "UPLOAD_OFFLINE_BILL",
        id: bill.id,
        offlineReference: bill.offlineReference,
        bookingReference: bill.bookingReference,
        localAmountPaise: bill.totalPaise,
        taxPaise: bill.taxPaise,
        documentHash: bill.documentHash,
        generatedAt: bill.generatedAt,
        documentBase64: await blobToBase64(document),
      });
      await updateLocalBillStatus(
        bill.id,
        String(uploaded.status) as LocalOfflineBill["status"],
      );
      uploadedCount += 1;
    } catch {
      deferredBills += 1;
    }
  }
  return {
    syncedReservations,
    reservationConflicts,
    uploadedCount,
    deferredBills,
    missingDocuments,
  };
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}
function AccountAvatar({
  user,
  preview,
}: {
  user: DemoState["actor"];
  preview?: string | null;
}) {
  const source =
    preview === undefined
      ? user.avatar
        ? user.avatar.startsWith("/api/")
          ? apiUrl(user.avatar)
          : user.avatar
        : null
      : preview;
  return (
    <span className="account-avatar">
      {source ? (
        <img
          src={source}
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
            event.currentTarget.nextElementSibling?.removeAttribute("hidden");
          }}
        />
      ) : null}
      <span hidden={Boolean(source)}>{initials(user.name)}</span>
    </span>
  );
}
function ProfileModal({
  initial,
  property,
  onClose,
  onSaved,
}: {
  initial: DemoState["actor"];
  property: Property;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(initial.name);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function chooseFile(next: File | null) {
    setError("");
    setFile(null);
    setPreview(null);
    setRemove(false);
    if (!next) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(next.type) ||
      next.size > 5 * 1024 * 1024
    ) {
      setError("Choose a valid JPEG, PNG, or WebP image up to 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(next);
    setFile(next);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (!profile.ok)
        throw new Error(
          ((await profile.json()) as { error?: { message?: string } }).error
            ?.message ?? "Profile could not be saved.",
        );
      if (remove) {
        const response = await apiFetch("/api/profile/avatar", {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Photo could not be removed.");
      }
      if (file) {
        const response = await apiFetch("/api/profile/avatar", {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok)
          throw new Error(
            ((await response.json()) as { error?: { message?: string } }).error
              ?.message ?? "Photo could not be uploaded.",
          );
      }
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Profile could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const shownUser = { ...initial, name: displayName };
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="modal-card profile-modal" onSubmit={save}>
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Personal Information</p>
            <h2>My Profile</h2>
            <p>Update how your account appears in the hotel workspace.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="profile-photo-editor">
          <AccountAvatar user={shownUser} preview={remove ? null : preview} />
          <span>
            <label className="secondary-button">
              {initial.avatar ? "Change photo" : "Upload photo"}
              <input
                type="file"
                hidden
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  chooseFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            {initial.avatar && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setRemove(true);
                  setFile(null);
                  setPreview(null);
                }}
              >
                Remove photo
              </button>
            )}
            <small>JPEG, PNG or WebP Â· maximum 5 MB</small>
          </span>
        </div>
        <div className="form-grid">
          <label className="wide">
            <span>Display name</span>
            <input
              required
              minLength={2}
              maxLength={100}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            <span>Email</span>
            <input value={initial.email} readOnly />
          </label>
          <label>
            <span>Role</span>
            <input value={initial.role.replaceAll("_", " ")} readOnly />
          </label>
          <label className="wide">
            <span>Property access</span>
            <input value={property.name} readOnly />
          </label>
        </div>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Savingâ€¦" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function HotelPlatform({
  appMode = "demo",
  onLogout,
}: {
  appMode?: "demo" | "production";
  onLogout?: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const routeWorkspace = workspaceFromPathname(pathname);
  const view = viewFromPathname(pathname);
  const [state, setState] = useState<DemoState | null>(null);
  const [role, setRole] = useState<AppRole>("MANAGER");
  const businessUnit = routeWorkspace;
  const [surface, setSurface] = useState<Surface>("MASTER_HUB");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [reservationModal, setReservationModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Row | null>(
    null,
  );
  const [reconnectSummary, setReconnectSummary] = useState<Row | null>(null);
  const [localReservations, setLocalReservations] = useState<
    LocalOfflineReservation[]
  >([]);
  const [uiStyle, setUiStyle] = useState<UiStyle>("sage");
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const loadSequence = useRef(0);
  const appearancePickerRef = useRef<HTMLDivElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const workspacePickerRef = useRef<HTMLDivElement>(null);

  const setView = useCallback(
    (nextView: ViewName) => {
      router.push(hrefForView(businessUnit, nextView));
    },
    [businessUnit, router],
  );

  useEffect(() => {
    if (!state) return;
    const allowedUnits = businessUnitsForRole(role);
    if (!allowedUnits.includes(routeWorkspace)) {
      router.replace(allowedUnits[0] === "TRAVEL" ? "/travel" : "/hotel");
      return;
    }
    const allowedViews = roleViewAccess[role];
    if (allowedViews && !allowedViews.includes(view)) {
      router.replace(routeWorkspace === "TRAVEL" ? "/travel" : "/hotel");
    }
  }, [role, routeWorkspace, router, state, view]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  const loadState = useCallback(
    async (
      selectedRole: AppRole,
      selectedUnit: BusinessUnit,
      silent = false,
    ) => {
      const sequence = ++loadSequence.current;
      const snapshotKey = `${selectedRole}:${selectedUnit}`;
      if (!silent) setLoading(true);
      setError("");
      try {
        if (appMode === "production") {
          const context = await productionApi("/api/context");
          const actualRole = String((context.user as Row).role) as AppRole;
          const allowedUnits = businessUnitsForRole(actualRole);
          const effectiveUnit = allowedUnits.includes(selectedUnit)
            ? selectedUnit
            : (allowedUnits[0] ?? "HOTEL");
          if (effectiveUnit === "TRAVEL") {
            const travel = await productionApi("/api/travel");
            if (sequence !== loadSequence.current) return;
            setRole(actualRole);
            setState({ ...productionShell(context, [], [], [], travel), businessUnit: "TRAVEL" });
            setLastRefreshedAt(new Date());
            return;
          }
          const [reservationPage, roomPage, folioPage, operations] =
            await Promise.all([
              roleCan(actualRole, "reservation.read")
                ? productionApi("/api/reservations?pageSize=25")
                : Promise.resolve({ items: [] }),
              productionApi("/api/rooms"),
              roleCan(actualRole, "billing.view")
                ? productionApi("/api/folios")
                : Promise.resolve({ items: [] }),
              productionApi("/api/operations"),
            ]);
          if (sequence !== loadSequence.current) return;
          setRole(actualRole);
          setState({
            ...productionShell(
              context,
              reservationPage.items as Row[],
              roomPage.items as Row[],
              folioPage.items as Row[],
              operations,
            ),
            businessUnit: effectiveUnit,
          });
          setLastRefreshedAt(new Date());
          return;
        }
        const deviceReservations = await getLocalOfflineReservations();
        if (sequence === loadSequence.current)
          setLocalReservations(deviceReservations);
        const response = await apiFetch("/api/demo", {
          headers: {
            "x-demo-role": selectedRole,
            "x-business-unit": selectedUnit,
          },
          cache: "no-store",
        });
        const body = (await response.json()) as DemoState & {
          error?: { message?: string };
        };
        if (!response.ok)
          throw new Error(
            body.error?.message ?? "Unable to load Master Hub data.",
          );
        if (sequence !== loadSequence.current) return;
        const normalizedBody = {
          ...body,
          housekeepingStaff: body.housekeepingStaff ?? [],
          followUps: body.followUps ?? [],
          reservationInspectionSummaries:
            body.reservationInspectionSummaries ?? [],
        };
        setState(normalizedBody);
        setLastRefreshedAt(new Date());
        if (body.property.connectionStatus === "ONLINE" && body.cachePayload)
          await cacheCloudPayload(body.cachePayload);
        await cacheApplicationSnapshot(snapshotKey, {
          ...normalizedBody,
          cachePayload: undefined,
        }).catch(() => undefined);
        setLocalReservations(await getLocalOfflineReservations());
      } catch (cause) {
        if (sequence !== loadSequence.current) return;
        if (appMode === "production") {
          setState(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load production reservation data.",
          );
          return;
        }
        const cached = await getApplicationSnapshot<DemoState>(
          snapshotKey,
        ).catch(() => null);
        if (cached && selectedUnit === "HOTEL") {
          setState({
            ...cached,
            reservationInspectionSummaries:
              cached.reservationInspectionSummaries ?? [],
            property: { ...cached.property, connectionStatus: "OFFLINE" },
            cachePayload: undefined,
          });
          setSurface("PROPERTY");
          setLastRefreshedAt(
            cached.property.lastSyncAt
              ? new Date(String(cached.property.lastSyncAt))
              : null,
          );
        } else {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load application data.",
          );
        }
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    },
    [appMode],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => void loadState(role, businessUnit),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [businessUnit, loadState, role]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadUiStyle()
        .then((savedStyle) => {
          if (active) setUiStyle(savedStyle);
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!appearanceMenuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!appearancePickerRef.current?.contains(event.target as Node))
        setAppearanceMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAppearanceMenuOpen(false);
      window.requestAnimationFrame(() => appearanceButtonRef.current?.focus());
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [appearanceMenuOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!workspacePickerRef.current?.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceMenuOpen]);

  useEffect(() => {
    const online = () => {
      setBrowserOnline(true);
      if (appMode === "production") {
        void loadState(role, businessUnit, true);
      } else if (
        businessUnit === "HOTEL" &&
        roleCan(role, "offline.reservation.create")
      ) {
        void syncDeviceQueues((payload) =>
          sendDemoCommand(role, businessUnit, payload),
        ).finally(() => loadState(role, businessUnit, true));
      } else {
        void loadState(role, businessUnit, true);
      }
    };
    const offline = () => {
      setBrowserOnline(false);
      if (businessUnit === "HOTEL") setSurface("PROPERTY");
    };
    const initialStatusTimer = window.setTimeout(
      () => setBrowserOnline(navigator.onLine),
      0,
    );
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.clearTimeout(initialStatusTimer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [appMode, businessUnit, loadState, role]);

  useEffect(() => {
    const refreshVisible = () => {
      const offlinePropertyTerminal =
        businessUnit === "HOTEL" &&
        surface === "PROPERTY" &&
        (state?.property.connectionStatus === "OFFLINE" || !browserOnline);
      if (document.visibilityState === "visible" && !offlinePropertyTerminal)
        void loadState(role, businessUnit, true);
    };
    const interval = window.setInterval(refreshVisible, 10_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [
    browserOnline,
    businessUnit,
    loadState,
    role,
    state?.property.connectionStatus,
    surface,
  ]);

  async function command(payload: Record<string, unknown>) {
    if (appMode === "production") {
      const action = String(payload.action ?? "");
      const offlineNow = !browserOnline || (surface === "PROPERTY" && state?.property.connectionStatus === "OFFLINE");
      if (offlineNow) {
        assertOfflineCommandQueueable(action);
        if (!state?.organisationId || !state.property.id || !state.actor.id) throw new Error("Offline device context is unavailable. Reconnect once before queuing changes.");
        const entityId = action === "RECORD_HOUSEKEEPING_OUTCOME" ? String(payload.taskId ?? "") : null;
        const queued = await enqueueOfflineMutation({ organisationId: state.organisationId, propertyId: state.property.id, userId: state.actor.id, command: action, entityType: action === "RECORD_HOUSEKEEPING_OUTCOME" ? "HOUSEKEEPING_TASK" : "RESERVATION", entityId, payload });
        notify("Change saved offline. It will sync when the connection returns.");
        return { queued: true, clientMutationId: queued.clientMutationId };
      }
      const route = routeProductionCommand(payload);
      return productionApi(route.path, { method: route.method, body: JSON.stringify(route.body) });
    }
    return sendDemoCommand(role, businessUnit, payload);
  }

  function chooseUiStyle(nextStyle: UiStyle) {
    setUiStyle(nextStyle);
    setAppearanceMenuOpen(false);
    void saveUiStyle(nextStyle).catch(() => undefined);
    window.requestAnimationFrame(() => appearanceButtonRef.current?.focus());
  }

  async function changeNetwork(next: "ONLINE" | "OFFLINE") {
    try {
      if (appMode === "production") {
        notify("Network simulation is available only in demo mode.");
        return;
      }
      if (next === "ONLINE") {
        const result = await command({ action: "SET_NETWORK", status: next });
        const {
          syncedReservations,
          reservationConflicts,
          uploadedCount,
          deferredBills,
          missingDocuments,
        } = await syncDeviceQueues(command);
        const summary = result.reconnectSummary;
        setReconnectSummary(
          summary && typeof summary === "object" && !Array.isArray(summary)
            ? {
                ...(summary as Row),
                offlineWalkInsSynced: syncedReservations,
                offlineWalkInsPending: reservationConflicts,
                offlineBillsDeferred: deferredBills + missingDocuments,
                offlineBillsPending:
                  Number((summary as Row).offlineBillsPending ?? 0) +
                  uploadedCount,
              }
            : syncedReservations ||
                reservationConflicts ||
                uploadedCount ||
                deferredBills ||
                missingDocuments
              ? {
                  newReservations: 0,
                  updatedReservations: 0,
                  offlineWalkInsSynced: syncedReservations,
                  offlineWalkInsPending: reservationConflicts,
                  offlineBillsPending: uploadedCount,
                  offlineBillsDeferred: deferredBills + missingDocuments,
                }
              : null,
        );
        setLocalReservations(await getLocalOfflineReservations());
        notify(
          reservationConflicts || deferredBills || missingDocuments
            ? `Connection restored. ${syncedReservations} walk-ins synced; ${reservationConflicts} reservations and ${deferredBills + missingDocuments} bills need review.`
            : `Connection restored. ${syncedReservations} offline walk-in reservation${syncedReservations === 1 ? "" : "s"} synced.`,
        );
      } else {
        await command({ action: "SET_NETWORK", status: next });
        setSurface("PROPERTY");
        setView("Offline Billing");
        notify("Hotel terminal is now in restricted offline continuity mode.");
      }
      await loadState(role, businessUnit, true);
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Network state could not be changed.",
      );
    }
  }

  function changeRole(nextRole: AppRole) {
    setRole(nextRole);
    const units = businessUnitsForRole(nextRole);
    const nextUnit = units.includes(businessUnit) ? businessUnit : units[0];
    if (nextUnit) router.push(nextUnit === "TRAVEL" ? "/travel" : "/hotel");
    setSurface("MASTER_HUB");
    setSelectedReservation(null);
  }

  function changeBusinessUnit(next: BusinessUnit) {
    if (!businessUnitsForRole(role).includes(next)) return;
    setWorkspaceMenuOpen(false);
    setSurface("MASTER_HUB");
    setSearch("");
    setSelectedReservation(null);
    router.push(next === "TRAVEL" ? "/travel" : "/hotel");
  }

  const allowedViews = roleViewAccess[role];
  const visibleGroups = navigationGroups
    .filter((group) => group.workspace === businessUnit)
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !allowedViews || allowedViews.includes(item.label),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const availableBusinessUnits = businessUnitsForRole(role);
  const canSwitchUnit = availableBusinessUnits.length > 1;
  const propertyOffline =
    state?.property?.connectionStatus === "OFFLINE" || !browserOnline;
  const propertyRestricted =
    businessUnit === "HOTEL" && surface === "PROPERTY" && propertyOffline;
  const canCreateReservation = roleCan(
    role,
    propertyRestricted ? "offline.reservation.create" : "reservation.write",
  );
  const focusedOperationsRole =
    role === "HOUSEKEEPING" || role === "RESTAURANT";

  useEffect(() => {
    if (appMode !== "production" || !browserOnline || businessUnit !== "HOTEL" || !state?.organisationId || !state.property.id) return;
    void runOfflineSync({ organisationId: state.organisationId, propertyId: state.property.id, userId: state.actor.id }).then(result => {
      if (result.synced > 0) void loadState(role, businessUnit, true);
      if (result.conflict > 0) notify(`${result.conflict} offline change${result.conflict === 1 ? " needs" : "s need"} review.`);
      else if (result.failed > 0) notify("Offline sync failed. Open Device Status for details.");
    });
  }, [appMode, browserOnline, businessUnit, loadState, notify, role, state?.actor.id, state?.organisationId, state?.property.id]);
  const viewState = useMemo<DemoState | null>(() => {
    if (!state || businessUnit !== "HOTEL") return state;
    const pendingRows: Row[] = localReservations
      .filter((reservation) => reservation.syncStatus !== "SYNCED")
      .map((reservation) => ({
        id: reservation.id,
        reference: reservation.localReference,
        guestId: reservation.guestId,
        guestName: reservation.guestName,
        email: reservation.email,
        phone: reservation.phone,
        city: reservation.city,
        dietaryRequirements: reservation.dietaryRequirements,
        guestCount: reservation.guestCount,
        roomNumber: null,
        roomType: reservation.roomType,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        status: reservation.status,
        source: reservation.source,
        mealPlan: reservation.mealPlan,
        localOnly: true,
        syncStatus: reservation.syncStatus,
        syncError: reservation.syncError,
      }));
    return { ...state, reservations: [...state.reservations, ...pendingRows] };
  }, [businessUnit, localReservations, state]);
  const searchResults = useMemo<Row[]>(() => {
    if (!viewState || search.trim().length < 2) return [];
    const query = search.toLowerCase();
    if (businessUnit === "TRAVEL") {
      return [
        ...viewState.inquiries
          .filter((item) =>
            [item.reference, item.customerName, item.service].some((value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(query),
            ),
          )
          .map((item) => ({ ...item, searchKind: "INQUIRY" })),
        ...viewState.packages
          .filter((item) =>
            [item.name, item.locations].some((value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(query),
            ),
          )
          .map((item) => ({ ...item, searchKind: "PACKAGE" })),
      ].slice(0, 6);
    }
    return viewState.reservations
      .filter((reservation) =>
        [
          reservation.reference,
          reservation.guestName,
          reservation.roomNumber,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query),
        ),
      )
      .map((item) => ({ ...item, searchKind: "BOOKING" }))
      .slice(0, 6);
  }, [businessUnit, search, viewState]);

  return (
    <div
      className={`hotel-app platform-app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      data-ui-style={uiStyle}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        menuOpen={menuOpen}
        pathname={pathname}
        groups={visibleGroups}
        brand={
          <SidebarLogo
            key={sidebarCollapsed ? "short" : "full"}
            collapsed={sidebarCollapsed}
          />
        }
        workspaceSwitcher={
          <WorkspaceSwitcher
            containerRef={workspacePickerRef}
            businessUnit={businessUnit}
            availableUnits={availableBusinessUnits}
            open={workspaceMenuOpen}
            canSwitch={canSwitchUnit}
            renderIcon={(unit, size) => <AppGlyph name={unit === "HOTEL" ? "hotel" : "travel"} size={size} />}
            onToggle={() => setWorkspaceMenuOpen((open) => !open)}
            onChange={changeBusinessUnit}
          />
        }        verificationCount={
          state?.offlineBills.filter((bill) => bill.status !== "VERIFIED")
            .length ?? 0
        }
        renderIcon={(label) => (
          <AppGlyph
            name={navGlyphs[label]}
            size={19}
            className="invert-on-active"
          />
        )}
        onCollapse={() => setSidebarCollapsed(true)}
        onExpand={() => setSidebarCollapsed(false)}
        onNavigate={() => setMenuOpen(false)}
      />
      <div className="app-column">
        <Topbar>
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            <Menu size={19} />
          </button>
          <div className="search-shell">
            <label className="global-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Global search"
                placeholder={
                  businessUnit === "HOTEL"
                    ? "Search guests, bookings, rooms..."
                    : "Search inquiries, packages, clients..."
                }
              />
              <kbd>Ctrl + K</kbd>
            </label>
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((result) => (
                  <button
                    key={`${String(result.searchKind)}-${String(result.id)}`}
                    onClick={() => {
                      if (result.searchKind === "BOOKING")
                        setSelectedReservation(result);
                      else
                        setView(
                          result.searchKind === "INQUIRY"
                            ? "Inquiry CRM"
                            : "Packages & Tours",
                        );
                      setSearch("");
                    }}
                  >
                    <span>
                      {String(
                        result.guestName ?? result.customerName ?? result.name,
                      )}
                    </span>
                    <small>
                      {result.searchKind === "BOOKING"
                        ? `${String(result.reference)} Â· Room ${String(result.roomNumber ?? "TBA")}`
                        : result.searchKind === "INQUIRY"
                          ? `${String(result.reference)} Â· ${String(result.service)}`
                          : String(result.locations)}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            {businessUnit === "HOTEL" ? (
              focusedOperationsRole ? (
                <span className="connection-pill online">
                  <AppGlyph
                    name={role === "RESTAURANT" ? "restaurant" : "housekeeping"}
                    size={20}
                  />{" "}
                  {role === "RESTAURANT"
                    ? "Restaurant workspace"
                    : "Housekeeping workspace"}
                </span>
              ) : (
                <>
                  <span
                    className={`connection-pill ${propertyOffline ? "offline" : "online"}`}
                  >
                    <AppGlyph
                      name={propertyOffline ? "offline" : "cloud-network"}
                      size={20}
                    />{" "}
                    Hotel {propertyOffline ? "offline" : "online"}
                  </span>
                  <OperatingSurfaceSwitcher
                    surface={surface}
                    renderIcon={(current) => <AppGlyph name={current === "MASTER_HUB" ? "cloud-network" : "hotel"} size={19} />}
                    onToggle={() => setSurface((current) => current === "MASTER_HUB" ? "PROPERTY" : "MASTER_HUB")}
                  />
                </>
              )
            ) : (
              <span className="connection-pill online">
                <AppGlyph name="travel" size={20} /> Travel workspace
              </span>
            )}
            <span
              className="live-booking-pill"
              title={
                lastRefreshedAt
                  ? `Last updated ${lastRefreshedAt.toLocaleTimeString("en-IN")}`
                  : "Connecting"
              }
            >
              <i /> Live
            </span>
            <div className="appearance-picker" ref={appearancePickerRef}>
              <button
                ref={appearanceButtonRef}
                type="button"
                className="ui-style-trigger"
                aria-label={`Interface style: ${uiStyle === "sage" ? "BrainADZ Sage" : "Classic Blue"}`}
                aria-expanded={appearanceMenuOpen}
                aria-haspopup="dialog"
                onClick={() => setAppearanceMenuOpen((open) => !open)}
              >
                <Palette size={16} />
                <span>{uiStyle === "sage" ? "Sage" : "Classic Blue"}</span>
                <ChevronDown size={13} />
              </button>
              {appearanceMenuOpen && (
                <section
                  className="appearance-menu"
                  role="dialog"
                  aria-label="Choose interface style"
                >
                  <div className="appearance-menu-heading">
                    <span>
                      <strong>Interface style</strong>
                      <small>Choose the look of your workspace</small>
                    </span>
                  </div>
                  <div
                    className="appearance-options"
                    role="radiogroup"
                    aria-label="Interface styles"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={uiStyle === "sage"}
                      className={uiStyle === "sage" ? "selected" : ""}
                      onClick={() => chooseUiStyle("sage")}
                    >
                      <span
                        className="style-preview sage-preview"
                        aria-hidden="true"
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                      <span>
                        <strong>BrainADZ Sage</strong>
                        <small>Current warm green interface</small>
                      </span>
                      <span className="style-check">
                        {uiStyle === "sage" && <Check size={13} />}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={uiStyle === "classic-blue"}
                      className={uiStyle === "classic-blue" ? "selected" : ""}
                      onClick={() => chooseUiStyle("classic-blue")}
                    >
                      <span
                        className="style-preview blue-preview"
                        aria-hidden="true"
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                      <span>
                        <strong>Classic Blue</strong>
                        <small>Booklet-inspired red, white and navy</small>
                      </span>
                      <span className="style-check">
                        {uiStyle === "classic-blue" && <Check size={13} />}
                      </span>
                    </button>
                  </div>
                  <p>
                    Both options use the same data, permissions and workflows.
                  </p>
                </section>
              )}
            </div>
            <NotificationBell state={state} onOpen={setView}/>
            {appMode === "demo" ? (
              <label className="role-select">
                <span aria-hidden="true">
                  <AppGlyph name="staff" size={21} />
                </span>
                <select
                  value={role}
                  onChange={(event) =>
                    changeRole(event.target.value as AppRole)
                  }
                  aria-label="Demo role"
                >
                  {roles.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              state && (
                <div className="account-menu-wrap">
                  <button
                    type="button"
                    className="account-trigger"
                    aria-expanded={accountMenuOpen}
                    onClick={() => setAccountMenuOpen((value) => !value)}
                  >
                    <AccountAvatar user={state.actor} />
                    <span>
                      <strong>{state.actor.name}</strong>
                      <small>{state.actor.role.replaceAll("_", " ")}</small>
                    </span>
                    <ChevronDown size={13} />
                  </button>
                  {accountMenuOpen && (
                    <section className="account-menu">
                      <div>
                        <AccountAvatar user={state.actor} />
                        <span>
                          <strong>{state.actor.name}</strong>
                          <small>{state.actor.email}</small>
                          <em>{state.actor.role.replaceAll("_", " ")}</em>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setProfileOpen(true);
                        }}
                      >
                        <User size={16} /> My Profile
                      </button>
                      {onLogout && (
                        <button type="button" onClick={() => void onLogout()}>
                          <LogOut size={16} /> Logout
                        </button>
                      )}
                    </section>
                  )}
                </div>
              )
            )}
          </div>
        </Topbar>

        <main className="main-content platform-content">
          {propertyRestricted && !focusedOperationsRole && (
            <OfflineBanner lastSync={state?.property.lastSyncAt} />
          )}
          {businessUnit === "HOTEL" &&
            !focusedOperationsRole &&
            surface === "MASTER_HUB" &&
            propertyOffline && (
              <MasterHubOfflineAlert
                state={state}
                onOpen={() => setView("Reservations")}
              />
            )}
          {reconnectSummary && (
            <ReconnectBanner
              summary={reconnectSummary}
              onDismiss={() => setReconnectSummary(null)}
            />
          )}
          {error && (
            <div className="error-banner">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button onClick={() => loadState(role, businessUnit)}>
                Retry
              </button>
            </div>
          )}
          {loading && !viewState ? (
            <LoadingView />
          ) : viewState ? (
            <ViewRouter
              view={view}
              state={viewState}
              role={role}
              surface={surface}
              propertyRestricted={propertyRestricted}
              productionMode={appMode === "production"}
              setView={setView}
              setSelectedReservation={setSelectedReservation}
              openReservation={() => {
                if (canCreateReservation) setReservationModal(true);
                else notify("This role cannot create reservations.");
              }}
              canCreateReservation={canCreateReservation}
              businessUnit={businessUnit}
              command={command}
              refresh={() => propertyOffline && appMode === "production" ? Promise.resolve() : loadState(role, businessUnit, true)}
              updateState={setState}
              notify={notify}
              changeNetwork={changeNetwork}
            />
          ) : null}
        </main>
      </div>

      {reservationModal && viewState && canCreateReservation && (
        <ReservationModal
          state={viewState}
          surface={surface}
          offlineLocal={propertyRestricted}
          productionMode={appMode === "production"}
          onClose={() => setReservationModal(false)}
          onSubmit={async (form) => {
            try {
              if (propertyRestricted) {
                if (!roleCan(role, "offline.reservation.create"))
                  throw new Error(
                    "This role cannot create offline walk-in reservations.",
                  );
                const local = await createLocalWalkInReservation({
                  ...(form as Parameters<
                    typeof createLocalWalkInReservation
                  >[0]),
                  createdById: String(viewState.actor.id),
                  createdByName: String(viewState.actor.name),
                  createdByRole: role,
                });
                setLocalReservations(await getLocalOfflineReservations());
                setReservationModal(false);
                notify(
                  `${local.localReference} saved securely on this front-desk device and queued for sync.`,
                );
                return;
              }
              if (!roleCan(role, "reservation.write"))
                throw new Error("This role cannot create reservations.");
              const result = await command({
                action: "CREATE_RESERVATION",
                surface,
                ...form,
              });
              setReservationModal(false);
              await loadState(role, businessUnit, true);
              notify(
                result.contactRequired
                  ? `${result.reference} created in Master Hub. Property contact is required.`
                  : `${result.reference} confirmed in Master Hub.`,
              );
            } catch (cause) {
              notify(
                cause instanceof Error
                  ? cause.message
                  : "Reservation could not be created.",
              );
            }
          }}
        />
      )}
      {selectedReservation && state && (
        <StayDrawer
          reservation={selectedReservation}
          state={state}
          restricted={propertyRestricted}
          surface={surface}
          productionMode={appMode === "production"}
          notify={notify}
          onClose={() => setSelectedReservation(null)}
          onCommand={async (payload, message) => {
            try {
              await command(payload);
              await loadState(role, businessUnit, true);
              setSelectedReservation(null);
              notify(message);
            } catch (cause) {
              notify(
                cause instanceof Error ? cause.message : "Operation failed.",
              );
            }
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {profileOpen && state && (
        <ProfileModal
          initial={state.actor}
          property={state.property}
          onClose={() => setProfileOpen(false)}
          onSaved={async () => {
            setProfileOpen(false);
            await loadState(role, businessUnit, true);
            notify("Profile updated.");
          }}
        />
      )}
    </div>
  );
}

export type PlatformViewProps = {
  view: ViewName;
  state: DemoState;
  role: AppRole;
  surface: Surface;
  businessUnit: BusinessUnit;
  propertyRestricted: boolean;
  productionMode: boolean;
  setView: (view: ViewName) => void;
  setSelectedReservation: (reservation: Row) => void;
  openReservation: () => void;
  canCreateReservation: boolean;
  command: (payload: Record<string, unknown>) => Promise<Row>;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  updateState: Dispatch<SetStateAction<DemoState | null>>;
  changeNetwork: (status: "ONLINE" | "OFFLINE") => Promise<void>;
};

function ViewRouter(props: PlatformViewProps) {
  if (props.productionMode && ['Menu Management','Lost & Found','Maintenance','Inventory Movments','Inventory Movements','Room Types & Rates','Users & Permissions','Properties & Settings','Restaurant Orders','Room Service','Meal Service'].includes(props.view)) return <OperationalWorkspace {...props}/>;
  if (props.view === "Overview") {
    if (props.businessUnit === "TRAVEL") return <TravelOverviewView {...props} />;
    if (props.role === "HOUSEKEEPING") return <HousekeepingOverviewView {...props} />;
    if (props.role === "RESTAURANT") return <RestaurantOverviewView {...props} />;
    return <OverviewView {...props} />;
  }
  if (props.view === "Reservations") return <ReservationsView {...props} />;
  if (props.view === "Connectivity") return <ConnectivityView {...props} />;
  if (props.view === "Front Desk") return props.productionMode ? <ProductionFrontDesk openReservation={props.openReservation} openStay={props.setSelectedReservation} notify={props.notify} refreshKey={props.state.reservations.map((item) => `${String(item.id)}:${String(item.version)}`).join("|")} /> : <FrontDeskView {...props} />;
  if (props.view === "Guests") return props.productionMode ? <ProductionGuests notify={props.notify} role={props.role} /> : <GuestsView {...props} />;
  const views: Partial<Record<ViewName, ComponentType<PlatformViewProps>>> = {
    "Folios & Billing": FoliosBillingView, "Room Calendar": RoomCalendarView, "Arrivals & Departures": ArrivalsDeparturesView,
    "Room Types & Rates": RoomTypesRatesView, "Guest Profiles": GuestProfilesView, Invoices: InvoicesView,
    Housekeeping: HousekeepingView, Maintenance: MaintenanceView, Inventory: InventoryView,
    "Inventory Movements": InventoryMovementsView, "Lost & Found": LostFoundView, "Restaurant Orders": RestaurantOrdersView,
    "Room Service": RoomServiceView, "Meal Service": MealServiceView, "Menu Management": MenuManagementView,
    "Offline Billing": OfflineBillingView, Verification: VerificationView, "Device Status": DeviceStatusView,
    Integrations: IntegrationsView, Reports: props.businessUnit === "TRAVEL" ? TravelReportsView : ReportsView,
    "Audit Logs": props.businessUnit === "TRAVEL" ? TravelAuditLogsView : AuditLogsView,
    "Users & Permissions": UsersPermissionsView, "Properties & Settings": PropertiesSettingsView,
    "Packages & Tours": PackagesToursView, Tours: ToursView, Participants: ParticipantsView,
    "Tour Managers": TourManagersView, "Inquiry CRM": InquiryCRMView, "Sales Pipeline": SalesPipelineView,
    "Follow-ups": FollowUpsView, Communications: CommunicationsView,
  };
  const ActiveView = views[props.view];
  return ActiveView ? <ActiveView {...props} /> : null;
}

function headingGlyph(eyebrow: string, title: string): AppGlyphName {
  const context = `${eyebrow} ${title}`.toLowerCase();
  if (context.includes("audit")) return "audit";
  if (context.includes("report") || context.includes("performance"))
    return "reports";
  if (context.includes("integration") || context.includes("provider"))
    return "integrations";
  if (context.includes("restaurant") || context.includes("meal"))
    return "restaurant";
  if (context.includes("inventory")) return "inventory";
  if (context.includes("maintenance")) return "maintenance";
  if (context.includes("housekeeping") || context.includes("room service"))
    return "housekeeping";
  if (context.includes("verification") || context.includes("reconciliation"))
    return "receipt-verification";
  if (context.includes("device")) return "device-status";
  if (context.includes("offline") && context.includes("billing"))
    return "offline-billing";
  if (context.includes("offline")) return "offline";
  if (context.includes("billing") || context.includes("folio")) return "folio";
  if (context.includes("connect")) return "cloud-network";
  if (context.includes("inquiry")) return "inquiry";
  if (context.includes("travel") || context.includes("package"))
    return "travel";
  if (context.includes("guest")) return "guest";
  if (context.includes("reservation")) return "booking-calendar";
  if (context.includes("front desk")) return "front-desk";
  return "hotel";
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="page-heading platform-page-heading">
      <div>
        <p className="eyebrow">
          <AppGlyph name={headingGlyph(eyebrow, title)} size={20} /> {eyebrow}
        </p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </section>
  );
}

function OfflineBanner({ lastSync }: { lastSync?: string }) {
  return (
    <section className="offline-banner" role="status">
      <span>
        <AppGlyph name="offline" size={28} />
      </span>
      <div>
        <strong>Hotel offline</strong>
        <p>
          Last Master Hub sync: {dateTime(lastSync)}. Walk-in reservations and
          billing records will stay on this device until connection returns.
        </p>
      </div>
      <span className="restricted-label">
        <AppGlyph name="offline-billing" size={18} /> Local continuity
      </span>
    </section>
  );
}

function MasterHubOfflineAlert({
  state,
  onOpen,
}: {
  state: DemoState | null;
  onOpen: () => void;
}) {
  const count =
    state?.reservations.filter(
      (reservation) =>
        Boolean(reservation.createdWhilePropertyOffline) &&
        reservation.contactStatus === "NOT_CONTACTED",
    ).length ?? 0;
  return (
    <section className="hub-offline-alert">
      <span>
        <AppGlyph name="hotel" size={27} />
      </span>
      <div>
        <strong>Property currently offline</strong>
        <p>
          Master Hub remains authoritative. {count} cloud reservation
          {count === 1 ? "" : "s"} require operational contact with{" "}
          {state?.property.name ?? "the property"}.
        </p>
      </div>
      <button onClick={onOpen}>
        Open reservations <ArrowRight size={14} />
      </button>
    </section>
  );
}

function ReconnectBanner({
  summary,
  onDismiss,
}: {
  summary: Row;
  onDismiss: () => void;
}) {
  return (
    <section className="reconnect-banner">
      <span>
        <AppGlyph name="cloud-network" size={27} />
      </span>
      <div>
        <strong>Connection restored</strong>
        <p>
          {Number(summary.offlineWalkInsSynced ?? 0)} walk-in reservation
          {Number(summary.offlineWalkInsSynced ?? 0) === 1 ? "" : "s"} synced Â·{" "}
          {Number(summary.offlineWalkInsPending ?? 0)} need review Â·{" "}
          {Number(summary.offlineBillsPending ?? 0)} bills uploaded Â·{" "}
          {Number(summary.offlineBillsDeferred ?? 0)} bills held on device
        </p>
      </div>
      <button onClick={onDismiss}>
        <X size={16} />
      </button>
    </section>
  );
}

function LoadingView() {
  return (
    <div className="loading-view">
      <span />
      <span />
      <span />
    </div>
  );
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}
export function AvailabilityGrid({
  state,
  onNewBooking,
  restricted,
}: {
  state: DemoState;
  onNewBooking: () => void;
  restricted: boolean;
}) {
  const [todayKey, setTodayKey] = useState(() => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  });

  useEffect(() => {
    const updateCurrentDate = () => {
      const now = new Date();

      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");

      const nextTodayKey = `${year}-${month}-${day}`;

      setTodayKey((current) =>
        current === nextTodayKey ? current : nextTodayKey,
      );
    };

    updateCurrentDate();

    const intervalId = window.setInterval(
      updateCurrentDate,
      60_000,
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const dates = Array.from({ length: 7 }, (_, index) => {
    const [year, month, day] = todayKey.split("-").map(Number);

    const date = new Date(
      year,
      month - 1,
      day + index,
    );

    const dateYear = date.getFullYear();
    const dateMonth = String(date.getMonth() + 1).padStart(2, "0");
    const dateDay = String(date.getDate()).padStart(2, "0");

    return `${dateYear}-${dateMonth}-${dateDay}`;
  });

  const roomTypes = ["Standard", "Deluxe", "Premium", "Suite"];

  return (
    <section className="availability-card">
      <div className="availability-header">
        <div>
          <p className="section-kicker">Live room inventory</p>
          <h2>Room availability grid</h2>
        </div>

        <div>
          <button
            className="compact-button"
            disabled={restricted}
            onClick={onNewBooking}
          >
            <Plus size={14} /> New booking
          </button>
        </div>
      </div>

      <div
        className="availability-grid"
        role="table"
        aria-label="Room availability by date"
      >
        <div
          className="availability-label availability-corner"
          role="columnheader"
        >
          Room type
        </div>

        {dates.map((date) => {
          const [year, month, day] = date.split("-").map(Number);

          const displayDate = new Date(
            year,
            month - 1,
            day,
          );

          return (
            <div
              className="availability-label date-label"
              role="columnheader"
              key={date}
            >
              <strong>
                {new Intl.DateTimeFormat("en-IN", {
                  weekday: "short",
                }).format(displayDate)}
              </strong>

              <span>
                {new Intl.DateTimeFormat("en-IN", {
                  day: "2-digit",
                  month: "short",
                }).format(displayDate)}
              </span>
            </div>
          );
        })}

        {roomTypes.map((roomType) => {
          const total = state.rooms.filter(
            (room) => room.roomType === roomType,
          ).length;

          return (
            <div
              className="availability-row"
              role="row"
              key={roomType}
            >
              <div
                className="availability-label room-label"
                role="rowheader"
              >
                <strong>{roomType}</strong>

                <span>
                  {total} {total === 1 ? "room" : "rooms"}
                </span>
              </div>

              {dates.map((date) => {
                const occupied = state.reservations.filter(
                  (reservation) =>
                    reservation.roomType === roomType &&
                    ["CONFIRMED", "HELD", "CHECKED_IN"].includes(
                      String(reservation.status),
                    ) &&
                    String(reservation.arrivalDate) <= date &&
                    String(reservation.departureDate) > date,
                ).length;

                const available = Math.max(
                  0,
                  total - occupied,
                );

                const tone =
                  available <= 1
                    ? "low"
                    : available <= Math.max(2, Math.round(total / 2))
                      ? "medium"
                      : "high";

                return (
                  <button
                    type="button"
                    role="cell"
                    className={`availability-cell ${tone}`}
                    key={date}
                    onClick={onNewBooking}
                    disabled={restricted}
                    aria-label={`${roomType}, ${date}: ${available} of ${total} available`}
                  >
                    <strong>
                      {available}/{total}
                    </strong>

                    <span>available</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}
export function MoneyInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <div className="money-input">
        <b>â‚¹</b>
        <input
          type="number"
          min="0"
          step="1"
          value={value / 100}
          disabled={disabled}
          onChange={(event) =>
            onChange(Math.max(0, Math.round(Number(event.target.value) * 100)))
          }
        />
      </div>
    </label>
  );
}
export function Status({ value }: { value: string }) {
  const normalized = value
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("_", "-")
    .replaceAll("/", "-");
  return (
    <span className={`status-badge status-${normalized}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function inspectionPresentation(
  summary: ReservationInspectionSummary | undefined,
  reservationStatus: string,
) {
  if (!summary)
    return reservationStatus === "CHECKED_OUT"
      ? {
          label: "Awaiting housekeeping",
          tone: "pending",
          glyph: "housekeeping" as AppGlyphName,
        }
      : {
          label: "Not due",
          tone: "neutral",
          glyph: "room-ready" as AppGlyphName,
        };
  if (
    summary.damageStatus === "CHARGED" ||
    summary.inspectionStatus === "DAMAGE_CHARGED"
  )
    return {
      label: `Damage charged Â· ${money(summary.chargeAmountPaise)}`,
      tone: "charged",
      glyph: "charge-receipt" as AppGlyphName,
    };
  if (
    summary.damageStatus === "WAIVED" ||
    summary.inspectionStatus === "DAMAGE_WAIVED"
  )
    return {
      label: "Damage reviewed Â· no charge",
      tone: "waived",
      glyph: "waived-charge" as AppGlyphName,
    };
  if (
    summary.result === "DAMAGE_FOUND" ||
    ["DAMAGE_REVIEW", "DAMAGE_REPORTED"].includes(summary.inspectionStatus)
  ) {
    const severity = String(summary.severity ?? "LOW").toLowerCase();
    return {
      label: `Damage Â· ${severity[0].toUpperCase()}${severity.slice(1)}`,
      tone: severity,
      glyph: "damage-alert" as AppGlyphName,
    };
  }
  if (summary.result === "NO_DAMAGE" || summary.inspectionStatus === "CLEARED")
    return {
      label: "Housekeeping cleared",
      tone: "cleared",
      glyph: "room-ready" as AppGlyphName,
    };
  return {
    label: "Awaiting housekeeping",
    tone: "pending",
    glyph: "housekeeping" as AppGlyphName,
  };
}
export function InspectionStatusBadge({
  summary,
  reservationStatus,
}: {
  summary?: ReservationInspectionSummary;
  reservationStatus: string;
}) {
  const presentation = inspectionPresentation(summary, reservationStatus);
  return (
    <span className={`inspection-badge inspection-${presentation.tone}`}>
      <AppGlyph name={presentation.glyph} size={21} />
      <span>{presentation.label}</span>
    </span>
  );
}
export function SandboxBadge({ value }: { value?: string | null }) {
  const safeValue = String(value ?? "").trim();

  const isSandbox = ["OTA", "WEBSITE", "SANDBOX", "AWAITING_API"].some((item) =>
    safeValue.toUpperCase().includes(item),
  );

  return (
    <span className={`sandbox-badge ${isSandbox ? "" : "neutral"}`}>
      {safeValue || "Not configured"}
    </span>
  );
}
export function Kpi({
  icon,
  label,
  value,
  detail,
  meta,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  meta: string;
  tone: string;
}) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <span className={`kpi-icon ${tone}`}>{icon}</span>
      <div className="kpi-label">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <span className="kpi-trend">{meta}</span>
    </article>
  );
}
export function ReservationCompact({ reservation }: { reservation: Row }) {
  return (
    <div className="arrival-row">
      <span className="record-icon" aria-hidden="true">
        <AppGlyph name="arrivals-departures" size={25} />
      </span>
      <div className="guest-details">
        <strong>{String(reservation.guestName)}</strong>
        <small>
          {String(reservation.reference)} Â· {String(reservation.roomType)}
        </small>
      </div>
      <div className="room-detail">
        <small>Room</small>
        <strong>{String(reservation.roomNumber ?? "TBA")}</strong>
      </div>
      <div className="time-detail">
        <strong>{shortDate(reservation.arrivalDate)}</strong>
        <Status value={String(reservation.status)} />
      </div>
    </div>
  );
}
export function MiniModule({
  icon,
  title,
  value,
  detail,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className="mini-module" onClick={onClick}>
      <span>{icon}</span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
      <ArrowRight size={16} />
    </button>
  );
}
