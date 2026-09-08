'use client';

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  IndianRupee,
  Menu,
  Palette,
  Pencil,
  Plus,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { businessUnitsForRole, calculateStayNights, roleCan, type AppRole, type BusinessUnit } from '@/lib/domain';
import { ExtraFeatureView, isExtraFeatureView, type ExtraFeatureViewName } from './primary-extra-features';
import { ProductionFrontDesk, ProductionGuests, ProductionReservationGuests } from './production-front-desk';
import {
  cacheApplicationSnapshot,
  cacheCloudPayload,
  createLocalWalkInReservation,
  createOnlineFolioPdf,
  generateOfflineBill,
  getBillBlob,
  getApplicationSnapshot,
  getCachedStay,
  getLocalOfflineReservations,
  getLocalOfflineBills,
  getOfflineReadiness,
  getPendingOfflineReservations,
  getRecoveryIssues,
  loadUiStyle,
  markOfflineReservationSynced,
  markOfflineReservationSyncFailed,
  markBillPrinted,
  saveUiStyle,
  searchCachedBookings,
  updateLocalBillStatus,
  type CachedBooking,
  type LocalOfflineReservation,
  type LocalOfflineBill,
  type MealService,
  type UiStyle,
} from '@/lib/offline-db';

// Expanded sidebar logo: public/main-logo.png.
const FULL_LOGO = '/main-logo.png';
// Collapsed sidebar logo: public/sidebar-logo.png.
const COLLAPSED_LOGO = '/sidebar-logo.png';

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  const [missing, setMissing] = useState(false);
  return <span className="sidebar-logo">
    {/* Keep existing branding as a fallback if a logo cannot be loaded. */}
    {!missing ? (
      // eslint-disable-next-line @next/next/no-img-element -- User-provided local logo placeholders.
      <img src={collapsed ? COLLAPSED_LOGO : FULL_LOGO} alt="Hotel Management" onError={() => setMissing(true)} />
    ) : collapsed ? <span aria-label="Hotel Management logo placeholder">HM</span> : <><strong>BrainADZ <span className="brand-live">Live</span></strong><small>Hospitality OS</small></>}
  </span>;
}

type Row = Record<string, unknown>;
type Property = { id: string; name: string; city: string; timezone?: string; connectionStatus: 'ONLINE' | 'OFFLINE'; lastSyncAt: string };
type Metrics = {
  occupancyPercent: number; totalRooms: number; occupiedRooms: number; availableRooms: number; readyRooms: number; dirtyRooms: number;
  maintenanceRooms: number; arrivalsToday: number; departuresToday: number; inHouseGuests: number; pendingPayments: number;
  revenuePaise: number; adrPaise: number; revParPaise: number; lowStockCount: number; unresolvedMaintenance: number; overdueFollowUps: number;
};
type DamageSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
type ReservationInspectionSummary = {
  reservationId: string;
  bookingReference?: string | null;
  roomNumber?: string | null;
  taskId: string;
  taskStatus: string;
  taskOutcome?: string | null;
  taskVersion: number;
  inspectionId?: string | null;
  inspectionStatus: 'PENDING' | 'CLEARED' | 'DAMAGE_REVIEW' | 'DAMAGE_REPORTED' | 'DAMAGE_CHARGED' | 'DAMAGE_WAIVED';
  result?: 'NO_DAMAGE' | 'DAMAGE_FOUND' | null;
  inspectionNotes?: string | null;
  severity?: DamageSeverity | null;
  completedBy?: string | null;
  completedAt?: string | null;
  damageReportId?: string | null;
  damageStatus?: 'PENDING_REVIEW' | 'CHARGED' | 'WAIVED' | null;
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
type DemoState = {
  actor: { id: string; name: string; email: string; role: AppRole };
  businessUnit: BusinessUnit;
  property: Property;
  metrics: Metrics;
  travelMetrics: { activePackages: number; openInquiries: number; pipelineValuePaise: number; customQuotes: number; pendingApprovals: number; overdueFollowUps: number };
  rooms: Row[];
  reservations: Row[];
  folios: Row[];
  folioLines: Row[];
  offlineBills: Row[];
  housekeeping: Row[];
  maintenance: Row[];
  inventory: Row[];
  restaurantOrders: Row[];
  restaurantMealBookings: Row[];
  restaurantArrivals: Row[];
  reservationInspectionSummaries: ReservationInspectionSummary[];
  damageReports: Row[];
  packages: Row[];
  inquiries: Row[];
  travelAssets: Row[];
  customPackages: Row[];
  customPackageItems: Row[];
  discountRequests: Row[];
  audit: Row[];
  cachePayload?: Parameters<typeof cacheCloudPayload>[0];
  sandbox: Record<string, string>;
};

type ViewName =
  | 'Overview' | 'Reservations' | 'Connectivity' | 'Front Desk' | 'Guests' | 'Folios & Billing'
  | 'Housekeeping' | 'Maintenance' | 'Inventory' | 'Restaurant Orders' | 'Packages & Tours' | 'Inquiry CRM'
  | 'Offline Billing' | 'Verification' | 'Device Status' | 'Integrations' | 'Reports' | 'Audit Logs'
  | ExtraFeatureViewName;
type Surface = 'MASTER_HUB' | 'PROPERTY';

type AppGlyphName =
  | 'occupancy' | 'booking-calendar' | 'front-desk' | 'guest' | 'folio'
  | 'housekeeping' | 'maintenance' | 'inventory' | 'restaurant' | 'travel'
  | 'inquiry' | 'offline' | 'policy' | 'payment' | 'integrations'
  | 'reports' | 'audit' | 'cloud-network' | 'hotel'
  | 'breakfast' | 'brunch' | 'lunch' | 'high-tea' | 'dinner' | 'supper'
  | 'room-ready' | 'booking-feed' | 'arrivals-departures' | 'staff'
  | 'wallet-alert' | 'damage-alert' | 'charge-receipt' | 'waived-charge'
  | 'device-status' | 'phone-chat' | 'email' | 'channel-sync' | 'smart-lock'
  | 'attention-queue' | 'offline-billing' | 'receipt-verification';

type AppGlyphDefinition = Readonly<{ column: number; row: number; grid: 4 | 5; atlas: string }>;

const primaryGlyph = (column: number, row: number): AppGlyphDefinition => ({ column, row, grid: 5, atlas: '/icons/brainadz-hospitality-atlas-v2.png' });
const statusGlyph = (column: number, row: number): AppGlyphDefinition => ({ column, row, grid: 4, atlas: '/icons/brainadz-hospitality-status-atlas-v2.png' });

const appGlyphCells: Record<AppGlyphName, AppGlyphDefinition> = {
  occupancy: primaryGlyph(0, 0), 'booking-calendar': primaryGlyph(1, 0), 'front-desk': primaryGlyph(2, 0), guest: primaryGlyph(3, 0), folio: primaryGlyph(4, 0),
  housekeeping: primaryGlyph(0, 1), maintenance: primaryGlyph(1, 1), inventory: primaryGlyph(2, 1), restaurant: primaryGlyph(3, 1), travel: primaryGlyph(4, 1),
  inquiry: primaryGlyph(0, 2), offline: primaryGlyph(1, 2), policy: primaryGlyph(2, 2), payment: primaryGlyph(3, 2), integrations: primaryGlyph(4, 2),
  reports: primaryGlyph(0, 3), audit: primaryGlyph(1, 3), 'cloud-network': primaryGlyph(2, 3), hotel: primaryGlyph(3, 3), breakfast: primaryGlyph(4, 3),
  brunch: primaryGlyph(0, 4), lunch: primaryGlyph(1, 4), 'high-tea': primaryGlyph(2, 4), dinner: primaryGlyph(3, 4), supper: primaryGlyph(4, 4),
  'room-ready': statusGlyph(0, 0), 'booking-feed': statusGlyph(1, 0), 'arrivals-departures': statusGlyph(2, 0), staff: statusGlyph(3, 0),
  'wallet-alert': statusGlyph(0, 1), 'damage-alert': statusGlyph(1, 1), 'charge-receipt': statusGlyph(2, 1), 'waived-charge': statusGlyph(3, 1),
  'device-status': statusGlyph(0, 2), 'phone-chat': statusGlyph(1, 2), email: statusGlyph(2, 2), 'channel-sync': statusGlyph(3, 2),
  'smart-lock': statusGlyph(0, 3), 'attention-queue': statusGlyph(1, 3), 'offline-billing': statusGlyph(2, 3), 'receipt-verification': statusGlyph(3, 3),
};

const navGlyphs: Record<ViewName, AppGlyphName> = {
  Overview: 'occupancy', Reservations: 'booking-calendar', Connectivity: 'cloud-network', 'Front Desk': 'front-desk', Guests: 'guest',
  'Folios & Billing': 'folio', Housekeeping: 'housekeeping', Maintenance: 'maintenance', Inventory: 'inventory', 'Restaurant Orders': 'restaurant',
  'Packages & Tours': 'travel', 'Inquiry CRM': 'inquiry', 'Offline Billing': 'offline-billing', Verification: 'receipt-verification', 'Device Status': 'device-status',
  Integrations: 'integrations', Reports: 'reports', 'Audit Logs': 'audit', 'Room Calendar': 'booking-calendar',
  'Arrivals & Departures': 'arrivals-departures', 'Room Types & Rates': 'hotel', 'Guest Profiles': 'guest', Invoices: 'charge-receipt',
  'Inventory Movements': 'inventory', 'Lost & Found': 'guest', 'Room Service': 'restaurant', 'Meal Service': 'breakfast', 'Menu Management': 'restaurant',
  Tours: 'travel', Participants: 'guest', 'Tour Managers': 'staff', 'Sales Pipeline': 'inquiry', 'Follow-ups': 'phone-chat',
  Communications: 'email', 'Users & Permissions': 'policy', 'Properties & Settings': 'hotel',
};

function AppGlyph({ name, size = 20, className = '' }: { name: AppGlyphName; size?: number; className?: string }) {
  const { column, row, grid, atlas } = appGlyphCells[name];
  const step = 100 / (grid - 1);
  return <span className={`app-glyph ${className}`.trim()} style={{ width: size, height: size, backgroundImage: `url(${atlas})`, backgroundSize: `${grid * 100}% ${grid * 100}%`, backgroundPosition: `${column * step}% ${row * step}%` }} aria-hidden="true" />;
}

const roles: Array<{ value: AppRole; label: string }> = [
  { value: 'OWNER', label: 'Owner / Super Admin' }, { value: 'MANAGER', label: 'Manager' }, { value: 'RECEPTION', label: 'Reception' },
  { value: 'TRAVEL_AGENT', label: 'Travel Agent' }, { value: 'TOUR_MANAGER', label: 'Tour Manager' }, { value: 'ACCOUNTS', label: 'Accounts' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping' }, { value: 'RESTAURANT', label: 'Restaurant' }, { value: 'REPORTING', label: 'Reporting User' },
];

const mealOptions: Array<{ value: MealService; label: string; glyph: AppGlyphName }> = [
  { value: 'BREAKFAST', label: 'Breakfast', glyph: 'breakfast' },
  { value: 'BRUNCH', label: 'Brunch', glyph: 'brunch' },
  { value: 'LUNCH', label: 'Lunch', glyph: 'lunch' },
  { value: 'HIGH_TEA', label: 'High tea', glyph: 'high-tea' },
  { value: 'DINNER', label: 'Dinner', glyph: 'dinner' },
  { value: 'SUPPER', label: 'Supper', glyph: 'supper' },
];

function mealLabel(value: unknown) {
  return mealOptions.find((item) => item.value === value)?.label ?? String(value).replaceAll('_', ' ');
}

const navGroups: Array<{ label: string; unit: BusinessUnit | 'BOTH'; items: ViewName[] }> = [
  { label: 'Master Hub', unit: 'HOTEL', items: ['Overview', 'Reservations', 'Connectivity'] },
  { label: 'Hotel', unit: 'HOTEL', items: ['Front Desk', 'Guests', 'Folios & Billing'] },
  { label: 'Planning', unit: 'HOTEL', items: ['Room Calendar', 'Arrivals & Departures', 'Room Types & Rates', 'Guest Profiles', 'Invoices'] },
  { label: 'Operations', unit: 'HOTEL', items: ['Housekeeping', 'Maintenance', 'Inventory', 'Inventory Movements', 'Lost & Found', 'Restaurant Orders'] },
  { label: 'Restaurant tools', unit: 'HOTEL', items: ['Room Service', 'Meal Service', 'Menu Management'] },
  { label: 'Travel & Sales', unit: 'TRAVEL', items: ['Overview', 'Packages & Tours', 'Tours', 'Participants', 'Tour Managers', 'Inquiry CRM'] },
  { label: 'Sales tools', unit: 'TRAVEL', items: ['Sales Pipeline', 'Follow-ups', 'Communications'] },
  { label: 'Offline Centre', unit: 'HOTEL', items: ['Offline Billing', 'Verification', 'Device Status'] },
  { label: 'Administration', unit: 'HOTEL', items: ['Integrations', 'Reports', 'Audit Logs', 'Users & Permissions', 'Properties & Settings'] },
  { label: 'Travel administration', unit: 'TRAVEL', items: ['Reports', 'Audit Logs', 'Users & Permissions', 'Properties & Settings'] },
];

const roleViewAccess: Partial<Record<AppRole, ViewName[]>> = {
  RECEPTION: ['Overview', 'Reservations', 'Front Desk', 'Guests', 'Folios & Billing', 'Room Calendar', 'Arrivals & Departures', 'Guest Profiles', 'Invoices', 'Inventory Movements', 'Lost & Found', 'Offline Billing', 'Device Status'],
  HOUSEKEEPING: ['Overview'],
  RESTAURANT: ['Overview', 'Restaurant Orders', 'Inventory', 'Inventory Movements', 'Room Service', 'Meal Service', 'Menu Management'],
  TRAVEL_AGENT: ['Overview', 'Packages & Tours', 'Tours', 'Participants', 'Tour Managers', 'Inquiry CRM', 'Sales Pipeline', 'Follow-ups', 'Communications'],
  TOUR_MANAGER: ['Overview', 'Packages & Tours', 'Tours', 'Participants', 'Tour Managers', 'Inquiry CRM', 'Sales Pipeline', 'Follow-ups', 'Communications'],
  REPORTING: ['Overview', 'Reports'],
  ACCOUNTS: ['Overview', 'Reservations', 'Folios & Billing', 'Invoices', 'Verification', 'Reports', 'Audit Logs'],
};

function money(paise: unknown) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(paise ?? 0) / 100);
}

function shortDate(value: unknown) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));
}

function dateTime(value: unknown) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));
}

function localDateTimeInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function sendDemoCommand(role: AppRole, businessUnit: BusinessUnit, payload: Record<string, unknown>) {
  const requestPayload = payload.action === 'POST_RESTAURANT' && !payload.clientOperationId
    ? { ...payload, clientOperationId: crypto.randomUUID() }
    : payload;
  const response = await fetch('/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-demo-role': role, 'x-business-unit': businessUnit },
    body: JSON.stringify(requestPayload),
  });
  const body = await response.json() as { ok?: boolean; result?: Row; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'The operation failed.');
  return body.result ?? {};
}

async function productionApi(path: string, init?: RequestInit): Promise<Row> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' });
  const body = await response.json() as Row & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'The production operation failed.');
  return body;
}

function productionShell(context: Row, reservationItems: Row[], roomItems: Row[]): DemoState {
  const user = context.user as DemoState['actor'];
  const property = context.property as Row;
  const metrics: Metrics = { occupancyPercent: 0, totalRooms: roomItems.length, occupiedRooms: 0, availableRooms: roomItems.length,
    readyRooms: roomItems.length, dirtyRooms: 0, maintenanceRooms: 0, arrivalsToday: 0, departuresToday: 0, inHouseGuests: 0,
    pendingPayments: 0, revenuePaise: 0, adrPaise: 0, revParPaise: 0, lowStockCount: 0, unresolvedMaintenance: 0, overdueFollowUps: 0 };
  return { actor: user, businessUnit: 'HOTEL', property: { id: String(property.id), name: String(property.name), city: '', timezone: String(property.timezone), connectionStatus: 'ONLINE', lastSyncAt: new Date().toISOString() },
    metrics, travelMetrics: { activePackages: 0, openInquiries: 0, pipelineValuePaise: 0, customQuotes: 0, pendingApprovals: 0, overdueFollowUps: 0 },
    rooms: roomItems, reservations: reservationItems.map((item) => ({ ...item, guestName: item.primaryGuestName, email: item.guestEmail, phone: item.guestPhone, contactStatus: 'ACKNOWLEDGED' })),
    folios: [], folioLines: [], offlineBills: [], housekeeping: [], maintenance: [], inventory: [], restaurantOrders: [], restaurantMealBookings: [],
    restaurantArrivals: [], reservationInspectionSummaries: [], damageReports: [], packages: [], inquiries: [], travelAssets: [], customPackages: [],
    customPackageItems: [], discountRequests: [], audit: [], sandbox: { mode: 'PRODUCTION' } };
}

async function syncDeviceQueues(send: (payload: Record<string, unknown>) => Promise<Row>) {
  const pendingReservations = await getPendingOfflineReservations();
  let syncedReservations = 0;
  let reservationConflicts = 0;
  for (const reservation of pendingReservations) {
    try {
      const synced = await send({
        action: 'SYNC_OFFLINE_RESERVATION', clientOperationId: reservation.id, localReference: reservation.localReference,
        guestName: reservation.guestName, email: reservation.email, phone: reservation.phone, city: reservation.city,
        arrivalDate: reservation.arrivalDate, departureDate: reservation.departureDate, roomType: reservation.roomType,
        mealPlan: reservation.mealPlan, guestCount: reservation.guestCount, dietaryRequirements: reservation.dietaryRequirements,
        createdById: reservation.createdById, createdByName: reservation.createdByName, createdByRole: reservation.createdByRole,
      });
      await markOfflineReservationSynced(reservation.id, { reservationId: String(synced.reservationId), reference: String(synced.reference) });
      syncedReservations += 1;
    } catch (cause) {
      reservationConflicts += 1;
      await markOfflineReservationSyncFailed(reservation.id, cause instanceof Error ? cause.message : 'Sync requires review.');
    }
  }

  const reservationRecords = await getLocalOfflineReservations();
  const localBills = await getLocalOfflineBills();
  let uploadedCount = 0;
  let deferredBills = 0;
  let missingDocuments = 0;
  for (const bill of localBills.filter((item) => !item.uploadedAt)) {
    const localReservation = reservationRecords.find((reservation) => reservation.id === bill.reservationId || reservation.localReference === bill.bookingReference);
    if (localReservation && localReservation.syncStatus !== 'SYNCED') { deferredBills += 1; continue; }
    const document = await getBillBlob(bill.id);
    if (!document) { missingDocuments += 1; continue; }
    try {
      const uploaded = await send({
        action: 'UPLOAD_OFFLINE_BILL', id: bill.id, offlineReference: bill.offlineReference, bookingReference: bill.bookingReference,
        localAmountPaise: bill.totalPaise, taxPaise: bill.taxPaise, documentHash: bill.documentHash, generatedAt: bill.generatedAt,
        documentBase64: await blobToBase64(document),
      });
      await updateLocalBillStatus(bill.id, String(uploaded.status) as LocalOfflineBill['status']);
      uploadedCount += 1;
    } catch {
      deferredBills += 1;
    }
  }
  return { syncedReservations, reservationConflicts, uploadedCount, deferredBills, missingDocuments };
}

export function HotelPlatform({ appMode = 'demo' }: { appMode?: 'demo' | 'production' }) {
  const [state, setState] = useState<DemoState | null>(null);
  const [role, setRole] = useState<AppRole>('MANAGER');
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit>('HOTEL');
  const [surface, setSurface] = useState<Surface>('MASTER_HUB');
  const [view, setView] = useState<ViewName>('Overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [reservationModal, setReservationModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Row | null>(null);
  const [reconnectSummary, setReconnectSummary] = useState<Row | null>(null);
  const [localReservations, setLocalReservations] = useState<LocalOfflineReservation[]>([]);
  const [uiStyle, setUiStyle] = useState<UiStyle>('sage');
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const loadSequence = useRef(0);
  const appearancePickerRef = useRef<HTMLDivElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3600);
  }, []);

  const loadState = useCallback(async (selectedRole: AppRole, selectedUnit: BusinessUnit, silent = false) => {
    const sequence = ++loadSequence.current;
    const snapshotKey = `${selectedRole}:${selectedUnit}`;
    if (!silent) setLoading(true);
    setError('');
    try {
      if (appMode === 'production') {
        const [context, reservationPage, roomPage] = await Promise.all([
          productionApi('/api/context'), productionApi('/api/reservations?pageSize=25'), productionApi('/api/rooms'),
        ]);
        if (sequence !== loadSequence.current) return;
        setRole(String((context.user as Row).role) as AppRole);
        setBusinessUnit('HOTEL');
        setState(productionShell(context, reservationPage.items as Row[], roomPage.items as Row[]));
        setLastRefreshedAt(new Date());
        return;
      }
      const deviceReservations = await getLocalOfflineReservations();
      if (sequence === loadSequence.current) setLocalReservations(deviceReservations);
      const response = await fetch('/api/demo', { headers: { 'x-demo-role': selectedRole, 'x-business-unit': selectedUnit }, cache: 'no-store' });
      const body = await response.json() as DemoState & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'Unable to load Master Hub data.');
      if (sequence !== loadSequence.current) return;
      const normalizedBody = { ...body, reservationInspectionSummaries: body.reservationInspectionSummaries ?? [] };
      setState(normalizedBody);
      setLastRefreshedAt(new Date());
      if (body.property.connectionStatus === 'ONLINE' && body.cachePayload) await cacheCloudPayload(body.cachePayload);
      await cacheApplicationSnapshot(snapshotKey, { ...normalizedBody, cachePayload: undefined }).catch(() => undefined);
      setLocalReservations(await getLocalOfflineReservations());
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      if (appMode === 'production') {
        setState(null);
        setError(cause instanceof Error ? cause.message : 'Unable to load production reservation data.');
        return;
      }
      const cached = await getApplicationSnapshot<DemoState>(snapshotKey).catch(() => null);
      if (cached && selectedUnit === 'HOTEL') {
        setState({ ...cached, reservationInspectionSummaries: cached.reservationInspectionSummaries ?? [], property: { ...cached.property, connectionStatus: 'OFFLINE' }, cachePayload: undefined });
        setSurface('PROPERTY');
        setLastRefreshedAt(cached.property.lastSyncAt ? new Date(String(cached.property.lastSyncAt)) : null);
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to load application data.');
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [appMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadState(role, businessUnit), 0);
    return () => window.clearTimeout(timer);
  }, [businessUnit, loadState, role]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadUiStyle().then((savedStyle) => {
        if (active) setUiStyle(savedStyle);
      }).catch(() => undefined);
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!appearanceMenuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!appearancePickerRef.current?.contains(event.target as Node)) setAppearanceMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAppearanceMenuOpen(false);
      window.requestAnimationFrame(() => appearanceButtonRef.current?.focus());
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [appearanceMenuOpen]);

  useEffect(() => {
    const online = () => {
      setBrowserOnline(true);
      if (appMode === 'production') {
        void loadState(role, businessUnit, true);
      } else if (businessUnit === 'HOTEL' && roleCan(role, 'offline.reservation.create')) {
        void syncDeviceQueues((payload) => sendDemoCommand(role, businessUnit, payload)).finally(() => loadState(role, businessUnit, true));
      } else {
        void loadState(role, businessUnit, true);
      }
    };
    const offline = () => { setBrowserOnline(false); if (businessUnit === 'HOTEL') setSurface('PROPERTY'); };
    const initialStatusTimer = window.setTimeout(() => setBrowserOnline(navigator.onLine), 0);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.clearTimeout(initialStatusTimer); window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [appMode, businessUnit, loadState, role]);

  useEffect(() => {
    const refreshVisible = () => {
      const offlinePropertyTerminal = businessUnit === 'HOTEL' && surface === 'PROPERTY' && (state?.property.connectionStatus === 'OFFLINE' || !browserOnline);
      if (document.visibilityState === 'visible' && !offlinePropertyTerminal) void loadState(role, businessUnit, true);
    };
    const interval = window.setInterval(refreshVisible, 10_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [browserOnline, businessUnit, loadState, role, state?.property.connectionStatus, surface]);

  async function command(payload: Record<string, unknown>) {
    if (appMode === 'production') {
      const action = String(payload.action ?? '');
      if (action === 'CREATE_RESERVATION') return productionApi('/api/reservations', { method: 'POST', body: JSON.stringify({
        guestName: payload.guestName, email: payload.email, phone: payload.phone, roomId: payload.roomId, roomType: payload.roomType,
        arrivalDate: payload.arrivalDate, departureDate: payload.departureDate, adults: payload.guestCount ?? payload.adults ?? 1,
        children: payload.children ?? 0, status: 'CONFIRMED', source: payload.source ?? 'DIRECT', nightlyRatePaise: payload.nightlyRatePaise,
        taxRateBps: payload.taxRateBps ?? 0, specialRequests: payload.specialRequests, internalNotes: payload.internalNotes,
      }) });
      const reservationId = String(payload.reservationId);
      if (action === 'EDIT_RESERVATION') return productionApi(`/api/reservations/${reservationId}`, { method: 'PATCH', body: JSON.stringify(payload.changes) });
      if (action === 'CHECK_IN') return productionApi(`/api/reservations/${reservationId}/check-in`, { method: 'POST', body: JSON.stringify({}) });
      if (action === 'CHECK_OUT') return productionApi(`/api/reservations/${reservationId}/check-out`, { method: 'POST', body: JSON.stringify({}) });
      const type = action === 'CHECK_OUT' ? action : String(payload.type ?? action);
      return productionApi(`/api/reservations/${reservationId}/actions`, { method: 'POST', body: JSON.stringify({ ...payload, action: undefined, reservationId: undefined, type }) });
    }
    return sendDemoCommand(role, businessUnit, payload);
  }

  function chooseUiStyle(nextStyle: UiStyle) {
    setUiStyle(nextStyle);
    setAppearanceMenuOpen(false);
    void saveUiStyle(nextStyle).catch(() => undefined);
    window.requestAnimationFrame(() => appearanceButtonRef.current?.focus());
  }

  async function changeNetwork(next: 'ONLINE' | 'OFFLINE') {
    try {
      if (appMode === 'production') { notify('Network simulation is available only in demo mode.'); return; }
      if (next === 'ONLINE') {
        const result = await command({ action: 'SET_NETWORK', status: next });
        const { syncedReservations, reservationConflicts, uploadedCount, deferredBills, missingDocuments } = await syncDeviceQueues(command);
        const summary = result.reconnectSummary;
        setReconnectSummary(summary && typeof summary === 'object' && !Array.isArray(summary) ? {
          ...summary as Row,
          offlineWalkInsSynced: syncedReservations,
          offlineWalkInsPending: reservationConflicts,
          offlineBillsDeferred: deferredBills + missingDocuments,
          offlineBillsPending: Number((summary as Row).offlineBillsPending ?? 0) + uploadedCount,
        } : syncedReservations || reservationConflicts || uploadedCount || deferredBills || missingDocuments ? { newReservations: 0, updatedReservations: 0, offlineWalkInsSynced: syncedReservations, offlineWalkInsPending: reservationConflicts, offlineBillsPending: uploadedCount, offlineBillsDeferred: deferredBills + missingDocuments } : null);
        setLocalReservations(await getLocalOfflineReservations());
        notify(reservationConflicts || deferredBills || missingDocuments ? `Connection restored. ${syncedReservations} walk-ins synced; ${reservationConflicts} reservations and ${deferredBills + missingDocuments} bills need review.` : `Connection restored. ${syncedReservations} offline walk-in reservation${syncedReservations === 1 ? '' : 's'} synced.`);
      } else {
        await command({ action: 'SET_NETWORK', status: next });
        setSurface('PROPERTY');
        setView('Offline Billing');
        notify('Hotel terminal is now in restricted offline continuity mode.');
      }
      await loadState(role, businessUnit, true);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Network state could not be changed.');
    }
  }

  function changeRole(nextRole: AppRole) {
    setRole(nextRole);
    const units = businessUnitsForRole(nextRole);
    if (!units.includes(businessUnit)) setBusinessUnit(units[0]);
    setView('Overview');
    setSurface('MASTER_HUB');
    setSelectedReservation(null);
  }

  function changeBusinessUnit(next: BusinessUnit) {
    if (!businessUnitsForRole(role).includes(next)) return;
    setBusinessUnit(next);
    setSurface('MASTER_HUB');
    setView('Overview');
    setSearch('');
    setSelectedReservation(null);
  }

  const allowedViews = roleViewAccess[role];
  const visibleGroups = navGroups.filter((group) => group.unit === businessUnit || group.unit === 'BOTH').map((group) => ({ ...group, items: group.items.filter((item) => !allowedViews || allowedViews.includes(item)) })).filter((group) => group.items.length > 0);
  const canSwitchUnit = appMode === 'demo' && businessUnitsForRole(role).length > 1;
  const propertyOffline = state?.property?.connectionStatus === 'OFFLINE' || !browserOnline;
  const propertyRestricted = businessUnit === 'HOTEL' && surface === 'PROPERTY' && propertyOffline;
  const canCreateReservation = roleCan(role, propertyRestricted ? 'offline.reservation.create' : 'reservation.write');
  const focusedOperationsRole = role === 'HOUSEKEEPING' || role === 'RESTAURANT';
  const viewState = useMemo<DemoState | null>(() => {
    if (!state || businessUnit !== 'HOTEL') return state;
    const pendingRows: Row[] = localReservations.filter((reservation) => reservation.syncStatus !== 'SYNCED').map((reservation) => ({
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
    if (businessUnit === 'TRAVEL') {
      return [
        ...viewState.inquiries.filter((item) => [item.reference, item.customerName, item.service].some((value) => String(value ?? '').toLowerCase().includes(query))).map((item) => ({ ...item, searchKind: 'INQUIRY' })),
        ...viewState.packages.filter((item) => [item.name, item.locations].some((value) => String(value ?? '').toLowerCase().includes(query))).map((item) => ({ ...item, searchKind: 'PACKAGE' })),
      ].slice(0, 6);
    }
    return viewState.reservations.filter((reservation) => [reservation.reference, reservation.guestName, reservation.roomNumber].some((value) => String(value ?? '').toLowerCase().includes(query))).map((item) => ({ ...item, searchKind: 'BOOKING' })).slice(0, 6);
  }, [businessUnit, search, viewState]);

  return (
    <div className={`hotel-app platform-app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`} data-ui-style={uiStyle}>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <div className="brand-lockup">
          <SidebarLogo key={sidebarCollapsed ? 'short' : 'full'} collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && <button type="button" className="icon-button sidebar-collapse-button" aria-label="Collapse sidebar" aria-expanded={true} aria-controls="sidebar-navigation" onClick={() => setSidebarCollapsed(true)}><ChevronLeft size={17} /></button>}
        </div>
        <button aria-label={businessUnit === 'HOTEL' ? 'Hotel Operations workspace' : 'Travel & Sales workspace'} className="property-switcher property-switch-button workspace-switcher" disabled={!canSwitchUnit} onClick={() => changeBusinessUnit(businessUnit === 'HOTEL' ? 'TRAVEL' : 'HOTEL')}>
          <span className="property-icon"><AppGlyph name={businessUnit === 'HOTEL' ? 'hotel' : 'travel'} size={28} /></span>
          <span><small>Business workspace</small><strong>{businessUnit === 'HOTEL' ? 'Hotel Operations' : 'Travel & Sales'}</strong></span>
          {canSwitchUnit && <ChevronDown size={15} />}
        </button>
        {businessUnit === 'HOTEL' && !focusedOperationsRole && <button aria-label={surface === 'MASTER_HUB' ? 'Master Hub / Cloud operating surface' : 'Hotel Property Terminal operating surface'} className="property-switcher property-switch-button compact-switcher" onClick={() => setSurface((current) => current === 'MASTER_HUB' ? 'PROPERTY' : 'MASTER_HUB')}><span className="property-icon"><AppGlyph name={surface === 'MASTER_HUB' ? 'cloud-network' : 'hotel'} size={28} /></span><span><small>Operating surface</small><strong>{surface === 'MASTER_HUB' ? 'Master Hub / Cloud' : 'Hotel Property Terminal'}</strong></span><ChevronDown size={15} /></button>}
        <nav id="sidebar-navigation">
          {visibleGroups.map((group) => (
            <section key={group.label} className="nav-group">
              <p>{group.label}</p>
              {group.items.map((item) => (
                <button key={item} aria-label={item} className={`nav-item ${item === view ? 'active' : ''}`} aria-current={item === view ? 'page' : undefined} onClick={() => { setView(item); setMenuOpen(false); }}>
                  <AppGlyph name={navGlyphs[item]} size={19} className="invert-on-active" />
                  <span>{item}</span>
                  {item === 'Verification' && Number(state?.offlineBills.filter((bill) => bill.status !== 'VERIFIED').length) > 0 && <i className="warn">{state?.offlineBills.filter((bill) => bill.status !== 'VERIFIED').length}</i>}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-foot">{sidebarCollapsed ? <button type="button" className="icon-button sidebar-expand-button" aria-label="Expand sidebar" aria-expanded={false} aria-controls="sidebar-navigation" onClick={() => setSidebarCollapsed(false)}><ChevronRight size={19} /></button> : <span><small>Developed by</small><strong>BrainADZ Software</strong></span>}</div>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle navigation"><Menu size={19} /></button>
          <div className="search-shell">
            <label className="global-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Global search" placeholder={businessUnit === 'HOTEL' ? 'Search guests, bookings, rooms...' : 'Search inquiries, packages, clients...'} /><kbd>⌘ K</kbd></label>
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((result) => <button key={`${String(result.searchKind)}-${String(result.id)}`} onClick={() => { if (result.searchKind === 'BOOKING') setSelectedReservation(result); else setView(result.searchKind === 'INQUIRY' ? 'Inquiry CRM' : 'Packages & Tours'); setSearch(''); }}><span>{String(result.guestName ?? result.customerName ?? result.name)}</span><small>{result.searchKind === 'BOOKING' ? `${String(result.reference)} · Room ${String(result.roomNumber ?? 'TBA')}` : result.searchKind === 'INQUIRY' ? `${String(result.reference)} · ${String(result.service)}` : String(result.locations)}</small></button>)}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            {businessUnit === 'HOTEL' ? focusedOperationsRole ? <span className="connection-pill online"><AppGlyph name={role === 'RESTAURANT' ? 'restaurant' : 'housekeeping'} size={20} /> {role === 'RESTAURANT' ? 'Restaurant workspace' : 'Housekeeping workspace'}</span> : <><span className={`connection-pill ${propertyOffline ? 'offline' : 'online'}`}><AppGlyph name={propertyOffline ? 'offline' : 'cloud-network'} size={20} /> Hotel {propertyOffline ? 'offline' : 'online'}</span><button className="surface-chip" onClick={() => setSurface((current) => current === 'MASTER_HUB' ? 'PROPERTY' : 'MASTER_HUB')}><AppGlyph name={surface === 'MASTER_HUB' ? 'cloud-network' : 'hotel'} size={19} /> {surface === 'MASTER_HUB' ? 'Master Hub' : 'Property'}<ChevronDown size={13} /></button></> : <span className="connection-pill online"><AppGlyph name="travel" size={20} /> Travel workspace</span>}
            <span className="live-booking-pill" title={lastRefreshedAt ? `Last updated ${lastRefreshedAt.toLocaleTimeString('en-IN')}` : 'Connecting'}><i /> Live</span>
            <div className="appearance-picker" ref={appearancePickerRef}>
              <button ref={appearanceButtonRef} type="button" className="ui-style-trigger" aria-label={`Interface style: ${uiStyle === 'sage' ? 'BrainADZ Sage' : 'Classic Blue'}`} aria-expanded={appearanceMenuOpen} aria-haspopup="dialog" onClick={() => setAppearanceMenuOpen((open) => !open)}>
                <Palette size={16} /><span>{uiStyle === 'sage' ? 'Sage' : 'Classic Blue'}</span><ChevronDown size={13} />
              </button>
              {appearanceMenuOpen && (
                <section className="appearance-menu" role="dialog" aria-label="Choose interface style">
                  <div className="appearance-menu-heading"><span><strong>Interface style</strong><small>Choose the look of your workspace</small></span></div>
                  <div className="appearance-options" role="radiogroup" aria-label="Interface styles">
                    <button type="button" role="radio" aria-checked={uiStyle === 'sage'} className={uiStyle === 'sage' ? 'selected' : ''} onClick={() => chooseUiStyle('sage')}>
                      <span className="style-preview sage-preview" aria-hidden="true"><i /><i /><i /></span><span><strong>BrainADZ Sage</strong><small>Current warm green interface</small></span><span className="style-check">{uiStyle === 'sage' && <Check size={13} />}</span>
                    </button>
                    <button type="button" role="radio" aria-checked={uiStyle === 'classic-blue'} className={uiStyle === 'classic-blue' ? 'selected' : ''} onClick={() => chooseUiStyle('classic-blue')}>
                      <span className="style-preview blue-preview" aria-hidden="true"><i /><i /><i /></span><span><strong>Classic Blue</strong><small>Booklet-inspired red, white and navy</small></span><span className="style-check">{uiStyle === 'classic-blue' && <Check size={13} />}</span>
                    </button>
                  </div>
                  <p>Both options use the same data, permissions and workflows.</p>
                </section>
              )}
            </div>
            <button className="icon-button notification-button" onClick={() => notify(role === 'RESTAURANT' ? `${state?.metrics.lowStockCount ?? 0} restaurant stock alert${Number(state?.metrics.lowStockCount ?? 0) === 1 ? '' : 's'} require attention.` : role === 'HOUSEKEEPING' ? `${state?.housekeeping.length ?? 0} room task${Number(state?.housekeeping.length ?? 0) === 1 ? '' : 's'} in your service queue.` : 'Operational alerts are ready for review.')} aria-label="Notifications"><Bell size={18} /><span /></button>
            <label className="role-select"><span aria-hidden="true"><AppGlyph name="staff" size={21} /></span><select value={role} disabled={appMode === 'production'} onChange={(event) => changeRole(event.target.value as AppRole)} aria-label={appMode === 'production' ? 'Authenticated role' : 'Demo role'}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
        </header>

        <main className="main-content platform-content">
          {propertyRestricted && !focusedOperationsRole && <OfflineBanner lastSync={state?.property.lastSyncAt} />}
          {businessUnit === 'HOTEL' && !focusedOperationsRole && surface === 'MASTER_HUB' && propertyOffline && <MasterHubOfflineAlert state={state} onOpen={() => setView('Reservations')} />}
          {reconnectSummary && <ReconnectBanner summary={reconnectSummary} onDismiss={() => setReconnectSummary(null)} />}
          {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span><button onClick={() => loadState(role, businessUnit)}>Retry</button></div>}
          {loading && !viewState ? <LoadingView /> : viewState ? (
            <ViewRouter
              view={view} state={viewState} role={role} surface={surface} propertyRestricted={propertyRestricted} productionMode={appMode === 'production'}
              setView={setView} setSelectedReservation={setSelectedReservation} openReservation={() => { if (canCreateReservation) setReservationModal(true); else notify('This role cannot create reservations.'); }} canCreateReservation={canCreateReservation}
              businessUnit={businessUnit} command={command} refresh={() => loadState(role, businessUnit, true)} updateState={setState} notify={notify} changeNetwork={changeNetwork}
            />
          ) : null}
        </main>
      </div>

      {reservationModal && viewState && canCreateReservation && <ReservationModal state={viewState} surface={surface} offlineLocal={propertyRestricted} productionMode={appMode === 'production'} onClose={() => setReservationModal(false)} onSubmit={async (form) => { try { if (propertyRestricted) { if (!roleCan(role, 'offline.reservation.create')) throw new Error('This role cannot create offline walk-in reservations.'); const local = await createLocalWalkInReservation({ ...form as Parameters<typeof createLocalWalkInReservation>[0], createdById: String(viewState.actor.id), createdByName: String(viewState.actor.name), createdByRole: role }); setLocalReservations(await getLocalOfflineReservations()); setReservationModal(false); notify(`${local.localReference} saved securely on this front-desk device and queued for sync.`); return; } if (!roleCan(role, 'reservation.write')) throw new Error('This role cannot create reservations.'); const result = await command({ action: 'CREATE_RESERVATION', surface, ...form }); setReservationModal(false); await loadState(role, businessUnit, true); notify(result.contactRequired ? `${result.reference} created in Master Hub. Property contact is required.` : `${result.reference} confirmed in Master Hub.`); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Reservation could not be created.'); } }} />}
      {selectedReservation && state && <StayDrawer reservation={selectedReservation} state={state} restricted={propertyRestricted} surface={surface} productionMode={appMode === 'production'} notify={notify} onClose={() => setSelectedReservation(null)} onCommand={async (payload, message) => { try { await command(payload); await loadState(role, businessUnit, true); setSelectedReservation(null); notify(message); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Operation failed.'); } }} />}
      {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  );
}

function ViewRouter(props: {
  view: ViewName; state: DemoState; role: AppRole; surface: Surface; businessUnit: BusinessUnit; propertyRestricted: boolean; productionMode: boolean;
  setView: (view: ViewName) => void; setSelectedReservation: (reservation: Row) => void; openReservation: () => void; canCreateReservation: boolean;
  command: (payload: Record<string, unknown>) => Promise<Row>; refresh: () => Promise<void>; notify: (message: string) => void;
  updateState: Dispatch<SetStateAction<DemoState | null>>;
  changeNetwork: (status: 'ONLINE' | 'OFFLINE') => Promise<void>;
}) {
  if (props.view === 'Overview') {
    if (props.businessUnit === 'TRAVEL') return <TravelOverviewView {...props} />;
    if (props.role === 'HOUSEKEEPING') return <HousekeepingOverviewView {...props} />;
    if (props.role === 'RESTAURANT') return <RestaurantOverviewView {...props} />;
    return <OverviewView {...props} />;
  }
  if (props.view === 'Reservations') return <ReservationsView {...props} />;
  if (props.view === 'Connectivity') return <ConnectivityView {...props} />;
  if (props.view === 'Front Desk') return props.productionMode ? <ProductionFrontDesk openReservation={props.openReservation} openStay={props.setSelectedReservation} notify={props.notify} refreshKey={props.state.reservations.map((item) => `${String(item.id)}:${String(item.version)}`).join('|')} /> : <FrontDeskView {...props} />;
  if (props.view === 'Guests' || (props.productionMode && props.view === 'Guest Profiles')) return props.productionMode ? <ProductionGuests notify={props.notify} role={props.role} /> : <GuestsView {...props} />;
  if (props.view === 'Folios & Billing') return <FoliosView {...props} />;
  if (props.view === 'Offline Billing') return <OfflineBillingView {...props} />;
  if (props.view === 'Verification') return <VerificationView {...props} />;
  if (props.view === 'Device Status') return <DeviceStatusView {...props} />;
  if (props.view === 'Housekeeping' || props.view === 'Maintenance' || props.view === 'Inventory' || props.view === 'Restaurant Orders') return <OperationsView {...props} />;
  if (props.view === 'Packages & Tours' || props.view === 'Inquiry CRM') return <TravelSalesView {...props} />;
  if (props.view === 'Integrations') return <IntegrationsView {...props} />;
  if (props.view === 'Reports') return <ReportsView {...props} />;
  if (isExtraFeatureView(props.view)) return <ExtraFeatureView view={props.view} state={props.state} notify={props.notify} />;
  return <AuditView {...props} />;
}

function headingGlyph(eyebrow: string, title: string): AppGlyphName {
  const context = `${eyebrow} ${title}`.toLowerCase();
  if (context.includes('audit')) return 'audit';
  if (context.includes('report') || context.includes('performance')) return 'reports';
  if (context.includes('integration') || context.includes('provider')) return 'integrations';
  if (context.includes('restaurant') || context.includes('meal')) return 'restaurant';
  if (context.includes('inventory')) return 'inventory';
  if (context.includes('maintenance')) return 'maintenance';
  if (context.includes('housekeeping') || context.includes('room service')) return 'housekeeping';
  if (context.includes('verification') || context.includes('reconciliation')) return 'receipt-verification';
  if (context.includes('device')) return 'device-status';
  if (context.includes('offline') && context.includes('billing')) return 'offline-billing';
  if (context.includes('offline')) return 'offline';
  if (context.includes('billing') || context.includes('folio')) return 'folio';
  if (context.includes('connect')) return 'cloud-network';
  if (context.includes('inquiry')) return 'inquiry';
  if (context.includes('travel') || context.includes('package')) return 'travel';
  if (context.includes('guest')) return 'guest';
  if (context.includes('reservation')) return 'booking-calendar';
  if (context.includes('front desk')) return 'front-desk';
  return 'hotel';
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <section className="page-heading platform-page-heading"><div><p className="eyebrow"><AppGlyph name={headingGlyph(eyebrow, title)} size={20} /> {eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</section>;
}

function OfflineBanner({ lastSync }: { lastSync?: string }) {
  return <section className="offline-banner" role="status"><span><AppGlyph name="offline" size={28} /></span><div><strong>Hotel offline</strong><p>Last Master Hub sync: {dateTime(lastSync)}. Walk-in reservations and billing records will stay on this device until connection returns.</p></div><span className="restricted-label"><AppGlyph name="offline-billing" size={18} /> Local continuity</span></section>;
}

function MasterHubOfflineAlert({ state, onOpen }: { state: DemoState | null; onOpen: () => void }) {
  const count = state?.reservations.filter((reservation) => Boolean(reservation.createdWhilePropertyOffline) && reservation.contactStatus === 'NOT_CONTACTED').length ?? 0;
  return <section className="hub-offline-alert"><span><AppGlyph name="hotel" size={27} /></span><div><strong>Property currently offline</strong><p>Master Hub remains authoritative. {count} cloud reservation{count === 1 ? '' : 's'} require operational contact with {state?.property.name ?? 'the property'}.</p></div><button onClick={onOpen}>Open reservations <ArrowRight size={14} /></button></section>;
}

function ReconnectBanner({ summary, onDismiss }: { summary: Row; onDismiss: () => void }) {
  return <section className="reconnect-banner"><span><AppGlyph name="cloud-network" size={27} /></span><div><strong>Connection restored</strong><p>{Number(summary.offlineWalkInsSynced ?? 0)} walk-in reservation{Number(summary.offlineWalkInsSynced ?? 0) === 1 ? '' : 's'} synced · {Number(summary.offlineWalkInsPending ?? 0)} need review · {Number(summary.offlineBillsPending ?? 0)} bills uploaded · {Number(summary.offlineBillsDeferred ?? 0)} bills held on device</p></div><button onClick={onDismiss}><X size={16} /></button></section>;
}

function TravelOverviewView({ state, setView }: Parameters<typeof ViewRouter>[0]) {
  const pending = state.discountRequests.filter((request) => request.status === 'PENDING');
  const recent = state.customPackages.slice(0, 4);
  return <>
    <PageHeading eyebrow="Travel & Sales workspace" title={`Good afternoon, ${state.actor.name.split(' ')[0]}.`} description="A dedicated view of inquiries, package design, quote guardrails and discount approvals." actions={<button className="primary-button" onClick={() => setView('Packages & Tours')}><Plus size={16} /> Build custom package</button>} />
    <section className="kpi-grid overview-kpis travel-kpis">
      <Kpi icon={<AppGlyph name="travel" size={31} />} label="Active tours" value={String(state.travelMetrics.activePackages)} detail="Scheduled products" meta="Travel inventory only" tone="blue" />
      <Kpi icon={<AppGlyph name="inquiry" size={31} />} label="Open inquiries" value={String(state.travelMetrics.openInquiries)} detail="Across the sales pipeline" meta={`${state.travelMetrics.overdueFollowUps} follow-ups due`} tone="cyan" />
      <Kpi icon={<AppGlyph name="folio" size={31} />} label="Pipeline value" value={money(state.travelMetrics.pipelineValuePaise)} detail={`${state.travelMetrics.customQuotes} custom quotes`} meta="Calculated from live inquiries" tone="emerald" />
      <Kpi icon={<AppGlyph name="policy" size={31} />} label="Approvals" value={String(state.travelMetrics.pendingApprovals)} detail="Below-floor requests" meta="Manager governed" tone="violet" />
    </section>
    <section className="dashboard-grid overview-grid travel-overview-grid">
      <article className="glass-card"><div className="card-heading"><div><p className="section-kicker">Recent custom packages</p><h2>Quotes in progress</h2></div><button className="text-button" onClick={() => setView('Packages & Tours')}>Open builder <ArrowRight size={14} /></button></div>{recent.length ? <div className="travel-quote-list">{recent.map((item) => <div key={String(item.id)}><span><strong>{String(item.name)}</strong><small>{String(item.reference)} · {String(item.clientName)}</small></span><span><b>{money(item.quotedPricePaise)}</b><Status value={String(item.status)} /></span></div>)}</div> : <div className="empty-state small"><AppGlyph name="travel" size={38} /><strong>No custom quotes yet</strong><p>Build the first one from approved assets.</p></div>}</article>
      <article className="glass-card"><div className="card-heading"><div><p className="section-kicker">Manager guardrails</p><h2>Discount approval queue</h2></div><span>{pending.length} pending</span></div>{pending.length ? <div className="approval-preview">{pending.slice(0, 3).map((request) => <div key={String(request.id)}><span><strong>{String(request.packageName)}</strong><small>{String(request.requestedByName)} requested {money(request.requestedPricePaise)}</small></span><em>{money(Number(request.floorPricePaise) - Number(request.requestedPricePaise))} below floor</em></div>)}</div> : <div className="empty-state small"><AppGlyph name="policy" size={38} /><strong>Pricing is within policy</strong><p>No below-floor approvals are waiting.</p></div>}</article>
    </section>
  </>;
}

function RestaurantOverviewView({ state, setView, notify }: Parameters<typeof ViewRouter>[0]) {
  const [mealFilter, setMealFilter] = useState<'ALL' | MealService>('ALL');
  const [serviceDate, setServiceDate] = useState('2026-08-24');
  const rows = state.restaurantMealBookings.filter((booking) => booking.serviceDate === serviceDate && (mealFilter === 'ALL' || booking.mealPeriod === mealFilter));
  const roomCount = new Set(rows.map((booking) => String(booking.reservationId))).size;
  const arrivals = state.restaurantArrivals.filter((arrival) => arrival.arrivalDate === serviceDate).map((arrival) => {
    const reservationId = String(arrival.reservationId);
    const bookings = state.restaurantMealBookings.filter((booking) => booking.reservationId === reservationId && booking.serviceDate === serviceDate);
    const dietaryNotes = [...new Set(bookings.map((booking) => String(booking.dietaryNotes ?? '')).filter(Boolean))].join('; ');
    return { reservationId, bookingReference: arrival.bookingReference, roomNumber: arrival.roomNumber, guestCount: arrival.guestCount, dietaryNotes, meals: bookings.map((booking) => String(booking.mealPeriod)) };
  });
  function downloadMealList() {
    const header = ['Room', 'Booking', 'Service date', 'Meal period', 'Guests', 'Dietary notes'];
    const csvRows = rows.map((booking) => [booking.roomNumber, booking.bookingReference, booking.serviceDate, mealLabel(booking.mealPeriod), booking.guestCount, booking.dietaryNotes ?? '']);
    const csv = [header, ...csvRows].map((row) => row.map((value) => { const raw = String(value ?? ''); const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw; return `"${safe.replaceAll('"', '""')}"`; }).join(',')).join('\n');
    const name = mealFilter === 'ALL' ? 'all-meals' : String(mealFilter).toLowerCase().replaceAll('_', '-');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `brainadz-${name}-${serviceDate}.csv`);
    notify(`${rows.length} meal booking${rows.length === 1 ? '' : 's'} downloaded.`);
  }
  return <>
    <PageHeading eyebrow="Restaurant overview" title={`Good afternoon, ${state.actor.name.split(' ')[0]}.`} description="Meal commitments, arrivals, orders and restaurant stock in one workspace." actions={<button className="primary-button" disabled={!rows.length} onClick={downloadMealList}><Download size={15} /> Download filtered list</button>} />
    <section className="restaurant-meal-kpis">{mealOptions.map((meal) => <button key={meal.value} className={mealFilter === meal.value ? 'active' : ''} onClick={() => setMealFilter(meal.value)}><span><AppGlyph name={meal.glyph} size={28} /></span><small>{meal.label}</small><strong>{state.restaurantMealBookings.filter((booking) => booking.serviceDate === serviceDate && booking.mealPeriod === meal.value).length}</strong></button>)}</section>
    <section className="restaurant-overview-grid">
      <article className="glass-card restaurant-arrivals"><div className="card-heading"><div><p className="section-kicker">Arrival preparation</p><h2>Arrivals and meal plans · {shortDate(serviceDate)}</h2></div><span>{arrivals.length} rooms</span></div>{arrivals.length ? <div className="restaurant-arrival-list">{arrivals.map((arrival) => <div key={String(arrival.reservationId)}><span className="record-icon"><AppGlyph name="arrivals-departures" size={25} /></span><div><strong>Room {String(arrival.roomNumber ?? 'TBA')}</strong><small>{String(arrival.bookingReference)} · {Number(arrival.guestCount ?? 1)} guest{Number(arrival.guestCount ?? 1) === 1 ? '' : 's'}</small>{Boolean(arrival.dietaryNotes) && <em>{String(arrival.dietaryNotes)}</em>}</div><span className="meal-chip-wrap">{arrival.meals.length ? arrival.meals.map((meal) => <i key={meal}>{mealLabel(meal)}</i>) : <i>No meal booked</i>}</span></div>)}</div> : <div className="empty-state small"><AppGlyph name="booking-calendar" size={38} /><strong>No arrivals for this date</strong></div>}</article>
      <article className="glass-card restaurant-ops-summary"><div className="card-heading"><div><p className="section-kicker">Restaurant operations</p><h2>Today&apos;s priorities</h2></div></div><button onClick={() => setView('Restaurant Orders')}><AppGlyph name="restaurant" size={25} /><span><strong>{state.restaurantOrders.length} service orders</strong><small>Open orders and room service</small></span><ArrowRight size={15} /></button><button onClick={() => setView('Inventory')}><AppGlyph name="inventory" size={25} /><span><strong>{state.metrics.lowStockCount} low-stock items</strong><small>Kitchen, beverage and supplies</small></span><ArrowRight size={15} /></button></article>
    </section>
    <section className="meal-service-section"><div className="subsection-heading"><div><p className="section-kicker">Downloadable service list</p><h2>{mealFilter === 'ALL' ? 'All meal bookings' : mealLabel(mealFilter)}</h2></div><label className="service-date-filter"><CalendarDays size={14} /><input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label></div><div className="toolbar meal-filter-toolbar"><div className="segmented"><button className={mealFilter === 'ALL' ? 'active' : ''} onClick={() => setMealFilter('ALL')}>All</button>{mealOptions.map((meal) => <button key={meal.value} className={mealFilter === meal.value ? 'active' : ''} onClick={() => setMealFilter(meal.value)}>{meal.label}</button>)}</div><span>{roomCount} rooms · {rows.length} services</span></div><div className="table-card meal-service-table"><table><thead><tr><th>Room</th><th>Booking</th><th>Meal</th><th>Guests</th><th>Dietary notes</th><th>Status</th></tr></thead><tbody>{rows.map((booking) => <tr key={String(booking.id)}><td><strong>Room {String(booking.roomNumber ?? 'TBA')}</strong></td><td>{String(booking.bookingReference)}</td><td>{mealLabel(booking.mealPeriod)}</td><td>{Number(booking.guestCount)}</td><td>{String(booking.dietaryNotes ?? 'None recorded')}</td><td><Status value={String(booking.status)} /></td></tr>)}</tbody></table></div></section>
  </>;
}

function OverviewView({ state, propertyRestricted, openReservation, canCreateReservation, setView, changeNetwork, role, surface, command, refresh, notify }: Parameters<typeof ViewRouter>[0]) {
  const arrivals = state.reservations.filter((reservation) => reservation.arrivalDate === '2026-08-24' && reservation.status === 'CONFIRMED').slice(0, 4);
  return <>
    <PageHeading eyebrow="Hospitality command centre" title={`Good afternoon, ${state.actor.name.split(' ')[0]}.`} description="One operating picture for hotel and guest operations." actions={<><span className="date-chip"><CalendarDays size={15} /> 24 August 2026</span>{canCreateReservation && <button className="primary-button" onClick={openReservation}><Plus size={16} /> {propertyRestricted ? 'Offline walk-in' : 'New reservation'}</button>}</>} />
    <AvailabilityGrid state={state} onNewBooking={openReservation} restricted={!canCreateReservation} />
    <section className="kpi-grid overview-kpis">
      <Kpi icon={<AppGlyph name="occupancy" size={31} />} label="Occupancy" value={`${state.metrics.occupancyPercent}%`} detail={`${state.metrics.occupiedRooms} of ${state.metrics.totalRooms} rooms`} meta="Calculated from room state" tone="blue" />
      <Kpi icon={<AppGlyph name="room-ready" size={31} />} label="Available rooms" value={String(state.metrics.availableRooms)} detail={`${state.metrics.readyRooms} clean & ready`} meta={`${state.metrics.dirtyRooms} need cleaning`} tone="cyan" />
      <Kpi icon={<AppGlyph name="arrivals-departures" size={31} />} label="Arrivals / departures" value={`${state.metrics.arrivalsToday} / ${state.metrics.departuresToday}`} detail={`${state.metrics.inHouseGuests} in-house`} meta={`${state.metrics.pendingPayments} balances due`} tone="violet" />
      <Kpi icon={<AppGlyph name="folio" size={31} />} label="Hotel revenue" value={money(state.metrics.revenuePaise)} detail={`ADR ${money(state.metrics.adrPaise)}`} meta={`RevPAR ${money(state.metrics.revParPaise)}`} tone="emerald" />
    </section>
    <section className="dashboard-grid overview-grid">
      <article className="glass-card connectivity-card">
        <div className="card-heading"><div><p className="section-kicker">Property connectivity</p><h2>{state.property.name}</h2></div><Status value={state.property.connectionStatus} /></div>
        <div className="connectivity-visual"><div className={`signal-orbit ${state.property.connectionStatus === 'OFFLINE' ? 'signal-off' : ''}`}><AppGlyph name={state.property.connectionStatus === 'ONLINE' ? 'cloud-network' : 'offline'} size={43} /></div><div><strong>{state.property.connectionStatus === 'ONLINE' ? 'Master Hub connected' : 'Property connection unavailable'}</strong><p>{state.property.connectionStatus === 'ONLINE' ? 'Reservations, inventory and billing are synchronised.' : 'Cached existing-guest billing remains available. Cloud mutations are locked.'}</p></div></div>
        <div className="sync-grid"><div><small>Last property sync</small><strong>{dateTime(state.property.lastSyncAt)}</strong></div><div><small>Device</small><strong>Front Desk 01</strong></div><div><small>Offline bills</small><strong>{state.offlineBills.filter((bill) => bill.status !== 'VERIFIED').length} to verify</strong></div></div>
        <button className={`network-button ${state.property.connectionStatus === 'OFFLINE' ? 'restore' : ''}`} onClick={() => changeNetwork(state.property.connectionStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE')}><AppGlyph name={state.property.connectionStatus === 'ONLINE' ? 'offline' : 'cloud-network'} size={22} />{state.property.connectionStatus === 'ONLINE' ? 'Simulate hotel offline' : 'Restore hotel connection'}</button>
        <p className="sandbox-note">UAT network simulator · hotel session only · Master Hub remains online</p>
      </article>
      <article className="glass-card arrivals-card"><div className="card-heading"><div><p className="section-kicker">Front desk flow</p><h2>Today&apos;s arrivals</h2></div><button className="text-button" onClick={() => setView('Front Desk')}>View front desk <ArrowRight size={14} /></button></div><div className="arrival-list">{arrivals.map((arrival) => <ReservationCompact key={String(arrival.id)} reservation={arrival} />)}</div><div className="arrival-summary"><span><AppGlyph name="room-ready" size={23} /> {state.metrics.readyRooms} rooms ready</span><span><AppGlyph name="maintenance" size={23} /> {state.metrics.unresolvedMaintenance} open ticket</span><span><AppGlyph name="wallet-alert" size={23} /> {state.metrics.pendingPayments} balances due</span></div></article>
    </section>
    <section className="mini-module-grid hotel-module-grid"><MiniModule icon={<AppGlyph name="restaurant" size={31} />} title="Restaurant" value={`${state.restaurantOrders.length} orders today`} detail="Room posting validated online" onClick={() => setView('Restaurant Orders')} /><MiniModule icon={<AppGlyph name="attention-queue" size={31} />} title="Attention queue" value={`${state.metrics.lowStockCount + state.metrics.unresolvedMaintenance} items`} detail="Low stock & maintenance" onClick={() => setView('Reports')} /><MiniModule icon={<AppGlyph name="booking-feed" size={31} />} title="Booking feed" value="Live" detail="Front desk, website & OTA" onClick={() => setView('Reservations')} /></section>
    {['OWNER', 'MANAGER'].includes(role) && <DamageReviewPanel reports={state.damageReports} surface={surface} command={command} refresh={refresh} notify={notify} />}
  </>;
}

function ReservationsView({ state, productionMode, propertyRestricted, openReservation, setSelectedReservation, command, refresh, notify }: Parameters<typeof ViewRouter>[0]) {
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [productionRows, setProductionRows] = useState<Row[]>(state.reservations);
  const [productionTotal, setProductionTotal] = useState(state.reservations.length);
  useEffect(() => {
    if (!productionMode) return;
    const params = new URLSearchParams({ page:String(page), pageSize:'25' }); if (filter !== 'ALL') params.set('status', filter);
    void productionApi(`/api/reservations?${params}`).then((body) => { setProductionRows((body.items as Row[]).map((item) => ({ ...item, guestName:item.primaryGuestName, email:item.guestEmail, phone:item.guestPhone, contactStatus:'ACKNOWLEDGED' }))); setProductionTotal(Number(body.total ?? 0)); }).catch(() => undefined);
  }, [filter, page, productionMode, state.reservations]);
  const reservations = productionMode ? productionRows : filter === 'ALL' ? state.reservations : state.reservations.filter((reservation) => reservation.status === filter);
  const inspectionByReservation = new Map((state.reservationInspectionSummaries ?? []).map((summary) => [String(summary.reservationId), summary]));
  return <>
    <PageHeading eyebrow="Master Hub / Live booking feed" title="Reservation control" description="Front-desk, website and OTA bookings flow into one list and refresh automatically." actions={<button className="primary-button" onClick={openReservation}><Plus size={16} /> {propertyRestricted ? 'Offline walk-in' : 'New reservation'}</button>} />
    <div className="toolbar"><div className="segmented">{['ALL','PENDING','HOLD','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW'].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => { setFilter(item); setPage(1); }}>{item.replace('_',' ')}</button>)}</div><span>{productionMode ? productionTotal : reservations.length} records</span></div>
    <div className="table-card"><table><thead><tr><th>Booking</th><th>Guest</th><th>Stay</th><th>Room</th><th>Source</th><th>Status</th><th>Housekeeping</th><th>Sync</th><th></th></tr></thead><tbody>{reservations.map((reservation) => {
      const inspection = inspectionByReservation.get(String(reservation.id));
      return <tr key={String(reservation.id)}>
        <td><strong>{String(reservation.reference)}</strong>{Boolean(reservation.localOnly) && <small className="inline-alert">Saved on this device</small>}{Boolean(reservation.createdWhilePropertyOffline) && !reservation.localOnly && <small className="inline-alert">Created during outage</small>}</td>
        <td>{String(reservation.guestName)}</td>
        <td>{shortDate(reservation.arrivalDate)} – {shortDate(reservation.departureDate)}</td>
        <td>{String(reservation.roomNumber ?? 'Provisional')} · {String(reservation.roomType)}</td>
        <td><SandboxBadge value={String(reservation.source)} /></td>
        <td><Status value={String(reservation.status)} /></td>
        <td><InspectionStatusBadge summary={inspection} reservationStatus={String(reservation.status)} /></td>
        <td>{reservation.localOnly ? <><Status value={String(reservation.syncStatus)} />{Boolean(reservation.syncError) && <small>{String(reservation.syncError)}</small>}</> : reservation.contactStatus === 'NOT_CONTACTED' ? <button className="compact-button warning" onClick={async () => { try { await command({ action: 'MARK_CONTACTED', reservationId: reservation.id }); await refresh(); notify('Property contact recorded.'); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Could not update contact status.'); } }}>Mark contacted</button> : <span className="contacted"><Check size={13} /> Synced</span>}</td>
        <td><button className="row-action" onClick={() => setSelectedReservation(reservation)}>Open</button></td>
      </tr>;
    })}</tbody></table></div>
    {productionMode && productionTotal > 25 && <div className="modal-actions"><button className="secondary-button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page}</span><button className="secondary-button" disabled={page * 25 >= productionTotal} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
  </>;
}

function ConnectivityView({ state, changeNetwork }: Parameters<typeof ViewRouter>[0]) {
  const offlineCreated = state.reservations.filter((reservation) => Boolean(reservation.createdWhilePropertyOffline)).length;
  return <><PageHeading eyebrow="Master Hub / Connectivity" title="Property connection control" description="Monitor registered devices and synchronization health." /><section className="detail-grid"><article className="glass-card connectivity-detail"><div className="connectivity-hero"><div className={`signal-orbit ${state.property.connectionStatus === 'OFFLINE' ? 'signal-off' : ''}`}><AppGlyph name={state.property.connectionStatus === 'ONLINE' ? 'cloud-network' : 'offline'} size={42} /></div><div><p>{state.property.name}</p><h2>{state.property.connectionStatus}</h2><span>Last successful sync {dateTime(state.property.lastSyncAt)}</span></div></div><div className="connection-facts"><div><small>Cloud reservations since outage</small><strong>{offlineCreated}</strong></div><div><small>Offline bills awaiting review</small><strong>{state.offlineBills.filter((bill) => bill.status !== 'VERIFIED').length}</strong></div><div><small>Registered device</small><strong>BHZ-FD01</strong></div></div><button className={`network-button ${state.property.connectionStatus === 'OFFLINE' ? 'restore' : ''}`} onClick={() => changeNetwork(state.property.connectionStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE')}>{state.property.connectionStatus === 'ONLINE' ? 'Put hotel terminal offline' : 'Reconnect property terminal'}</button></article><article className="glass-card architecture-card"><p className="section-kicker">Authority model</p><h2>One source of truth</h2><div className="authority-flow"><div><AppGlyph name="cloud-network" size={26} /><span><strong>Master Hub</strong><small>Reservations · inventory · payments</small></span></div><ArrowRight size={18} /><div><AppGlyph name="hotel" size={26} /><span><strong>Hotel online</strong><small>Normal PMS operations</small></span></div><ArrowRight size={18} /><div><AppGlyph name="offline" size={26} /><span><strong>Hotel offline</strong><small>Cached stays, local walk-ins and PDF billing</small></span></div></div><div className="control-note"><AppGlyph name="policy" size={25} /><span><strong>Controlled reconciliation</strong><small>Local documents and walk-ins are reviewed after reconnection.</small></span></div></article></section></>;
}

function FrontDeskView(props: Parameters<typeof ViewRouter>[0]) {
  const { state, propertyRestricted, openReservation, setSelectedReservation } = props;
  const [tab, setTab] = useState('Arrivals');
  const rows = tab === 'Arrivals' ? state.reservations.filter((reservation) => reservation.arrivalDate === '2026-08-24' && reservation.status === 'CONFIRMED') : tab === 'Departures' ? state.reservations.filter((reservation) => reservation.departureDate === '2026-08-24' && reservation.status === 'CHECKED_IN') : state.reservations.filter((reservation) => reservation.status === 'CHECKED_IN');
  return <><PageHeading eyebrow="Hotel / Front Desk" title="Front desk command board" description={propertyRestricted ? 'Walk-ins are saved on this device and will sync when the connection returns.' : 'Arrivals, departures, guests and room readiness in one operating view.'} actions={<button className="primary-button" onClick={openReservation}><Plus size={16} /> {propertyRestricted ? 'Save offline walk-in' : 'New reservation'}</button>} /><section className="front-desk-kpis"><Metric label="Occupancy" value={`${state.metrics.occupancyPercent}%`} /><Metric label="Available" value={state.metrics.availableRooms} /><Metric label="Arrivals" value={state.metrics.arrivalsToday} /><Metric label="Departures" value={state.metrics.departuresToday} /><Metric label="In-house" value={state.metrics.inHouseGuests} /><Metric label="Pending payments" value={state.metrics.pendingPayments} /></section><div className="toolbar"><div className="segmented">{['Arrivals','Departures','In-house'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div><span>{rows.length} guests</span></div><div className="record-grid">{rows.map((reservation) => <button className="guest-card" key={String(reservation.id)} onClick={() => setSelectedReservation(reservation)}><span className="record-icon" aria-hidden="true"><AppGlyph name="arrivals-departures" size={25} /></span><div><strong>{String(reservation.guestName)}</strong><small>{String(reservation.reference)} · {shortDate(reservation.arrivalDate)} – {shortDate(reservation.departureDate)}</small>{Boolean(reservation.localOnly) && <small className="inline-alert">Saved locally · {String(reservation.syncStatus).replaceAll('_', ' ')}</small>}</div><span className="room-chip">{reservation.roomNumber ? `Room ${String(reservation.roomNumber)}` : 'Provisional room'}</span><Status value={String(reservation.status)} /></button>)}</div></>;
}

function GuestsView({ state, setSelectedReservation }: Parameters<typeof ViewRouter>[0]) {
  const unique = new Map<string, Row>(); state.reservations.forEach((reservation) => unique.set(String(reservation.guestId), reservation));
  return <><PageHeading eyebrow="Hotel / Guests" title="Guest profiles" description="Current stay, preferences and repeat-guest context are property-scoped." /><div className="record-grid">{[...unique.values()].map((guest) => <button className="guest-card guest-profile-card" key={String(guest.guestId)} onClick={() => setSelectedReservation(guest)}><span className="record-icon" aria-hidden="true"><AppGlyph name="guest" size={25} /></span><div><strong>{String(guest.guestName)}</strong><small>{String(guest.city ?? 'India')} · {String(guest.loyaltyTier ?? 'Member')}</small></div><div className="guest-meta"><span>{String(guest.phone ?? 'No phone')}</span><small>{String(guest.preferences ?? 'No preferences')}</small></div><ArrowRight size={15} /></button>)}</div></>;
}

function FoliosView({ state, setSelectedReservation }: Parameters<typeof ViewRouter>[0]) {
  const reservationMap = new Map(state.reservations.map((reservation) => [String(reservation.id), reservation]));
  return <><PageHeading eyebrow="Hotel / Billing" title="Folios & billing" description="Authoritative cloud folios with auditable room, restaurant and adjustment lines." /><div className="table-card"><table><thead><tr><th>Folio</th><th>Guest / booking</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{state.folios.map((folio) => { const reservation = reservationMap.get(String(folio.reservationId)); return <tr key={String(folio.id)}><td><strong>{String(folio.id).slice(0,16)}</strong><small>Version {Number(folio.version)}</small></td><td>{String(reservation?.guestName ?? 'Restricted')}<small>{String(reservation?.reference ?? '')}</small></td><td>{money(folio.subtotalPaise)}</td><td>{money(folio.taxPaise)}</td><td><strong>{money(folio.totalPaise)}</strong></td><td><Status value={String(folio.status)} /></td><td>{reservation && <button className="row-action" onClick={() => setSelectedReservation(reservation)}>Open folio</button>}</td></tr>; })}</tbody></table></div></>;
}

function OfflineBillingView({ state, propertyRestricted, notify }: Parameters<typeof ViewRouter>[0]) {
  const [query, setQuery] = useState('Arjun Sharma');
  const [bookings, setBookings] = useState<CachedBooking[]>([]);
  const [selected, setSelected] = useState<CachedBooking | null>(null);
  const [localBills, setLocalBills] = useState<LocalOfflineBill[]>([]);
  const [amounts, setAmounts] = useState({ room: 800000, restaurant: 135000, other: 0, taxRate: 1800 });
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { setBookings(await searchCachedBookings(query)); setLocalBills(await getLocalOfflineBills()); }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload, state.property.lastSyncAt]);
  async function choose(booking: CachedBooking) {
    setSelected(booking);
    const stay = await getCachedStay(booking.id);
    if (stay?.folio) setAmounts({ room: stay.lines.filter((line) => line.category === 'ROOM').reduce((sum, line) => sum + line.lineTotalPaise, 0), restaurant: stay.lines.filter((line) => ['RESTAURANT','ROOM_SERVICE'].includes(line.category)).reduce((sum, line) => sum + line.lineTotalPaise, 0), other: stay.lines.filter((line) => !['ROOM','RESTAURANT','ROOM_SERVICE'].includes(line.category)).reduce((sum, line) => sum + line.lineTotalPaise, 0), taxRate: stay.folio.subtotalPaise > 0 ? Math.round(stay.folio.taxPaise / stay.folio.subtotalPaise * 10_000) : 1800 });
    else setAmounts({ room: 0, restaurant: 0, other: 0, taxRate: 1800 });
  }
  async function generate() {
    if (!selected) return;
    setBusy(true);
    try {
      if (propertyRestricted) {
        const bill = await generateOfflineBill({ reservationId: selected.id, generatedBy: state.actor.name, roomChargesPaise: amounts.room, restaurantPaise: amounts.restaurant, otherPaise: amounts.other, taxRateBps: amounts.taxRate });
        downloadBlob(bill.documentBlob, `${bill.offlineReference}.pdf`);
        await reload();
        notify(`${bill.offlineReference} generated, saved on this device and downloaded.`);
      } else {
        const reservation = state.reservations.find((item) => item.id === selected.id);
        const folio = state.folios.find((item) => item.reservationId === selected.id);
        if (!reservation || !folio) throw new Error('The current cloud folio could not be found.');
        const lines = state.folioLines.filter((line) => line.folioId === folio.id).map((line) => ({ description: String(line.description), quantity: Number(line.quantity), unitAmountPaise: Number(line.unitAmountPaise), taxRateBps: Number(line.taxRateBps), lineTotalPaise: Number(line.lineTotalPaise) }));
        const pdf = createOnlineFolioPdf({ bookingReference: String(reservation.reference), guestName: String(reservation.guestName), roomNumber: reservation.roomNumber ? String(reservation.roomNumber) : null, arrivalDate: String(reservation.arrivalDate), departureDate: String(reservation.departureDate), folioStatus: String(folio.status), subtotalPaise: Number(folio.subtotalPaise), taxPaise: Number(folio.taxPaise), totalPaise: Number(folio.totalPaise), lines });
        downloadBlob(pdf.blob, pdf.filename);
        notify(`${reservation.reference} folio PDF downloaded from the current cloud record.`);
      }
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'The PDF could not be generated.'); } finally { setBusy(false); }
  }
  async function handleLocalBill(billId: string, reference: string, print: boolean) {
    const blob = await getBillBlob(billId); if (!blob) return;
    if (!print) { downloadBlob(blob, `${reference}.pdf`); notify(`${reference} downloaded.`); return; }
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe'); frame.hidden = true; frame.src = url; document.body.appendChild(frame);
    frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); void markBillPrinted(billId).then(reload); window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000); };
  }
  const subtotal = amounts.room + amounts.restaurant + amounts.other; const tax = Math.round(subtotal * amounts.taxRate / 10000);
  return <><PageHeading eyebrow="Billing centre" title="Billing & PDF downloads" description={propertyRestricted ? 'Prepare a local continuity bill from the cached stay and download it immediately.' : 'Download a current folio PDF from the current Master Hub record.'} actions={<Status value={propertyRestricted ? 'OFFLINE CONTINUITY' : 'CLOUD FOLIO'} />} /><section className="offline-workspace"><article className="glass-card cached-search"><div className="card-heading"><div><p className="section-kicker">Guest search</p><h2>Existing bookings</h2></div><span>{bookings.length} available</span></div><label className="offline-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Guest, booking or room" /></label><div className="cached-list">{bookings.slice(0,8).map((booking) => <button key={booking.id} className={selected?.id === booking.id ? 'active' : ''} onClick={() => choose(booking)}><span className="record-icon" aria-hidden="true"><AppGlyph name="room-ready" size={25} /></span><span><strong>{booking.guestName}</strong><small>{booking.reference} · {booking.roomNumber ? `Room ${booking.roomNumber}` : 'Provisional room'} · {calculateStayNights(booking.arrivalDate, booking.departureDate)} nights</small></span><ArrowRight size={15} /></button>)}</div></article><article className="glass-card bill-editor"><div className="card-heading"><div><p className="section-kicker">{propertyRestricted ? 'Local document preparation' : 'Current cloud folio'}</p><h2>{selected ? selected.guestName : 'Select an existing guest'}</h2>{selected && <p className="stay-inline">{shortDate(selected.arrivalDate)} to {shortDate(selected.departureDate)} · {calculateStayNights(selected.arrivalDate, selected.departureDate)} nights</p>}</div>{selected && <span className="room-chip">{selected.roomNumber ? `Room ${selected.roomNumber}` : 'Provisional room'}</span>}</div>{selected ? <><div className="bill-inputs"><MoneyInput label="Room charges" value={amounts.room} disabled={!propertyRestricted} onChange={(room) => setAmounts({ ...amounts, room })} /><MoneyInput label="Restaurant" value={amounts.restaurant} disabled={!propertyRestricted} onChange={(restaurant) => setAmounts({ ...amounts, restaurant })} /><MoneyInput label="Other" value={amounts.other} disabled={!propertyRestricted} onChange={(other) => setAmounts({ ...amounts, other })} /><label><span>Tax rate</span><select disabled={!propertyRestricted} value={amounts.taxRate} onChange={(event) => setAmounts({ ...amounts, taxRate: Number(event.target.value) })}><option value={1800}>18% configured tax</option><option value={1200}>12% configured tax</option><option value={500}>5% configured tax</option></select></label></div><div className="bill-total"><span><small>Subtotal</small><strong>{money(subtotal)}</strong></span><span><small>Tax</small><strong>{money(tax)}</strong></span><span><small>Grand total</small><strong>{money(subtotal + tax)}</strong></span></div><div className="offline-warning"><AppGlyph name="policy" size={25} /><span><strong>{propertyRestricted ? 'Local document' : 'Current folio PDF'}</strong><small>{propertyRestricted ? 'This local reference is not a statutory GST invoice number.' : 'The PDF uses the current folio lines and server-calculated totals.'}</small></span></div><button className="primary-button full-button" disabled={busy} onClick={generate}><Download size={16} /> {busy ? 'Preparing PDF…' : propertyRestricted ? 'Generate, save & download offline PDF' : 'Download current folio PDF'}</button></> : <div className="empty-state"><AppGlyph name="folio" size={42} /><strong>Choose an existing booking</strong><p>Select a guest to prepare the PDF.</p></div>}</article></section><section className="glass-card local-bills-card"><div className="card-heading"><div><p className="section-kicker">Device records</p><h2>Offline bills retained locally</h2></div><span>{localBills.length} records</span></div>{localBills.length ? <div className="table-card embedded-table"><table><thead><tr><th>Reference</th><th>Guest / booking</th><th>Stay</th><th>Total</th><th>Status</th><th>Printed</th><th></th></tr></thead><tbody>{localBills.map((bill) => <tr key={bill.id}><td><strong>{bill.offlineReference}</strong><small>{dateTime(bill.generatedAt)}</small></td><td>{bill.guestName}<small>{bill.bookingReference}</small></td><td>{bill.arrivalDate && bill.departureDate ? <>{shortDate(bill.arrivalDate)} to {shortDate(bill.departureDate)}<small>{bill.stayNights ?? calculateStayNights(bill.arrivalDate, bill.departureDate)} nights</small></> : 'Earlier record'}</td><td><strong>{money(bill.totalPaise)}</strong></td><td><Status value={bill.status} /></td><td>{bill.printCount}×</td><td><div className="row-actions"><button className="row-action" onClick={() => handleLocalBill(bill.id, bill.offlineReference, false)}><Download size={13} /> Download</button><button className="row-action" onClick={() => handleLocalBill(bill.id, bill.offlineReference, true)}><Printer size={13} /> {bill.printCount ? 'Reprint' : 'Print'}</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state small"><AppGlyph name="offline" size={38} /><strong>No offline bill created yet</strong></div>}</section></>;
}

function VerificationView({ state, role, command, refresh, notify }: Parameters<typeof ViewRouter>[0]) {
  const [localBills, setLocalBills] = useState<LocalOfflineBill[]>([]);
  useEffect(() => { void getLocalOfflineBills().then(setLocalBills); }, [state.offlineBills]);
  async function manualUpdate(bill: LocalOfflineBill) { try { const result = await command({ action: 'MANUAL_MASTER_UPDATE', bookingReference: bill.bookingReference, amountPaise: bill.totalPaise }); await refresh(); notify(result.createdFinancialLine ? 'Master Hub folio adjusted manually and audited.' : 'Matching Master Hub record already exists; no duplicate line created.'); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Master Hub update failed.'); } }
  async function verify(bill: Row) { try { await command({ action: 'VERIFY_OFFLINE_BILL', offlineBillId: bill.id }); await updateLocalBillStatus(String(bill.id), 'VERIFIED'); await refresh(); setLocalBills(await getLocalOfflineBills()); notify('Offline document linked and verified.'); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Verification failed.'); } }
  const canVerify = role === 'MANAGER' || role === 'ACCOUNTS' || role === 'OWNER';
  return <><PageHeading eyebrow="Offline Centre / Reconciliation" title="Offline billing verification" description="Review local billing records after the property reconnects." /><section className="verification-stack">{localBills.length === 0 && state.offlineBills.length === 0 ? <div className="empty-state glass-card"><AppGlyph name="policy" size={42} /><strong>No offline bills awaiting review</strong><p>Generate a bill from the offline property terminal to begin the controlled workflow.</p></div> : localBills.map((local) => { const cloud = state.offlineBills.find((bill) => bill.id === local.id); const status = String(cloud?.status ?? local.status); return <article className="glass-card verification-card" key={local.id}><div className="verification-main"><div><p className="section-kicker">Offline bill</p><h2>{local.offlineReference}</h2><span>{local.guestName} · {local.bookingReference} · Room {local.roomNumber}</span></div><Status value={status} /></div><div className="compare-grid"><div><small>Offline amount</small><strong>{money(local.totalPaise)}</strong></div><div><small>Master Hub amount</small><strong>{cloud?.cloudAmountPaise != null ? money(cloud.cloudAmountPaise) : 'Not downloaded'}</strong></div></div><div className="verification-actions">{!cloud && <span className="review-copy">Pending reconnect and reference upload.</span>}{cloud && status === 'MASTER_RECORD_NOT_FOUND' && <button className="secondary-button" onClick={() => manualUpdate(local)}>Record manual Master Hub update</button>}{cloud && status === 'MATCHED' && canVerify && <button className="primary-button" onClick={() => verify(cloud)}><AppGlyph name="policy" size={21} /> Verify & link</button>}{status === 'VERIFIED' && <span className="verified-copy"><Check size={15} /> Verified</span>}</div></article>; })}</section></>;
}

function DeviceStatusView({ state }: Parameters<typeof ViewRouter>[0]) {
  const [readiness, setReadiness] = useState<{ checks: Record<string, boolean>; ready: boolean; lastSync?: string } | null>(null);
  const [issues, setIssues] = useState<Array<{ id: string; operation: string; status: string; message?: string }>>([]);
  useEffect(() => { void getOfflineReadiness().then(setReadiness); void getRecoveryIssues().then(setIssues); }, [state.property.lastSyncAt]);
  const labels: Record<string, string> = { deviceRegistered: 'Device registered', serviceWorkerActive: 'Application shell active', applicationCached: 'Application cached', existingBookingsCached: 'Existing bookings cached', billingTemplateCached: 'Billing template cached', guestDataCached: 'Guest data cached', foliosCached: 'Active folios cached', persistentStorage: 'Persistent storage granted' };
  return <><PageHeading eyebrow="Offline Centre / Device" title="Offline readiness" description="Readiness depends on cache, data, device and storage checks." /><section className="detail-grid"><article className="glass-card readiness-card"><div className="card-heading"><div><p className="section-kicker">Front Desk 01</p><h2>Billing continuity readiness</h2></div><Status value={readiness?.ready ? 'READY FOR BILLING CONTINUITY' : 'ACTION REQUIRED'} /></div><div className="readiness-list">{Object.entries(readiness?.checks ?? {}).map(([key, value]) => <div key={key}><span className={value ? 'check-ok' : 'check-missing'}>{value ? <Check size={14} /> : <X size={14} />}</span><strong>{labels[key] ?? key}</strong><small>{value ? 'Ready' : 'Missing'}</small></div>)}</div><p className="power-note"><AlertTriangle size={16} /> Device and printer still require battery, UPS, inverter or generator power during an electricity outage.</p></article><article className="glass-card recovery-card"><p className="section-kicker">Recovery journal</p><h2>Restart recovery</h2>{issues.length ? issues.map((issue) => <div className="recovery-issue" key={issue.id}><AlertTriangle size={17} /><span><strong>{issue.operation}</strong><small>{issue.status} · {issue.message ?? 'Incomplete operation detected'}</small></span></div>) : <div className="empty-state small"><AppGlyph name="policy" size={40} /><strong>No incomplete operations</strong><p>Offline bill and document records are consistent.</p></div>}<div className="device-facts"><span><small>Device</small><strong>BHZ-FD01</strong></span><span><small>Property</small><strong>{state.property.name}</strong></span><span><small>Last sync</small><strong>{dateTime(readiness?.lastSync)}</strong></span></div></article></section></>;
}

function OperationsView(props: Parameters<typeof ViewRouter>[0]) {
  const { view, state, role } = props;
  if (view === 'Housekeeping') return <HousekeepingView {...props} />;
  if (view === 'Maintenance') return <><PageHeading eyebrow="Operations" title="Maintenance tickets" description="Operational issues can remove rooms from service with an auditable status trail." /><div className="record-grid">{state.maintenance.map((ticket) => <article className="operation-card" key={String(ticket.id)}><AppGlyph name="maintenance" size={36} className="operation-glyph" /><span className={`severity ${String(ticket.severity).toLowerCase()}`}>{String(ticket.severity)}</span><h3>{String(ticket.issue)}</h3><p>{String(ticket.id)} · Room {String(ticket.roomNumber ?? 'General')}</p><div><Status value={String(ticket.status)} /><small>{String(ticket.assignedTo ?? 'Unassigned')}</small></div></article>)}</div></>;
  if (view === 'Inventory') return <InventoryView {...props} />;
  return <><PageHeading eyebrow="Restaurant" title="Orders & room service" description="Room postings validate an active checked-in stay before changing the cloud folio." /><div className="table-card"><table><thead><tr><th>Order</th><th>Room</th><th>Type</th><th>Total</th><th>Kitchen / service</th><th>Payment</th></tr></thead><tbody>{state.restaurantOrders.map((order) => <tr key={String(order.id)}><td><strong>{String(order.id)}</strong><small>{dateTime(order.createdAt)}</small></td><td>{String(order.roomNumber ?? 'Restaurant')}</td><td>{String(order.orderType).replaceAll('_',' ')}</td><td>{money(order.totalPaise)}</td><td><Status value={String(order.status)} /></td><td><Status value={String(order.paymentStatus)} /></td></tr>)}</tbody></table></div>{role === 'HOUSEKEEPING' && <p className="privacy-note"><AppGlyph name="policy" size={22} /> Financial order details are restricted for this role.</p>}</>;
}

function HousekeepingOverviewView({ state, surface, command, refresh, updateState, notify }: Parameters<typeof ViewRouter>[0]) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [deferTask, setDeferTask] = useState<Row | null>(null);
  const [damageTask, setDamageTask] = useState<Row | null>(null);
  const tasks = state.housekeeping.filter((task) => !['COMPLETED', 'CANCELLED'].includes(String(task.status)));
  const serviceTasks = tasks.filter((task) => task.taskType !== 'CHECKOUT_INSPECTION');
  const inspections = tasks.filter((task) => task.taskType === 'CHECKOUT_INSPECTION');
  const deferred = serviceTasks.filter((task) => task.status === 'DEFERRED');

  async function optimisticCommand(task: Row, payload: Row, message: string, remove = true) {
    const taskId = String(task.id);
    if (pending.has(taskId)) return;
    setPending((current) => new Set(current).add(taskId));
    const previous = state.housekeeping;
    updateState((current) => current ? { ...current, housekeeping: remove ? current.housekeeping.filter((item) => item.id !== task.id) : current.housekeeping.map((item) => item.id === task.id ? { ...item, status: 'DEFERRED', outcome: 'COME_LATER', deferredUntil: payload.deferredUntil, scheduledAt: payload.deferredUntil, version: Number(item.version) + 1 } : item) } : current);
    try {
      await command(payload);
      notify(message);
      await refresh();
    } catch (cause) {
      updateState((current) => current ? { ...current, housekeeping: previous } : current);
      notify(cause instanceof Error ? cause.message : 'Room task could not be updated.');
    } finally {
      setPending((current) => { const next = new Set(current); next.delete(taskId); return next; });
    }
  }

  function recordOutcome(task: Row, outcome: 'DONE' | 'GUEST_REFUSED', message: string) {
    return optimisticCommand(task, { action: 'RECORD_HOUSEKEEPING_OUTCOME', taskId: task.id, expectedVersion: task.version, outcome, surface }, message);
  }

  function submitNoDamage(task: Row) {
    return optimisticCommand(task, { action: 'SUBMIT_ROOM_INSPECTION', taskId: task.id, expectedVersion: task.version, result: 'NO_DAMAGE', surface }, `Room ${task.roomNumber} inspection completed with no damage.`);
  }

  return <>
    <PageHeading eyebrow="Housekeeping overview" title={`Good afternoon, ${state.actor.name.split(' ')[0]}.`} description="Only rooms that need service or checkout inspection are shown here." />
    <section className="service-summary-grid">
      <Metric label="Rooms needing service" value={serviceTasks.length - deferred.length} />
      <Metric label="Checkout inspections" value={inspections.length} />
      <Metric label="Come back later" value={deferred.length} />
    </section>
    {tasks.length ? <section className="service-task-grid">{tasks.map((task) => {
      const isInspection = task.taskType === 'CHECKOUT_INSPECTION';
      const isCheckoutCleaning = task.taskType === 'CHECKOUT_CLEANING';
      return <article className={`service-task-card ${pending.has(String(task.id)) ? 'task-pending' : ''}`} key={String(task.id)}>
        <div className="service-task-heading"><span className="record-icon" aria-hidden="true">{isInspection ? <AppGlyph name="damage-alert" size={26} /> : <AppGlyph name="housekeeping" size={26} />}</span><div><small>{isInspection ? 'Checkout inspection' : task.status === 'DEFERRED' ? 'Return visit' : isCheckoutCleaning ? 'Checkout cleaning' : 'Room service'}</small><h2>Room {String(task.roomNumber)}</h2></div><Status value={String(task.priority)} /></div>
        <p>{String(task.notes ?? (isInspection ? 'Inspect the room before final folio closure.' : 'Complete the requested room service.'))}</p>
        <div className="service-task-meta"><span><Clock3 size={13} /> {dateTime(task.deferredUntil ?? task.scheduledAt)}</span>{Boolean(task.assignedTo) && <span><AppGlyph name="staff" size={18} /> {String(task.assignedTo)}</span>}</div>
        {isInspection ? <div className="service-actions"><button className="secondary-button" disabled={pending.has(String(task.id))} onClick={() => void submitNoDamage(task)}><Check size={14} /> No damage</button><button className="primary-button" disabled={pending.has(String(task.id))} onClick={() => setDamageTask(task)}><AlertTriangle size={14} /> Damage found</button></div> : <div className="service-actions"><button className="primary-button" disabled={pending.has(String(task.id))} onClick={() => void recordOutcome(task, 'DONE', `Room ${task.roomNumber} marked done.`)}><Check size={14} /> Done</button>{!isCheckoutCleaning && <button className="secondary-button" disabled={pending.has(String(task.id))} onClick={() => void recordOutcome(task, 'GUEST_REFUSED', `Guest refusal recorded for room ${task.roomNumber}.`)}>Guest refused</button>}<button className="secondary-button" disabled={pending.has(String(task.id))} onClick={() => setDeferTask(task)}><Clock3 size={14} /> Come later</button></div>}
      </article>;
    })}</section> : <div className="empty-state glass-card service-empty"><AppGlyph name="housekeeping" size={44} /><strong>All assigned rooms are complete</strong><p>New service and checkout inspection tasks will appear automatically.</p></div>}
    {deferTask && <ComeLaterModal task={deferTask} onClose={() => setDeferTask(null)} onSave={async (deferredUntil) => { setDeferTask(null); await optimisticCommand(deferTask, { action: 'RECORD_HOUSEKEEPING_OUTCOME', taskId: deferTask.id, expectedVersion: deferTask.version, outcome: 'COME_LATER', deferredUntil, surface }, `Return visit scheduled for room ${deferTask.roomNumber}.`, false); }} />}
    {damageTask && <DamageInspectionModal task={damageTask} onClose={() => setDamageTask(null)} onSave={async (form) => { setDamageTask(null); await optimisticCommand(damageTask, { action: 'SUBMIT_ROOM_INSPECTION', taskId: damageTask.id, expectedVersion: damageTask.version, result: 'DAMAGE_FOUND', surface, ...form }, `Damage report submitted for room ${damageTask.roomNumber}.`); }} />}
  </>;
}

function HousekeepingView(props: Parameters<typeof ViewRouter>[0]) { return <HousekeepingOverviewView {...props} />; }

function ComeLaterModal({ task, onClose, onSave }: { task: Row; onClose: () => void; onSave: (deferredUntil: string) => Promise<void> }) {
  const [value, setValue] = useState(() => localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal-card compact-modal" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await onSave(new Date(value).toISOString()); } finally { setBusy(false); } }}><div className="modal-heading"><div><p className="section-kicker">Room {String(task.roomNumber)}</p><h2>Schedule a return visit</h2><p>Choose when housekeeping should come back.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="form-grid"><label className="wide"><span>Return date and time</span><input required type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Schedule return'}</button></div></form></div>;
}

function DamageInspectionModal({ task, onClose, onSave }: { task: Row; onClose: () => void; onSave: (form: Row) => Promise<void> }) {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<DamageSeverity>('LOW');
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal-card compact-modal" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await onSave({ description, severity }); } finally { setBusy(false); } }}>
    <div className="modal-heading"><div><p className="section-kicker">Room {String(task.roomNumber)} inspection</p><h2>Record room damage</h2><p>The property manager will review the report and decide whether a guest charge is required.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div>
    <div className="condition-only-note"><AppGlyph name="damage-alert" size={26} /><span><strong>Condition report only</strong><small>Housekeeping records the damage and severity. Guest liability is calculated from the hotel&apos;s active policy.</small></span></div>
    <div className="form-grid"><label className="wide"><span>Damage and repair notes</span><textarea required minLength={5} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the damaged item, condition and repair likely needed" /></label><label className="wide"><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as DamageSeverity)}><option value="LOW">Low · cosmetic or minor repair</option><option value="MEDIUM">Medium · repair and maintenance review required</option><option value="HIGH">High · urgent; room may be unavailable</option></select></label></div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit inspection'}</button></div>
  </form></div>;
}

function DamageReviewPanel({ reports, surface, command, refresh, notify }: { reports: Row[]; surface: Surface; command: (payload: Record<string, unknown>) => Promise<Row>; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [charging, setCharging] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState('');
  const pendingReports = reports.filter((report) => report.status === 'PENDING_REVIEW');
  if (!pendingReports.length) return null;
  async function resolve(report: Row, decision: 'POST_CHARGE' | 'WAIVE', details: { repairCostPaise?: number; decisionNote?: string } = {}) {
    setBusyId(String(report.id));
    try {
      await command({ action: 'RESOLVE_DAMAGE_REPORT', reportId: report.id, expectedVersion: report.version, decision, surface, ...details });
      setCharging(null);
      await refresh();
      notify(decision === 'POST_CHARGE' ? `Damage charge posted for room ${report.roomNumber}.` : `Damage report for room ${report.roomNumber} closed without charge.`);
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Damage report could not be reviewed.'); } finally { setBusyId(''); }
  }
  return <section className="damage-review-section"><div className="subsection-heading"><div><p className="section-kicker">Post-checkout inspection</p><h2>Damage review</h2></div><span>{pendingReports.length} awaiting decision</span></div><div className="damage-review-grid">{pendingReports.map((report) => <article key={String(report.id)}><div><span className="record-icon"><AppGlyph name="damage-alert" size={26} /></span><div><small>{String(report.bookingReference)} · Room {String(report.roomNumber)}</small><h3>{String(report.description)}</h3></div><Status value={String(report.severity)} /></div><p>Reported by {String(report.reportedBy)} · {dateTime(report.reportedAt)}</p><div className="damage-policy-inline"><span>{String(report.policyLabel ?? 'Hotel damage policy')}</span><strong>Liability up to {money(report.policyLiabilityPaise)}</strong></div><div className="service-actions"><button className="secondary-button" disabled={busyId === String(report.id)} onClick={() => void resolve(report, 'WAIVE', { decisionNote: 'No guest charge after manager review.' })}>No guest charge</button><button className="primary-button" disabled={busyId === String(report.id)} onClick={() => setCharging(report)}><IndianRupee size={14} /> Review policy charge</button></div></article>)}</div>{charging && <DamageChargeModal report={charging} onClose={() => setCharging(null)} onSave={(details) => resolve(charging, 'POST_CHARGE', details)} />}</section>;
}

function DamageChargeModal({ report, onClose, onSave }: { report: Row | ReservationInspectionSummary; onClose: () => void; onSave: (details: { repairCostPaise: number; decisionNote: string }) => Promise<void> }) {
  const policyLiabilityPaise = Number(report.policyLiabilityPaise ?? 0);
  const [repairCost, setRepairCost] = useState(() => Math.max(1, Math.round(policyLiabilityPaise / 100)));
  const [decisionNote, setDecisionNote] = useState('Repair estimate reviewed against hotel policy.');
  const [busy, setBusy] = useState(false);
  const repairCostPaise = Math.round(repairCost * 100);
  const chargePreviewPaise = Math.min(repairCostPaise, policyLiabilityPaise);
  const description = 'damageDescription' in report ? report.damageDescription : 'description' in report ? report.description : null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal-card compact-modal" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await onSave({ repairCostPaise, decisionNote }); } finally { setBusy(false); } }}>
    <div className="modal-heading"><div><p className="section-kicker">{String(report.bookingReference)} · Room {String(report.roomNumber)}</p><h2>Review the policy-based charge</h2><p>{String(description ?? 'Room damage recorded after checkout.')}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div>
    <div className="policy-charge-summary"><AppGlyph name="policy" size={34} /><span><small>{String(report.policyLabel ?? 'Hotel damage policy')}</small><strong>Liability limit {money(policyLiabilityPaise)}</strong><em>{String(report.severity ?? 'Damage')} severity</em></span></div>
    <div className="form-grid"><label className="wide"><span>Documented repair cost (₹)</span><input required type="number" min="1" max="1000000" step="1" value={repairCost} onChange={(event) => setRepairCost(Number(event.target.value))} /><small>The server will cap the guest charge at the policy liability limit.</small></label><label className="wide"><span>Manager review note</span><textarea required minLength={5} maxLength={500} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label></div>
    <div className="charge-preview"><span><small>Repair estimate</small><strong>{money(repairCostPaise)}</strong></span><AppGlyph name="charge-receipt" size={28} /><span><small>Guest charge</small><strong>{money(chargePreviewPaise)}</strong></span></div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy || policyLiabilityPaise <= 0}>{busy ? 'Posting…' : 'Post policy charge'}</button></div>
  </form></div>;
}

function InventoryView({ state, role, surface, propertyRestricted, command, refresh, updateState, notify }: Parameters<typeof ViewRouter>[0]) {
  const [editing, setEditing] = useState<Row | 'NEW' | null>(null);
  const canEdit = ['OWNER', 'MANAGER', 'RESTAURANT'].includes(role);
  async function save(form: Row) {
    const result = await command({ action: 'UPSERT_INVENTORY', surface, ...form });
    const item = result.item as Row;
    updateState((current) => current ? { ...current, inventory: [...current.inventory.filter((record) => record.id !== item.id), item].sort((a, b) => String(a.name).localeCompare(String(b.name))) } : current);
    setEditing(null); notify(result.noOp ? 'No inventory values changed.' : `${item.name} saved and logged with date, time and field changes.`); void refresh();
  }
  return <><PageHeading eyebrow={role === 'RESTAURANT' ? 'Restaurant operations' : 'Operations'} title="Inventory control" description={role === 'RESTAURANT' ? 'Manage kitchen, beverage and restaurant supplies with a complete change history.' : 'Add or edit stock with an automatic record of who changed what and when.'} actions={canEdit && <button className="primary-button" disabled={propertyRestricted} title={propertyRestricted ? 'Requires Master Hub connection' : undefined} onClick={() => setEditing('NEW')}><Plus size={16} /> Add inventory</button>} /><div className="table-card"><table><thead><tr><th>Item</th><th>Category</th>{role !== 'RESTAURANT' && <th>Department</th>}<th>Current</th><th>Minimum</th><th>Unit cost</th><th>Updated</th><th>Status</th><th></th></tr></thead><tbody>{state.inventory.map((item) => <tr key={String(item.id)}><td><span className="table-domain-item"><AppGlyph name={role === 'RESTAURANT' ? 'restaurant' : 'inventory'} size={27} /><strong>{String(item.name)}</strong></span></td><td>{String(item.category)}</td>{role !== 'RESTAURANT' && <td>{String(item.department ?? 'HOTEL').replaceAll('_', ' ')}</td>}<td>{Number(item.currentQuantity)} {String(item.unit)}</td><td>{Number(item.minimumQuantity)} {String(item.unit)}</td><td>{money(item.unitCostPaise)}</td><td>{dateTime(item.updatedAt)}</td><td><Status value={Number(item.currentQuantity) <= Number(item.minimumQuantity) ? 'REORDER' : 'IN STOCK'} /></td><td>{canEdit && <button className="row-action" disabled={propertyRestricted} onClick={() => setEditing(item)}><Pencil size={13} /> Edit</button>}</td></tr>)}</tbody></table></div>{editing && <InventoryModal role={role} item={editing === 'NEW' ? null : editing} onClose={() => setEditing(null)} onSave={async (form) => { try { await save(form); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Inventory item could not be saved.'); } }} />}</>;
}

function InventoryModal({ item, role, onClose, onSave }: { item: Row | null; role: AppRole; onClose: () => void; onSave: (form: Row) => Promise<void> }) {
  const [form, setForm] = useState({ name: String(item?.name ?? ''), category: String(item?.category ?? (role === 'RESTAURANT' ? 'Kitchen' : 'Housekeeping')), department: String(item?.department ?? (role === 'RESTAURANT' ? 'RESTAURANT' : 'HOTEL')), unit: String(item?.unit ?? 'piece'), currentQuantity: Number(item?.currentQuantity ?? 0), minimumQuantity: Number(item?.minimumQuantity ?? 0), unitCostRupees: Number(item?.unitCostPaise ?? 0) / 100 });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSave({ id: item?.id, expectedUpdatedAt: item?.updatedAt, name: form.name, category: form.category, department: form.department, unit: form.unit, currentQuantity: form.currentQuantity, minimumQuantity: form.minimumQuantity, unitCostPaise: Math.round(form.unitCostRupees * 100) }); } finally { setBusy(false); } }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal-card compact-modal" onSubmit={submit}><div className="modal-heading"><div><p className="section-kicker">Inventory audit</p><h2>{item ? 'Edit inventory item' : 'Add inventory item'}</h2><p>The saved values and their previous state will be timestamped automatically.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="form-grid"><label className="wide"><span>Item name</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label><span>Category</span>{role === 'RESTAURANT' ? <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{['Kitchen','Beverage','Restaurant Supplies'].map((value) => <option key={value}>{value}</option>)}</select> : <input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />}</label>{role !== 'RESTAURANT' && <label><span>Department</span><select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}><option value="HOTEL">Hotel operations</option><option value="RESTAURANT">Restaurant</option></select></label>}<label><span>Unit</span><input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label><label><span>Current quantity</span><input type="number" min="0" step="1" value={form.currentQuantity} onChange={(event) => setForm({ ...form, currentQuantity: Number(event.target.value) })} /></label><label><span>Minimum quantity</span><input type="number" min="0" step="1" value={form.minimumQuantity} onChange={(event) => setForm({ ...form, minimumQuantity: Number(event.target.value) })} /></label><label className="wide"><span>Unit cost (₹)</span><input type="number" min="0" step="0.01" value={form.unitCostRupees} onChange={(event) => setForm({ ...form, unitCostRupees: Number(event.target.value) })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving & logging…' : 'Save inventory item'}</button></div></form></div>;
}

function TravelSalesView({ view, state, role, command, refresh, notify }: Parameters<typeof ViewRouter>[0]) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pricingPackage, setPricingPackage] = useState<Row | null>(null);
  const canManagePricing = ['OWNER', 'MANAGER', 'TOUR_MANAGER'].includes(role);
  async function decide(requestId: unknown, decision: 'APPROVED' | 'REJECTED') { try { await command({ action: 'RESOLVE_DISCOUNT_REQUEST', requestId, decision }); await refresh(); notify(decision === 'APPROVED' ? 'Discount approved and the requested price is ready to send.' : 'Discount rejected; the quote has been returned for repricing.'); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Discount decision could not be saved.'); } }
  if (view === 'Inquiry CRM') return <><PageHeading eyebrow="Sales / Inquiry CRM" title="Inquiry pipeline" description="Source, owner, follow-up and conversion status in a live operational pipeline." /><div className="crm-pipeline">{['NEW','FOLLOW_UP','NEGOTIATION','CONVERTED'].map((stage) => <section key={stage}><h3>{stage.replace('_',' ')}</h3>{state.inquiries.filter((inquiry) => inquiry.status === stage).map((inquiry) => <article key={String(inquiry.id)}><span>{String(inquiry.reference)}</span><strong>{String(inquiry.customerName)}</strong><p>{String(inquiry.service)}</p><div><small>{String(inquiry.source)} · {String(inquiry.owner)}</small><b>{money(inquiry.estimatedValuePaise)}</b></div><em>Follow-up {dateTime(inquiry.followUpAt)}</em></article>)}</section>)}</div></>;
  const pendingRequests = state.discountRequests.filter((request) => request.status === 'PENDING');
  return <><PageHeading eyebrow="Travel / Package studio" title="Packages, quotes & approvals" description="Build tailored packages from approved assets, price within the manager floor, or send a below-floor discount for approval." actions={<button className="primary-button" onClick={() => setBuilderOpen(true)}><Plus size={16} /> Build custom package</button>} /><section className="pricing-policy-banner"><AppGlyph name="policy" size={27} /><span><strong>Manager-controlled pricing guardrails</strong><small>Sales can quote freely at or above the floor. Any lower price creates an approval request instead of silently changing the quote.</small></span><b>{canManagePricing ? 'Pricing manager' : 'Sales guardrail active'}</b></section><div className="subsection-heading"><div><p className="section-kicker">Scheduled products</p><h2>Available tours</h2></div><span>{state.packages.length} active</span></div><div className="package-grid">{state.packages.map((item) => { const fill = Math.round(Number(item.booked) / Number(item.capacity) * 100); return <article className="package-card" key={String(item.id)}><span className="package-icon"><AppGlyph name="travel" size={31} /></span><Status value={String(item.status)} /><h2>{String(item.name)}</h2><p>{String(item.locations)}</p><div className="package-facts"><span><small>Duration</small><strong>{Number(item.durationDays)} days</strong></span><span><small>Price</small><strong>{money(item.sellingPricePaise)}</strong></span></div><div className="capacity-bar"><span style={{ width: `${fill}%` }} /></div><div className="capacity-copy"><span>{Number(item.booked)} booked</span><span>{Number(item.capacity)} capacity</span></div></article>; })}</div><div className="subsection-heading custom-heading"><div><p className="section-kicker">Tailored proposals</p><h2>Custom package quotes</h2></div><span>{state.customPackages.length} quotes</span></div>{state.customPackages.length ? <div className="custom-package-grid">{state.customPackages.map((item) => { const packageItems = state.customPackageItems.filter((line) => line.packageId === item.id); const discount = Math.max(0, Math.round((1 - Number(item.quotedPricePaise) / Math.max(Number(item.basePricePaise), 1)) * 100)); return <article className="custom-package-card" key={String(item.id)}><div className="card-heading"><span><small>{String(item.reference)}</small><h3>{String(item.name)}</h3><p>{String(item.clientName)} · {String(item.ownerName)}</p></span><Status value={String(item.status)} /></div><div className="asset-chip-list">{packageItems.slice(0,4).map((line) => <span key={String(line.id)}>{String(line.assetName)} × {Number(line.quantity)}</span>)}</div><div className="quote-pricing-grid"><span><small>Asset value</small><strong>{money(item.assetSubtotalPaise)}</strong></span><span><small>Base / floor</small><strong>{money(item.basePricePaise)} / {money(item.floorPricePaise)}</strong></span><span><small>Client quote</small><strong>{money(item.quotedPricePaise)}</strong><em>{discount}% discount</em></span></div>{canManagePricing && <button className="secondary-button" onClick={() => setPricingPackage(item)}><Pencil size={14} /> Set base & floor</button>}</article>; })}</div> : <div className="empty-state glass-card"><AppGlyph name="travel" size={44} /><strong>No custom package yet</strong><p>Start with the approved hotel, transport, dining and experience assets.</p></div>}<section className="approval-section"><div className="subsection-heading"><div><p className="section-kicker">Price governance</p><h2>Discount approval queue</h2></div><span>{pendingRequests.length} pending</span></div>{pendingRequests.length ? <div className="approval-grid">{pendingRequests.map((request) => <article key={String(request.id)}><div><small>{String(request.packageReference)}</small><h3>{String(request.packageName)}</h3><p>{String(request.clientName)} · requested by {String(request.requestedByName)}</p></div><div className="approval-price"><span><small>Base</small><strong>{money(request.basePricePaise)}</strong></span><span><small>Floor</small><strong>{money(request.floorPricePaise)}</strong></span><span><small>Requested</small><strong>{money(request.requestedPricePaise)}</strong></span></div><blockquote>{String(request.reason)}</blockquote>{canManagePricing ? <div className="approval-actions"><button className="secondary-button" onClick={() => decide(request.id, 'REJECTED')}><X size={14} /> Reject</button><button className="primary-button" onClick={() => decide(request.id, 'APPROVED')}><Check size={14} /> Approve</button></div> : <div className="waiting-approval"><AppGlyph name="policy" size={22} /> Waiting for manager decision</div>}</article>)}</div> : <div className="empty-state small glass-card"><AppGlyph name="policy" size={40} /><strong>No pending discount requests</strong><p>All current quotes are within their approved pricing floor.</p></div>}</section>{builderOpen && <PackageBuilderModal assets={state.travelAssets} role={role} onClose={() => setBuilderOpen(false)} onSubmit={async (payload) => { try { const result = await command({ action: 'CREATE_CUSTOM_PACKAGE', ...payload }); setBuilderOpen(false); await refresh(); notify(result.status === 'DISCOUNT_REQUESTED' ? `${result.reference} saved and sent for manager discount approval.` : `${result.reference} is priced and ready to send.`); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Custom package could not be saved.'); } }} />}{pricingPackage && <PackagePricingModal item={pricingPackage} onClose={() => setPricingPackage(null)} onSubmit={async (payload) => { try { await command({ action: 'SET_PACKAGE_PRICING', packageId: pricingPackage.id, ...payload }); setPricingPackage(null); await refresh(); notify('Base and floor pricing updated; stale approvals were closed automatically.'); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Pricing could not be updated.'); } }} />}</>;
}

function PackageBuilderModal({ assets, role, onClose, onSubmit }: { assets: Row[]; role: AppRole; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ clientName: '', name: '', baseRupees: 0, floorRupees: 0, quoteRupees: 0, discountReason: '' });
  const [busy, setBusy] = useState(false);
  const canManage = ['OWNER', 'MANAGER', 'TOUR_MANAGER'].includes(role);
  const assetSubtotalPaise = assets.reduce((sum, asset) => sum + (selected[String(asset.id)] ?? 0) * Number(asset.unitPricePaise), 0);
  const basePaise = canManage && form.baseRupees > 0 ? Math.round(form.baseRupees * 100) : assetSubtotalPaise;
  const floorPaise = canManage && form.floorRupees > 0 ? Math.round(form.floorRupees * 100) : Math.round(basePaise * 0.9);
  const quotePaise = form.quoteRupees > 0 ? Math.round(form.quoteRupees * 100) : basePaise;
  const belowFloor = quotePaise > 0 && quotePaise < floorPaise && !canManage;
  function toggle(assetId: string) { setSelected((current) => { const next = { ...current }; if (next[assetId]) delete next[assetId]; else next[assetId] = 1; return next; }); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSubmit({ clientName: form.clientName, name: form.name, basePricePaise: basePaise, floorPricePaise: floorPaise, quotedPricePaise: quotePaise, discountReason: form.discountReason, assetSelections: Object.entries(selected).map(([assetId, quantity]) => ({ assetId, quantity })) }); } finally { setBusy(false); } }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal-card package-builder-modal" onSubmit={submit}><div className="modal-heading"><div><p className="section-kicker">Custom package studio</p><h2>Build from available assets</h2><p>Select operational assets first; the server recalculates every price before saving.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="builder-layout"><section><h3>1. Client brief</h3><div className="form-grid"><label><span>Client name</span><input required value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} placeholder="Client or group" /></label><label><span>Package name</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tailored Rajasthan escape" /></label></div><h3>2. Available assets</h3><div className="asset-selector">{assets.map((asset) => { const assetId = String(asset.id); const quantity = selected[assetId] ?? 0; return <div key={assetId} className={quantity ? 'selected' : ''}><button type="button" onClick={() => toggle(assetId)}><span className="asset-check">{quantity ? <Check size={13} /> : <Plus size={13} />}</span><span><strong>{String(asset.name)}</strong><small>{String(asset.category)} · {String(asset.pricingUnit)}</small></span><b>{money(asset.unitPricePaise)}</b></button>{quantity > 0 && <label><span>Qty</span><input aria-label={`${String(asset.name)} quantity`} type="number" min="1" max="99" step="1" value={quantity} onChange={(event) => setSelected({ ...selected, [assetId]: Math.max(1, Math.min(99, Number(event.target.value))) })} /></label>}</div>; })}</div></section><aside className="pricing-sidebar"><h3>3. Pricing guardrail</h3><div className="pricing-summary"><span><small>Selected asset value</small><strong>{money(assetSubtotalPaise)}</strong></span>{canManage && <><label><span>Manager base price (₹)</span><input type="number" min="0" step="1" value={form.baseRupees} onChange={(event) => setForm({ ...form, baseRupees: Number(event.target.value) })} placeholder={String(assetSubtotalPaise / 100)} /></label><label><span>Lowest allowed price (₹)</span><input type="number" min="0" step="1" value={form.floorRupees} onChange={(event) => setForm({ ...form, floorRupees: Number(event.target.value) })} placeholder={String(Math.round(assetSubtotalPaise * 0.9) / 100)} /></label></>}<span><small>Base price</small><strong>{money(basePaise)}</strong></span><span><small>Sales floor</small><strong>{money(floorPaise)}</strong></span><label><span>Client quote (₹)</span><input type="number" min="1" step="1" value={form.quoteRupees} onChange={(event) => setForm({ ...form, quoteRupees: Number(event.target.value) })} placeholder={String(basePaise / 100)} /></label></div>{belowFloor && <label className="discount-reason"><span>Reason for below-floor request</span><textarea required minLength={5} value={form.discountReason} onChange={(event) => setForm({ ...form, discountReason: event.target.value })} placeholder="Commercial reason and approval context" /></label>}<div className={`pricing-decision ${belowFloor ? 'needs-approval' : ''}`}><AppGlyph name="policy" size={24} /><span><strong>{belowFloor ? 'Manager approval required' : 'Within approved pricing'}</strong><small>{belowFloor ? `${money(floorPaise - quotePaise)} below the current floor` : 'This quote can be sent without a discount request.'}</small></span></div></aside></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy || assetSubtotalPaise <= 0}>{busy ? 'Saving package…' : belowFloor ? 'Save & request approval' : 'Save package quote'}</button></div></form></div>;
}

function PackagePricingModal({ item, onClose, onSubmit }: { item: Row; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [baseRupees, setBaseRupees] = useState(Number(item.basePricePaise) / 100); const [floorRupees, setFloorRupees] = useState(Number(item.floorPricePaise) / 100); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSubmit({ basePricePaise: Math.round(baseRupees * 100), floorPricePaise: Math.round(floorRupees * 100) }); } finally { setBusy(false); } }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal-card compact-modal" onSubmit={submit}><div className="modal-heading"><div><p className="section-kicker">Manager pricing</p><h2>Set base & lowest price</h2><p>{String(item.reference)} · {String(item.name)}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="form-grid"><label><span>Base price (₹)</span><input type="number" min="0" step="1" value={baseRupees} onChange={(event) => setBaseRupees(Number(event.target.value))} /></label><label><span>Lowest sales price (₹)</span><input type="number" min="0" max={baseRupees} step="1" value={floorRupees} onChange={(event) => setFloorRupees(Number(event.target.value))} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy || floorRupees > baseRupees}>{busy ? 'Saving policy…' : 'Save pricing policy'}</button></div></form></div>;
}

function IntegrationsView({ state, refresh, notify }: Parameters<typeof ViewRouter>[0]) {
  const integrations: Array<{ key: string; name: string; detail: string; glyph: AppGlyphName }> = [{ key:'payment', name:'Payment gateway', detail:'Initiated · pending · successful · failed · refunded', glyph:'payment' },{ key:'whatsapp', name:'WhatsApp Business', detail:'Template and delivery log adapter', glyph:'phone-chat' },{ key:'email', name:'Transactional email', detail:'Template and delivery log adapter', glyph:'email' },{ key:'channelManager', name:'Channel manager', detail:'Rates, availability, inventory and reservations', glyph:'channel-sync' },{ key:'godrej', name:'Godrej locks / room status', detail:'Capability-driven simulator only', glyph:'smart-lock' }];
  async function ota() { try { const response = await fetch('/api/bookings/inbound', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-demo-provider': 'channel-manager-sandbox' }, body: JSON.stringify({ providerReference: `OTA-DEMO-${Date.now()}`, source: 'OTA', guestName: 'Rohit Sharma', email: 'rohit.sharma@example.in', phone: '+91 98100 44556', city: 'Pune', arrivalDate: '2026-08-27', departureDate: '2026-08-29', roomType: 'Deluxe' }) }); const body = await response.json() as { result?: Row; error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? 'Provider booking was rejected.'); await refresh(); notify(`${body.result?.reference ?? 'OTA booking'} arrived through the live provider intake and is now reflected everywhere.`); } catch (cause) { notify(cause instanceof Error ? cause.message : 'OTA simulation failed.'); } }
  return <><PageHeading eyebrow="Administration / Integrations" title="Provider adapters" description="Production interfaces with clearly identified sandbox providers until client credentials and API documentation arrive." actions={<button className="primary-button" onClick={ota}><AppGlyph name="travel" size={22} /> Simulate OTA booking</button>} /><div className="integration-grid">{integrations.map((item) => <article className="glass-card integration-card" key={item.key}><span className="integration-icon"><AppGlyph name={item.glyph} size={30} /></span><div><h3>{item.name}</h3><p>{item.detail}</p></div><SandboxBadge value={state.sandbox[item.key]} /></article>)}</div></>;
}

function ReportsView({ state, notify, businessUnit }: Parameters<typeof ViewRouter>[0]) {
  if (businessUnit === 'TRAVEL') {
    const travelRows = [{ metric: 'Active tours', value: String(state.travelMetrics.activePackages) }, { metric: 'Open inquiries', value: String(state.travelMetrics.openInquiries) }, { metric: 'Pipeline value', value: money(state.travelMetrics.pipelineValuePaise) }, { metric: 'Custom quotes', value: String(state.travelMetrics.customQuotes) }, { metric: 'Pending approvals', value: String(state.travelMetrics.pendingApprovals) }, { metric: 'Overdue follow-ups', value: String(state.travelMetrics.overdueFollowUps) }];
    function exportTravelCsv() { const csv = ['Metric,Value', ...travelRows.map((row) => `"${row.metric}","${row.value}"`)].join('\n'); downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'brainadz-travel-sales-report-2026-08-24.csv'); notify('Travel & Sales report exported to CSV.'); }
    return <><PageHeading eyebrow="Travel / Reports" title="Sales & package performance" description="Travel-only pipeline, custom quote and approval figures." actions={<button className="primary-button" onClick={exportTravelCsv}><Download size={15} /> Export CSV</button>} /><section className="report-grid"><article className="glass-card report-chart"><p className="section-kicker">Pipeline health</p><h2>Inquiry & approval status</h2><div className="bar-chart"><div><span>Open inquiries</span><i><b style={{ width: `${Math.min(100, state.travelMetrics.openInquiries * 18)}%` }} /></i><strong>{state.travelMetrics.openInquiries}</strong></div><div><span>Custom quotes</span><i><b style={{ width: `${Math.min(100, state.travelMetrics.customQuotes * 20)}%` }} /></i><strong>{state.travelMetrics.customQuotes}</strong></div><div><span>Pending approvals</span><i><b style={{ width: `${Math.min(100, state.travelMetrics.pendingApprovals * 25)}%` }} /></i><strong>{state.travelMetrics.pendingApprovals}</strong></div></div></article><article className="glass-card report-table"><p className="section-kicker">Calculated summary</p>{travelRows.map((row) => <div key={row.metric}><span>{row.metric}</span><strong>{row.value}</strong></div>)}</article></section></>;
  }
  const reportRows = [{ metric:'Occupancy', value:`${state.metrics.occupancyPercent}%` },{ metric:'ADR', value:money(state.metrics.adrPaise) },{ metric:'RevPAR', value:money(state.metrics.revParPaise) },{ metric:'Hotel revenue', value:money(state.metrics.revenuePaise) },{ metric:'Arrivals', value:String(state.metrics.arrivalsToday) },{ metric:'Departures', value:String(state.metrics.departuresToday) },{ metric:'Low-stock items', value:String(state.metrics.lowStockCount) },{ metric:'Open maintenance', value:String(state.metrics.unresolvedMaintenance) }];
  function exportCsv() { const csv = ['Metric,Value', ...reportRows.map((row) => `"${row.metric}","${row.value}"`)].join('\n'); const blob = new Blob([csv], { type:'text/csv;charset=utf-8' }); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download='brainadz-hospitality-operational-report-2026-08-24.csv'; link.click(); URL.revokeObjectURL(url); notify('Calculated operational report exported to CSV.'); }
  return <><PageHeading eyebrow="Reports" title="Operating performance" description="Every figure below is calculated from current application records." actions={<><button className="secondary-button" onClick={() => window.print()}><Printer size={15} /> Print report</button><button className="primary-button" onClick={exportCsv}><Download size={15} /> Export CSV</button></>} /><section className="report-grid"><article className="glass-card report-chart"><div className="card-heading"><div><p className="section-kicker">Room performance</p><h2>Occupancy, ADR & RevPAR</h2></div><span className="date-chip">24 Aug 2026</span></div><div className="bar-chart"><div><span>Occupancy</span><i><b style={{ width:`${state.metrics.occupancyPercent}%` }} /></i><strong>{state.metrics.occupancyPercent}%</strong></div><div><span>ADR</span><i><b style={{ width:'82%' }} /></i><strong>{money(state.metrics.adrPaise)}</strong></div><div><span>RevPAR</span><i><b style={{ width:'67%' }} /></i><strong>{money(state.metrics.revParPaise)}</strong></div></div></article><article className="glass-card report-table"><p className="section-kicker">Calculated summary</p>{reportRows.map((row) => <div key={row.metric}><span>{row.metric}</span><strong>{row.value}</strong></div>)}</article></section></>;
}

function AuditView({ state }: Parameters<typeof ViewRouter>[0]) {
  return <><PageHeading eyebrow="Administration" title="Audit log" description="Date, time, user and exact before/after values for every material update." /><div className="table-card"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Changes</th><th>Source</th><th>Correlation</th></tr></thead><tbody>{state.audit.map((entry) => <tr key={String(entry.id)}><td title={String(entry.timestamp)}>{dateTime(entry.timestamp)}</td><td><strong>{String(entry.actorName)}</strong><small>{String(entry.role)}</small></td><td>{String(entry.action).replaceAll('_',' ')}</td><td>{String(entry.entity)} · {String(entry.entityId).slice(0,16)}</td><td><AuditChanges entry={entry} /></td><td><Status value={String(entry.source)} /></td><td><code>{String(entry.correlationId).slice(0,12)}</code></td></tr>)}</tbody></table></div></>;
}

function AuditChanges({ entry }: { entry: Row }) {
  const previous = parseAuditObject(entry.previousValue);
  const next = parseAuditObject(entry.newValue);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  if (!keys.length) return <span className="audit-no-change">Recorded</span>;
  return <span className="audit-change-list">{keys.slice(0, 3).map((key) => <small key={key}><b>{key.replace(/([A-Z])/g, ' $1')}</b>: {formatAuditValue(previous[key])} → {formatAuditValue(next[key])}</small>)}{keys.length > 3 && <em>+{keys.length - 3} more</em>}</span>;
}

function parseAuditObject(value: unknown): Record<string, unknown> { try { return value ? JSON.parse(String(value)) as Record<string, unknown> : {}; } catch { return {}; } }

function formatAuditValue(value: unknown) {
  if (value == null || value === '') return 'Not available';
  if (typeof value === 'object') return 'details';
  const text = String(value);
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

function ReservationModal({ state, surface, offlineLocal, productionMode, onClose, onSubmit }: { state: DemoState; surface: Surface; offlineLocal: boolean; productionMode: boolean; onClose: () => void; onSubmit: (form: Row) => Promise<void> }) {
  const firstRoom = state.rooms[0];
  const propertyToday = productionMode ? new Intl.DateTimeFormat('en-CA', { timeZone: String(state.property.timezone ?? 'Asia/Kolkata'), year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()) : '2026-08-27';
  const propertyTomorrowDate = new Date(`${propertyToday}T00:00:00Z`); propertyTomorrowDate.setUTCDate(propertyTomorrowDate.getUTCDate()+1);
  const propertyTomorrow = productionMode ? propertyTomorrowDate.toISOString().slice(0,10) : '2026-08-29';
  const [form, setForm] = useState({ guestName:'Rohit Sharma', email:'rohit.sharma@example.in', phone:'+91 98100 44556', city:'Pune', dietaryRequirements:'',
    guestCount:1, children:0, arrivalDate:propertyToday, departureDate:propertyTomorrow, roomId:String(firstRoom?.id ?? ''),
    roomType:String(firstRoom?.roomType ?? 'Deluxe'), nightlyRatePaise:Number(firstRoom?.baseRatePaise ?? 0), taxRateBps:0, source:'DIRECT',
    specialRequests:'', internalNotes:'', mealPlan:['BREAKFAST'] as MealService[] });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSubmit(form); } finally { setBusy(false); } }
  function toggleMeal(value: MealService) { setForm((current) => ({ ...current, mealPlan: current.mealPlan.includes(value) ? current.mealPlan.filter((item) => item !== value) : [...current.mealPlan, value] })); }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal-card" onSubmit={submit}><div className="modal-heading"><div><p className="section-kicker">{offlineLocal ? 'Offline front desk' : surface === 'MASTER_HUB' ? 'Master Hub' : 'Property PMS'} · Walk-in desk</p><h2>{offlineLocal ? 'Save offline walk-in' : 'New reservation'}</h2><p>{offlineLocal ? 'The reservation will be stored on this device and synchronized automatically after reconnection.' : state.property.connectionStatus === 'OFFLINE' && surface === 'MASTER_HUB' ? 'The Master Hub can continue accepting bookings while the property reconnects.' : 'Front-desk bookings are created here; website and OTA bookings arrive through the connected feed.'}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div>{offlineLocal && <div className="local-save-callout"><AppGlyph name="offline" size={25} /><span><strong>Device-local reservation</strong><small>Room allocation is provisional until Master Hub synchronization.</small></span></div>}<div className="form-grid"><label className="wide"><span>Guest name</span><input required value={form.guestName} onChange={(event) => setForm({ ...form, guestName:event.target.value })} /></label><label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email:event.target.value })} /></label><label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone:event.target.value })} /></label><label><span>City</span><input value={form.city} onChange={(event) => setForm({ ...form, city:event.target.value })} /></label><label><span>Guests</span><input type="number" min="1" max="12" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount:Number(event.target.value) })} /></label><label><span>Arrival</span><input type="date" value={form.arrivalDate} onChange={(event) => setForm({ ...form, arrivalDate:event.target.value })} /></label><label><span>Departure</span><input type="date" value={form.departureDate} onChange={(event) => setForm({ ...form, departureDate:event.target.value })} /></label><label><span>Room type</span><select value={form.roomType} onChange={(event) => setForm({ ...form, roomType:event.target.value })}>{['Standard','Deluxe','Premium','Suite'].map((item) => <option key={item}>{item}</option>)}</select></label>{productionMode && <><label><span>Children</span><input type="number" min="0" max="20" value={form.children} onChange={(event) => setForm({ ...form, children:Number(event.target.value) })} /></label><label><span>Room</span><select required value={form.roomId} onChange={(event) => { const room = state.rooms.find((item) => String(item.id) === event.target.value); setForm({ ...form, roomId:event.target.value, roomType:String(room?.roomType ?? ''), nightlyRatePaise:Number(room?.baseRatePaise ?? 0) }); }}>{state.rooms.map((room) => <option key={String(room.id)} value={String(room.id)}>Room {String(room.number)} · {String(room.roomType)}</option>)}</select></label><label><span>Nightly rate (paise)</span><input type="number" min="0" value={form.nightlyRatePaise} onChange={(event) => setForm({ ...form, nightlyRatePaise:Number(event.target.value) })} /></label><label><span>Source</span><select value={form.source} onChange={(event) => setForm({ ...form, source:event.target.value })}>{['DIRECT','WALK_IN','PHONE','WEBSITE','OTA','TRAVEL_AGENT','CORPORATE','OTHER'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="wide"><span>Special requests</span><input value={form.specialRequests} onChange={(event) => setForm({ ...form, specialRequests:event.target.value })} /></label><label className="wide"><span>Internal notes</span><input value={form.internalNotes} onChange={(event) => setForm({ ...form, internalNotes:event.target.value })} /></label></>}<label className="wide"><span>Dietary notes</span><input value={form.dietaryRequirements} onChange={(event) => setForm({ ...form, dietaryRequirements:event.target.value })} placeholder="Allergies or dietary preferences" /></label><fieldset className="wide meal-selector"><legend>Meal bookings</legend><div>{mealOptions.map((item) => <button type="button" key={item.value} className={form.mealPlan.includes(item.value) ? 'selected' : ''} onClick={() => toggleMeal(item.value)}><Check size={13} /> {item.label}</button>)}</div></fieldset><label><span>Booking source</span><input value={offlineLocal ? 'OFFLINE WALK-IN' : 'FRONT DESK'} readOnly /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : offlineLocal ? 'Save on this device' : 'Create reservation'}</button></div></form></div>;
}

function StayDrawer({ reservation, state, restricted, surface, productionMode, notify, onClose, onCommand }: { reservation: Row; state: DemoState; restricted: boolean; surface: Surface; productionMode: boolean; notify: (message:string)=>void; onClose: () => void; onCommand: (payload: Row, message: string) => Promise<void> }) {
  const folio = state.folios.find((item) => item.reservationId === reservation.id);
  const lines = state.folioLines.filter((line) => line.folioId === folio?.id);
  const inspection = (state.reservationInspectionSummaries ?? []).find((item) => String(item.reservationId) === String(reservation.id));
  const [charging, setCharging] = useState(false);
  const [history, setHistory] = useState<Row[]>([]);
  useEffect(() => {
    if (!productionMode) return;
    void productionApi(`/api/reservations/${String(reservation.id)}/history`).then((body) => setHistory(body.items as Row[])).catch(() => setHistory([]));
  }, [productionMode, reservation.id]);
  const canReviewDamage = ['OWNER', 'MANAGER'].includes(state.actor.role) && inspection?.damageStatus === 'PENDING_REVIEW' && Number(inspection.damageVersion) > 0;
  return <>
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="stay-drawer">
      <div className="drawer-heading"><div><p className="section-kicker">{String(reservation.reference)}</p><h2>{String(reservation.guestName)}</h2><span>{reservation.roomNumber ? `Room ${String(reservation.roomNumber)}` : 'Provisional room'} · {String(reservation.roomType)}</span></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div>
      <div className="guest-summary"><span className="record-icon large" aria-hidden="true"><AppGlyph name="guest" size={37} /></span><div><strong>{String(reservation.phone ?? 'No phone')}</strong><small>{String(reservation.email ?? 'No email')}</small><small>{String(reservation.preferences ?? 'No preferences')} · {String(reservation.dietaryRequirements ?? 'No dietary notes')}</small></div></div>
      <div className="stay-facts"><span><small>Arrival</small><strong>{shortDate(reservation.arrivalDate)}</strong></span><span><small>Departure</small><strong>{shortDate(reservation.departureDate)}</strong></span><span><small>Duration</small><strong>{calculateStayNights(String(reservation.arrivalDate), String(reservation.departureDate))} nights</strong></span><span><small>Status</small><Status value={String(reservation.status)} /></span></div>
      {(inspection || reservation.status === 'CHECKED_OUT') && <ReservationInspectionCard summary={inspection} reservationStatus={String(reservation.status)} canReview={canReviewDamage} restricted={restricted} onCharge={() => setCharging(true)} onWaive={() => inspection && onCommand({ action: 'RESOLVE_DAMAGE_REPORT', reportId: inspection.damageReportId, expectedVersion: inspection.damageVersion, decision: 'WAIVE', decisionNote: 'No guest charge after manager review.', surface }, `Damage report for room ${reservation.roomNumber} closed without a guest charge.`)} />}
      {Array.isArray(reservation.mealPlan) && reservation.mealPlan.length > 0 && <div className="drawer-meals"><small>Meal bookings</small><span>{(reservation.mealPlan as MealService[]).map((meal) => <i key={meal}>{mealLabel(meal)}</i>)}</span></div>}
      {folio && <section className="drawer-folio"><div className="card-heading"><h3>Guest folio</h3><strong>{money(folio.totalPaise)}</strong></div>{lines.map((line) => <div key={String(line.id)}><span>{String(line.description)}</span><strong>{money(line.lineTotalPaise)}</strong></div>)}<div className="folio-total"><span>Tax</span><strong>{money(folio.taxPaise)}</strong></div><div className="folio-total grand"><span>Total</span><strong>{money(folio.totalPaise)}</strong></div></section>}
      {productionMode && <section className="drawer-folio"><div className="card-heading"><h3>Reservation details</h3><strong>{money(reservation.estimatedTotalPaise)}</strong></div><div><span>Guests</span><strong>{String(reservation.adults ?? 1)} adults · {String(reservation.children ?? 0)} children</strong></div><div><span>Nightly rate</span><strong>{money(reservation.nightlyRatePaise)}</strong></div><div><span>Source</span><strong>{String(reservation.source)}</strong></div><div><span>Special requests</span><strong>{String(reservation.specialRequests ?? 'None')}</strong></div><div><span>Internal notes</span><strong>{String(reservation.internalNotes ?? 'None')}</strong></div></section>}
      {productionMode && history.length > 0 && <section className="drawer-folio"><div className="card-heading"><h3>Activity</h3><strong>{history.length} events</strong></div>{history.map((event) => <div key={String(event.id)}><span>{String(event.eventType).replaceAll('_',' ')}</span><strong>{dateTime(event.createdAt)}</strong></div>)}</section>}
      {productionMode && <ProductionReservationGuests reservationId={String(reservation.id)} notify={notify} />}
      {productionMode && <ProductionReservationActions reservation={reservation} rooms={state.rooms} canRestore={['OWNER','MANAGER'].includes(state.actor.role)} onCommand={onCommand} />}
      {restricted && <div className="offline-form-lock"><AppGlyph name="offline" size={25} /><span><strong>Saved locally</strong><small>Cloud actions will be available after synchronization.</small></span></div>}
      <div className="drawer-actions">{!productionMode && reservation.status === 'CONFIRMED' && !reservation.localOnly && <button className="primary-button" disabled={restricted} title={restricted ? 'Requires Master Hub connection' : undefined} onClick={() => onCommand({ action:'CHECK_IN', reservationId:reservation.id, surface }, `${reservation.guestName} checked in.`)}>Check in</button>}{!productionMode && reservation.status === 'CHECKED_IN' && <><button className="secondary-button" disabled={restricted} title={restricted ? 'Requires Master Hub connection' : undefined} onClick={() => onCommand({ action:'POST_RESTAURANT', reservationId:reservation.id, amountPaise:135000, surface }, 'Room-service charge posted to the current folio.')}>Post ₹1,350 room service</button><button className="primary-button" disabled={restricted} title={restricted ? 'Requires Master Hub connection' : undefined} onClick={() => onCommand({ action:'CHECK_OUT', reservationId:reservation.id, surface }, `${reservation.guestName} checked out; room inspection created.`)}>Check out</button></>}</div>
    </aside></div>
    {charging && inspection && <DamageChargeModal report={inspection} onClose={() => setCharging(false)} onSave={(details) => onCommand({ action: 'RESOLVE_DAMAGE_REPORT', reportId: inspection.damageReportId, expectedVersion: inspection.damageVersion, decision: 'POST_CHARGE', surface, ...details }, `Policy-based damage charge posted for room ${reservation.roomNumber}.`)} />}
  </>;
}

function ProductionReservationActions({ reservation, rooms, canRestore, onCommand }: { reservation: Row; rooms: Row[]; canRestore: boolean; onCommand: (payload: Row, message: string) => Promise<void> }) {
  const status = String(reservation.status);
  const [dialog, setDialog] = useState<'EDIT' | 'DATES' | 'EXTEND_STAY' | 'SHORTEN_STAY' | 'CHANGE_ROOM' | 'UPGRADE_ROOM' | 'CANCEL' | null>(null);
  const [form, setForm] = useState<Row>({});
  const run = (type: string, details: Row = {}) => onCommand({ action: type, type, reservationId: reservation.id, ...details }, `${String(reservation.reference)} updated.`);
  const open = (next: NonNullable<typeof dialog>) => { setForm({ adults: reservation.adults ?? 1, children: reservation.children ?? 0,
    specialRequests: reservation.specialRequests ?? '', internalNotes: reservation.internalNotes ?? '', arrivalDate: reservation.arrivalDate,
    departureDate: reservation.departureDate, roomId: reservation.roomId ?? '', reason: '' }); setDialog(next); };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!dialog) return;
    if (dialog === 'EDIT') await onCommand({ action: 'EDIT_RESERVATION', reservationId: reservation.id, changes: { adults:Number(form.adults), children:Number(form.children), specialRequests:form.specialRequests, internalNotes:form.internalNotes } }, 'Reservation details updated.');
    else if (dialog === 'DATES') await run('CHANGE_DATES', { arrivalDate:form.arrivalDate, departureDate:form.departureDate });
    else if (dialog === 'EXTEND_STAY' || dialog === 'SHORTEN_STAY') await run(dialog, { departureDate:form.departureDate });
    else if (dialog === 'CHANGE_ROOM' || dialog === 'UPGRADE_ROOM') { const room = rooms.find((item) => String(item.id) === String(form.roomId)); if (room) await run(dialog, { roomId:room.id, roomType:room.roomType }); }
    else if (dialog === 'CANCEL') await run('CANCEL', { reason:form.reason });
  }
  return <><div className="drawer-actions">
    {['PENDING','HOLD','CONFIRMED','CHECKED_IN'].includes(status) && <button className="secondary-button" onClick={() => open('EDIT')}>{status === 'CHECKED_IN' ? 'Edit guest count / notes' : 'Edit reservation'}</button>}
    {['PENDING','CONFIRMED'].includes(status) && <button className="secondary-button" onClick={() => open('DATES')}>Change dates</button>}
    {['PENDING','CONFIRMED','CHECKED_IN'].includes(status) && <button className="secondary-button" onClick={() => open('CHANGE_ROOM')}>Change room</button>}
    {['PENDING','CONFIRMED','CHECKED_IN'].includes(status) && <button className="secondary-button" onClick={() => open('UPGRADE_ROOM')}>Upgrade</button>}
    {status === 'CHECKED_IN' && <><button className="secondary-button" onClick={() => open('EXTEND_STAY')}>Extend stay</button><button className="secondary-button" onClick={() => open('SHORTEN_STAY')}>Shorten stay</button></>}
    {['PENDING','CONFIRMED'].includes(status) && <button className="secondary-button" onClick={() => void run('PLACE_HOLD')}>Place hold</button>}
    {status === 'HOLD' && <button className="primary-button" onClick={() => void run('RELEASE_HOLD')}>Release hold</button>}
    {['PENDING','HOLD','CONFIRMED'].includes(status) && <button className="secondary-button" onClick={() => open('CANCEL')}>Cancel</button>}
    {status === 'CONFIRMED' && <><button className="secondary-button" onClick={() => void run('MARK_NO_SHOW')}>Mark no-show</button><button className="primary-button" onClick={() => void run('CHECK_IN')}>Check in</button></>}
    {status === 'CHECKED_IN' && <button className="primary-button" onClick={() => void run('CHECK_OUT')}>Check out</button>}
    {canRestore && ['CANCELLED','NO_SHOW'].includes(status) && <button className="primary-button" onClick={() => void run('RESTORE')}>Restore</button>}
  </div>{dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><form className="modal-card compact-modal" onSubmit={(event) => void submit(event)}><div className="modal-heading"><div><p className="section-kicker">{String(reservation.reference)}</p><h2>{dialog.replaceAll('_', ' ')}</h2></div><button type="button" className="icon-button" onClick={() => setDialog(null)}><X size={17} /></button></div><div className="form-grid">
    {dialog === 'EDIT' && <><label><span>Adults</span><input required type="number" min="1" max="20" value={String(form.adults)} onChange={(event) => setForm({ ...form, adults:event.target.value })} /></label><label><span>Children</span><input required type="number" min="0" max="20" value={String(form.children)} onChange={(event) => setForm({ ...form, children:event.target.value })} /></label><label className="wide"><span>Special requests</span><textarea value={String(form.specialRequests)} onChange={(event) => setForm({ ...form, specialRequests:event.target.value })} /></label><label className="wide"><span>Internal notes</span><textarea value={String(form.internalNotes)} onChange={(event) => setForm({ ...form, internalNotes:event.target.value })} /></label></>}
    {dialog === 'DATES' && <><label><span>Check-in</span><input required type="date" value={String(form.arrivalDate)} onChange={(event) => setForm({ ...form, arrivalDate:event.target.value })} /></label><label><span>Check-out</span><input required type="date" value={String(form.departureDate)} onChange={(event) => setForm({ ...form, departureDate:event.target.value })} /></label></>}
    {(dialog === 'EXTEND_STAY' || dialog === 'SHORTEN_STAY') && <label><span>New check-out</span><input required type="date" value={String(form.departureDate)} onChange={(event) => setForm({ ...form, departureDate:event.target.value })} /></label>}
    {(dialog === 'CHANGE_ROOM' || dialog === 'UPGRADE_ROOM') && <label className="wide"><span>Destination room</span><select required value={String(form.roomId)} onChange={(event) => setForm({ ...form, roomId:event.target.value })}>{rooms.map((room) => <option key={String(room.id)} value={String(room.id)}>Room {String(room.number)} · {String(room.roomType)}</option>)}</select></label>}
    {dialog === 'CANCEL' && <label className="wide"><span>Cancellation reason</span><textarea required minLength={3} maxLength={500} value={String(form.reason)} onChange={(event) => setForm({ ...form, reason:event.target.value })} /></label>}
  </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Back</button><button type="submit" className="primary-button">Save change</button></div></form></div>}</>;
}

function ReservationInspectionCard({ summary, reservationStatus, canReview, restricted, onCharge, onWaive }: { summary?: ReservationInspectionSummary; reservationStatus: string; canReview: boolean; restricted: boolean; onCharge: () => void; onWaive: () => void }) {
  const presentation = inspectionPresentation(summary, reservationStatus);
  const hasDamage = summary?.result === 'DAMAGE_FOUND' || presentation.tone === 'charged' || presentation.tone === 'waived';
  const title = !summary || summary.inspectionStatus === 'PENDING' ? 'Room inspection pending' : summary.inspectionStatus === 'CLEARED' ? 'Cleared by housekeeping' : summary.damageStatus === 'CHARGED' ? 'Damage charge added to folio' : summary.damageStatus === 'WAIVED' ? 'Damage reviewed with no guest charge' : 'Damage found after checkout';
  return <section className={`reservation-inspection-card inspection-card-${presentation.tone}`}>
    <div className="inspection-card-head"><AppGlyph name={presentation.glyph} size={34} /><span><small>Post-checkout room status</small><h3>{title}</h3></span><InspectionStatusBadge summary={summary} reservationStatus={reservationStatus} /></div>
    {!summary && <p>Housekeeping has not completed the checkout inspection yet. The folio remains pending until the room result is recorded.</p>}
    {summary?.inspectionStatus === 'PENDING' && <p>Room {String(summary.roomNumber ?? '')} is waiting for housekeeping inspection before final folio closure.</p>}
    {summary?.inspectionStatus === 'CLEARED' && <p>No damage found. Cleared by {String(summary.completedBy ?? 'Housekeeping')} on {dateTime(summary.completedAt)}.</p>}
    {hasDamage && <><p className="inspection-description">{String(summary?.damageDescription ?? summary?.inspectionNotes ?? 'Damage details recorded by housekeeping.')}</p><div className="inspection-meta"><span><small>Severity</small><Status value={String(summary?.severity ?? 'LOW')} /></span><span><small>Housekeeping update</small><strong>{String(summary?.completedBy ?? summary?.reportedBy ?? 'Housekeeping')}</strong><em>{dateTime(summary?.completedAt ?? summary?.reportedAt)}</em></span></div><div className="inspection-policy-grid"><span><small>Hotel policy</small><strong>{String(summary?.policyLabel ?? 'Damage liability policy')}</strong></span><span><small>Policy liability</small><strong>{money(summary?.policyLiabilityPaise)}</strong></span>{summary?.repairCostPaise != null && <span><small>Repair estimate</small><strong>{money(summary.repairCostPaise)}</strong></span>}<span><small>Decision</small><strong>{summary?.damageStatus === 'CHARGED' ? `Charged ${money(summary.chargeAmountPaise)}` : summary?.damageStatus === 'WAIVED' ? 'No guest charge' : 'Awaiting manager review'}</strong></span></div>{summary?.reviewedBy && <p className="inspection-review-note">Reviewed by {summary.reviewedBy} on {dateTime(summary.reviewedAt)}{summary.decisionNote ? ` · ${summary.decisionNote}` : ''}</p>}</>}
    {canReview && <div className="inspection-actions"><button className="secondary-button" disabled={restricted} onClick={onWaive}>Waive guest charge</button><button className="primary-button" disabled={restricted} onClick={onCharge}><IndianRupee size={14} /> Review policy charge</button></div>}
  </section>;
}

function LoadingView() { return <div className="loading-view"><span /><span /><span /></div>; }
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}
function AvailabilityGrid({ state, onNewBooking, restricted }: { state: DemoState; onNewBooking: () => void; restricted: boolean }) {
  const dates = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'];
  const roomTypes = ['Standard', 'Deluxe', 'Premium', 'Suite'];
  return <section className="availability-card">
    <div className="availability-header"><div><p className="section-kicker">Live room inventory</p><h2>Room availability grid</h2></div><div><span className="availability-range">24–30 Aug</span><button className="compact-button" disabled={restricted} onClick={onNewBooking}><Plus size={14} /> New booking</button></div></div>
    <div className="availability-grid" role="table" aria-label="Room availability by date">
      <div className="availability-label availability-corner" role="columnheader">Room type</div>
      {dates.map((date) => <div className="availability-label date-label" role="columnheader" key={date}><strong>{new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(new Date(`${date}T00:00:00Z`))}</strong><span>{shortDate(date)}</span></div>)}
      {roomTypes.map((roomType) => {
        const total = state.rooms.filter((room) => room.roomType === roomType).length;
        return <div className="availability-row" role="row" key={roomType}>
          <div className="availability-label room-label" role="rowheader"><strong>{roomType}</strong><span>{total} rooms</span></div>
          {dates.map((date) => {
            const occupied = state.reservations.filter((reservation) => reservation.roomType === roomType && ['CONFIRMED','HELD','CHECKED_IN'].includes(String(reservation.status)) && String(reservation.arrivalDate) <= date && String(reservation.departureDate) > date).length;
            const available = Math.max(0, total - occupied);
            const tone = available <= 1 ? 'low' : available <= Math.max(2, Math.round(total / 2)) ? 'medium' : 'high';
            return <button type="button" role="cell" className={`availability-cell ${tone}`} key={date} onClick={onNewBooking} disabled={restricted} aria-label={`${roomType}, ${shortDate(date)}: ${available} of ${total} available`}><strong>{available}/{total}</strong><span>available</span></button>;
          })}
        </div>;
      })}
    </div>
  </section>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <article><small>{label}</small><strong>{value}</strong></article>; }
function MoneyInput({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) { return <label><span>{label}</span><div className="money-input"><b>₹</b><input type="number" min="0" step="1" value={value / 100} disabled={disabled} onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) * 100)))} /></div></label>; }
function Status({ value }: { value: string }) { const normalized=value.toLowerCase().replaceAll(' ','-').replaceAll('_','-').replaceAll('/','-'); return <span className={`status-badge status-${normalized}`}>{value.replaceAll('_',' ')}</span>; }
function inspectionPresentation(summary: ReservationInspectionSummary | undefined, reservationStatus: string) {
  if (!summary) return reservationStatus === 'CHECKED_OUT'
    ? { label: 'Awaiting housekeeping', tone: 'pending', glyph: 'housekeeping' as AppGlyphName }
    : { label: 'Not due', tone: 'neutral', glyph: 'room-ready' as AppGlyphName };
  if (summary.damageStatus === 'CHARGED' || summary.inspectionStatus === 'DAMAGE_CHARGED') return { label: `Damage charged · ${money(summary.chargeAmountPaise)}`, tone: 'charged', glyph: 'charge-receipt' as AppGlyphName };
  if (summary.damageStatus === 'WAIVED' || summary.inspectionStatus === 'DAMAGE_WAIVED') return { label: 'Damage reviewed · no charge', tone: 'waived', glyph: 'waived-charge' as AppGlyphName };
  if (summary.result === 'DAMAGE_FOUND' || ['DAMAGE_REVIEW', 'DAMAGE_REPORTED'].includes(summary.inspectionStatus)) {
    const severity = String(summary.severity ?? 'LOW').toLowerCase();
    return { label: `Damage · ${severity[0].toUpperCase()}${severity.slice(1)}`, tone: severity, glyph: 'damage-alert' as AppGlyphName };
  }
  if (summary.result === 'NO_DAMAGE' || summary.inspectionStatus === 'CLEARED') return { label: 'Housekeeping cleared', tone: 'cleared', glyph: 'room-ready' as AppGlyphName };
  return { label: 'Awaiting housekeeping', tone: 'pending', glyph: 'housekeeping' as AppGlyphName };
}
function InspectionStatusBadge({ summary, reservationStatus }: { summary?: ReservationInspectionSummary; reservationStatus: string }) {
  const presentation = inspectionPresentation(summary, reservationStatus);
  return <span className={`inspection-badge inspection-${presentation.tone}`}><AppGlyph name={presentation.glyph} size={21} /><span>{presentation.label}</span></span>;
}
function SandboxBadge({ value }: { value: string }) { const isSandbox=['OTA','WEBSITE','SANDBOX','AWAITING_API'].some((item) => value.toUpperCase().includes(item)); return <span className={`sandbox-badge ${isSandbox ? '' : 'neutral'}`}>{isSandbox && <i />} {value.replaceAll('_',' ')}</span>; }
function Kpi({ icon, label, value, detail, meta, tone }: { icon: ReactNode; label: string; value: string; detail: string; meta: string; tone: string }) { return <article className="kpi-card"><span className={`kpi-icon ${tone}`}>{icon}</span><div className="kpi-label"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><span className="kpi-trend">{meta}</span></article>; }
function ReservationCompact({ reservation }: { reservation: Row }) { return <div className="arrival-row"><span className="record-icon" aria-hidden="true"><AppGlyph name="arrivals-departures" size={25} /></span><div className="guest-details"><strong>{String(reservation.guestName)}</strong><small>{String(reservation.reference)} · {String(reservation.roomType)}</small></div><div className="room-detail"><small>Room</small><strong>{String(reservation.roomNumber ?? 'TBA')}</strong></div><div className="time-detail"><strong>{shortDate(reservation.arrivalDate)}</strong><Status value={String(reservation.status)} /></div></div>; }
function MiniModule({ icon, title, value, detail, onClick }: { icon: ReactNode; title: string; value: string; detail: string; onClick: () => void }) { return <button className="mini-module" onClick={onClick}><span>{icon}</span><div><small>{title}</small><strong>{value}</strong><p>{detail}</p></div><ArrowRight size={16} /></button>; }
