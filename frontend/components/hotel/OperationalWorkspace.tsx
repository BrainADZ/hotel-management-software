'use client';

import { useState } from 'react';
import { roleCan, type Permission } from '@hotel/shared/domain';
import {
  type PlatformViewProps,
  type Row,
  PageHeading,
  Status,
  money,
} from '@/app/hotel-platform';

type Field = {
  key: string;
  label: string;
  type?: 'number' | 'email' | 'password' | 'time' | 'date' | 'checkbox';
  options?: Array<{
    value: string;
    label: string;
  }>;
  required?: boolean;
  min?: number;
};

type Config = {
  title: string;
  description: string;
  rows: Row[];
  columns: Array<[string, string]>;
  permission: Permission;
  action: string;
  fields: Field[];
  createLabel: string;
  editable?: boolean;
  initial?: Row;

  rowAction?: {
    label: string;
    action: string;
    show: (row: Row) => boolean;
    fields?: Field[];
    values?: (row: Row) => Row;
  };
};

const select = (
  key: string,
  label: string,
  rows: Row[],
  name: string,
): Field => ({
  key,
  label,
  options: rows.map((row) => ({
    value: String(row.id),
    label: String(row[name] ?? row.id),
  })),
});

const choices = (
  key: string,
  label: string,
  values: string[],
): Field => ({
  key,
  label,
  options: values.map((value) => ({
    value,
    label: value.replaceAll('_', ' '),
  })),
});

export function WorkflowForm({
  title,
  fields,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  fields: Field[];
  initial: Row;
  onSave: (values: Row) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Row>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        initial[field.key] ?? (field.type === 'checkbox' ? true : ''),
      ]),
    ),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setBusy(true);
    setError('');

    try {
      const parsed: Row = {
        ...values,
      };

      for (const field of fields) {
        if (field.type === 'number') {
          parsed[field.key] = Number(values[field.key]);
        }

        if (
          field.required === false &&
          values[field.key] === ''
        ) {
          delete parsed[field.key];
        }
      }

      await onSave(parsed);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-card compact-modal"
        onSubmit={handleSubmit}
      >
        <div className="modal-heading">
          <h2>{title}</h2>

          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="error-banner"
          >
            {error}
          </p>
        )}

        <div className="form-grid">
          {fields.map((field) => (
            <label
              className="wide"
              key={field.key}
            >
              <span>{field.label}</span>

              {field.options ? (
                <select
                  required={field.required !== false}
                  value={String(values[field.key] ?? '')}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [field.key]: event.target.value,
                    })
                  }
                >
                  <option value="">
                    Select {field.label.toLowerCase()}
                  </option>

                  {field.options.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[field.key])}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [field.key]: event.target.checked,
                    })
                  }
                />
              ) : (
                <input
                  type={field.type ?? 'text'}
                  required={field.required !== false}
                  min={
                    field.type === 'number'
                      ? field.min ?? 0
                      : undefined
                  }
                  step={
                    field.type === 'number'
                      ? 1
                      : undefined
                  }
                  autoComplete={
                    field.type === 'password'
                      ? 'new-password'
                      : undefined
                  }
                  value={String(values[field.key] ?? '')}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [field.key]: event.target.value,
                    })
                  }
                />
              )}
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function OperationalWorkspace(
  props: PlatformViewProps,
) {
  const {
    state,
    view,
    role,
    command,
    refresh,
    notify,
  } = props;

  const data = state.operationalData ?? {};

  const rows = (key: string) =>
    (data[key] as Row[] | undefined) ?? [];

  const [dialog, setDialog] = useState<{
    row: Row;
    action: string;
    fields: Field[];
    title: string;
  } | null>(null);

  const rooms = state.rooms;
  const menu = rows('menuItems');
  const stays = rows('serviceStays');

  const configs: Partial<Record<string, Config>> = {
    'Menu Management': {
      title: 'Menu management',
      description:
        'Available items and prices used by restaurant and room-service orders.',
      rows: menu,
      columns: [
        ['name', 'Item'],
        ['category', 'Category'],
        ['pricePaise', 'Price'],
        ['available', 'Available'],
      ],
      permission: 'restaurant.manage',
      action: 'SAVE_MENU_ITEM',
      createLabel: 'Add menu item',
      editable: true,
      fields: [
        {
          key: 'name',
          label: 'Item name',
        },
        {
          key: 'category',
          label: 'Category',
        },
        {
          key: 'pricePaise',
          label: 'Price (paise)',
          type: 'number',
          min: 1,
        },
        {
          key: 'available',
          label: 'Available',
          type: 'checkbox',
        },
      ],
    },

    'Lost & Found': {
      title: 'Lost & found',
      description:
        'Persistent custody register with an audit trail for every release.',
      rows: rows('lostFound'),
      columns: [
        ['description', 'Item'],
        ['location', 'Found at'],
        ['custody', 'Custody'],
        ['status', 'Status'],
      ],
      permission: 'lostfound.manage',
      action: 'RECORD_LOST_ITEM',
      createLabel: 'Record item',
      fields: [
        {
          key: 'description',
          label: 'Item description',
        },
        {
          key: 'location',
          label: 'Found at',
        },
        {
          key: 'custody',
          label: 'Custody / storage location',
        },
      ],
      rowAction: {
        label: 'Release item',
        action: 'RELEASE_LOST_ITEM',
        show: (row) => row.status !== 'RELEASED',
        fields: [
          {
            key: 'custody',
            label: 'Released to / receipt reference',
          },
        ],
      },
    },

    Maintenance: {
      title: 'Maintenance tickets',
      description:
        'Open issues block rooms from service. Resolved rooms return to housekeeping for cleaning.',
      rows: state.maintenance.map((row) => ({
        ...row,
        roomNumber:
          rooms.find(
            (room) => room.id === row.roomId,
          )?.number ?? 'General',
      })),
      columns: [
        ['roomNumber', 'Room'],
        ['issue', 'Issue'],
        ['severity', 'Severity'],
        ['status', 'Status'],
      ],
      permission: 'maintenance.manage',
      action: 'CREATE_MAINTENANCE',
      createLabel: 'Report maintenance',
      fields: [
        select(
          'roomId',
          'Room',
          rooms,
          'number',
        ),
        {
          key: 'issue',
          label: 'Issue',
        },
        {
          key: 'category',
          label: 'Category',
        },
        choices(
          'severity',
          'Severity',
          ['LOW', 'MEDIUM', 'HIGH'],
        ),
      ],
      rowAction: {
        label: 'Resolve ticket',
        action: 'RESOLVE_MAINTENANCE',
        show: (row) =>
          !['RESOLVED', 'CLOSED'].includes(
            String(row.status),
          ),
      },
    },

    'Inventory Movements': {
      title: 'Inventory movements',
      description:
        'Record receipts and issues with quantity checks and running balances.',
      rows: rows('inventoryMovements'),
      columns: [
        ['itemName', 'Item'],
        ['delta', 'Change'],
        ['balance', 'Balance'],
        ['reason', 'Reason'],
        ['actorName', 'Recorded by'],
        ['createdAt', 'Date'],
      ],
      permission: 'inventory.write',
      action: 'MOVE_STOCK',
      createLabel: 'Record movement',
      fields: [
        select(
          'itemId',
          'Stock item',
          state.inventory,
          'name',
        ),
        {
          key: 'delta',
          label:
            'Quantity change (negative for issue)',
          type: 'number',
          min: -1000000,
        },
        {
          key: 'reason',
          label: 'Reason',
        },
      ],
    },

    'Room Types & Rates': {
      title: 'Rooms, types & rates',
      description:
        'Manage room inventory and rates used for new reservations. Existing booked rates remain on each stay.',
      rows: rooms,
      columns: [
        ['number', 'Room'],
        ['roomType', 'Type'],
        ['floor', 'Floor'],
        ['baseRatePaise', 'Base rate'],
        ['operationalStatus', 'Status'],
      ],
      permission: 'rooms.manage',
      action: 'SAVE_ROOM',
      createLabel: 'Add room',
      editable: true,
      fields: [
        {
          key: 'number',
          label: 'Room number',
        },
        {
          key: 'roomType',
          label: 'Room type',
        },
        {
          key: 'floor',
          label: 'Floor',
          type: 'number',
        },
        {
          key: 'baseRatePaise',
          label: 'Nightly rate (paise)',
          type: 'number',
        },
      ],
    },

    'Users & Permissions': {
      title: 'Users & permissions',
      description:
        'Owner-managed staff accounts for this property. Role changes revoke existing sessions.',
      rows: rows('staff'),
      columns: [
        ['name', 'Name'],
        ['email', 'Email'],
        ['role', 'Role'],
        ['active', 'Active'],
      ],
      permission: 'staff.manage',
      action: 'SAVE_STAFF',
      createLabel: 'Add staff member',
      editable: true,
      fields: [
        {
          key: 'name',
          label: 'Name',
        },
        {
          key: 'email',
          label: 'Email',
          type: 'email',
        },
        choices(
          'role',
          'Role',
          [
            'MANAGER',
            'RECEPTION',
            'HOUSEKEEPING',
            'RESTAURANT',
            'ACCOUNTS',
            'REPORTING',
            'TRAVEL_AGENT',
            'TOUR_MANAGER',
          ],
        ),
        {
          key: 'active',
          label: 'Active',
          type: 'checkbox',
        },
        {
          key: 'password',
          label:
            'Initial password / new password (leave blank to keep)',
          type: 'password',
          required: false,
        },
      ],
    },

    'Properties & Settings': {
      title: 'Property settings',
      description:
        'Persisted operating times and default tax settings for this property.',
      rows: data.propertySettings
        ? [data.propertySettings as Row]
        : [],
      columns: [
        ['name', 'Property'],
        ['city', 'City'],
        ['checkInTime', 'Check-in'],
        ['checkOutTime', 'Check-out'],
        [
          'defaultTaxRateBps',
          'Tax (basis points)',
        ],
      ],
      permission: 'property.manage',
      action: 'SAVE_PROPERTY',
      createLabel: '',
      editable: true,
      fields: [
        {
          key: 'name',
          label: 'Property name',
        },
        {
          key: 'city',
          label: 'City',
        },
        {
          key: 'checkInTime',
          label: 'Check-in time',
          type: 'time',
        },
        {
          key: 'checkOutTime',
          label: 'Check-out time',
          type: 'time',
        },
        {
          key: 'defaultTaxRateBps',
          label:
            'Default tax (basis points; 1800 = 18%)',
          type: 'number',
        },
      ],
    },

    'Restaurant Orders': {
      title: 'Restaurant orders',
      description:
        'Orders post once to an active guest folio using current menu prices and property taxes.',
      rows: state.restaurantOrders,
      columns: [
        ['roomNumber', 'Room'],
        ['orderType', 'Type'],
        ['totalPaise', 'Total'],
        ['status', 'Status'],
        ['paymentStatus', 'Payment'],
      ],
      permission: 'restaurant.manage',
      action: 'CREATE_RESTAURANT_ORDER',
      createLabel: 'Create order',
      fields: [
        select(
          'reservationId',
          'Checked-in stay',
          stays,
          'label',
        ),
        select(
          'menuItemId',
          'Menu item',
          menu.filter((row) => row.available),
          'name',
        ),
        {
          key: 'quantity',
          label: 'Quantity',
          type: 'number',
          min: 1,
        },
        choices(
          'orderType',
          'Order type',
          ['RESTAURANT', 'ROOM_SERVICE'],
        ),
      ],
      rowAction: {
        label: 'Advance order',
        action: 'UPDATE_RESTAURANT_ORDER',
        show: (row) =>
          [
            'PENDING',
            'PREPARING',
            'READY',
          ].includes(String(row.status)),
        values: (row) => ({
          status: (
            {
              PENDING: 'PREPARING',
              PREPARING: 'READY',
              READY: 'DELIVERED',
            } as Record<string, string>
          )[String(row.status)],
        }),
      },
    },

    'Meal Service': {
      title: 'Meal service',
      description:
        'Meal entitlements and service records linked to active stays.',
      rows: state.restaurantMealBookings.map(
        (row) => ({
          ...row,
          bookingReference:
            stays.find(
              (stay) =>
                stay.id === row.reservationId,
            )?.label ?? row.reservationId,
        }),
      ),
      columns: [
        ['bookingReference', 'Stay'],
        ['serviceDate', 'Date'],
        ['mealPeriod', 'Meal'],
        ['guestCount', 'Covers'],
        ['status', 'Status'],
      ],
      permission: 'restaurant.manage',
      action: 'BOOK_MEAL',
      createLabel: 'Book meal',
      fields: [
        select(
          'reservationId',
          'Stay',
          stays,
          'label',
        ),
        {
          key: 'serviceDate',
          label: 'Service date',
          type: 'date',
        },
        choices(
          'mealPeriod',
          'Meal',
          [
            'BREAKFAST',
            'BRUNCH',
            'LUNCH',
            'HIGH_TEA',
            'DINNER',
            'SUPPER',
          ],
        ),
        {
          key: 'guestCount',
          label: 'Covers',
          type: 'number',
          min: 1,
        },
        {
          key: 'dietaryNotes',
          label: 'Dietary notes',
          required: false,
        },
      ],
      rowAction: {
        label: 'Mark served',
        action: 'SERVE_MEAL',
        show: (row) =>
          row.status === 'BOOKED',
      },
    },
  };

  if (view === 'Room Service') {
    configs[view] = {
      ...configs['Restaurant Orders']!,
      title: 'Room service',
      rows: state.restaurantOrders.filter(
        (row) =>
          row.orderType === 'ROOM_SERVICE',
      ),
      initial: {
        orderType: 'ROOM_SERVICE',
      },
    };
  }

  const config = configs[view];

  if (!config) {
    return null;
  }

  const canEdit = roleCan(
    role,
    config.permission,
  );

  const online =
    state.property.connectionStatus !==
      'OFFLINE' &&
    (typeof navigator === 'undefined' ||
      navigator.onLine);

  const open = (
    row: Row = {},
    action = config.action,
    fields = config.fields,
    title = config.createLabel,
  ) => {
    setDialog({
      row,
      action,
      fields,
      title:
        title ||
        `Edit ${config.title.toLowerCase()}`,
    });
  };

  return (
    <>
      <PageHeading
        eyebrow="Hotel operations"
        title={config.title}
        description={config.description}
        actions={
          canEdit && config.createLabel ? (
            <button
              className="primary-button"
              disabled={!online}
              title={
                !online
                  ? 'Requires an online connection.'
                  : undefined
              }
              onClick={() =>
                open({
                  ...config.initial,
                  clientOperationId:
                    crypto.randomUUID(),
                })
              }
            >
              {config.createLabel}
            </button>
          ) : undefined
        }
      />

      {!canEdit &&
      config.rows.length === 0 ? (
        <p className="empty-state">
          Your role does not have access to
          these records.
        </p>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                {config.columns.map(
                  ([key, label]) => (
                    <th key={key}>
                      {label}
                    </th>
                  ),
                )}

                {canEdit && (
                  <th>Actions</th>
                )}
              </tr>
            </thead>

            <tbody>
              {config.rows.map(
                (row, index) => (
                  <tr
                    key={String(
                      row.id ?? index,
                    )}
                  >
                    {config.columns.map(
                      ([key]) => (
                        <td key={key}>
                          {key.endsWith(
                            'Paise',
                          ) ? (
                            money(row[key])
                          ) : key ===
                              'status' ||
                            key ===
                              'operationalStatus' ? (
                            <Status
                              value={String(
                                row[key],
                              )}
                            />
                          ) : typeof row[
                              key
                            ] ===
                            'boolean' ? (
                            row[key] ? (
                              'Yes'
                            ) : (
                              'No'
                            )
                          ) : (
                            String(
                              row[key] ??
                                '—',
                            )
                          )}
                        </td>
                      ),
                    )}

                    {canEdit && (
                      <td>
                        {config.editable &&
                          row.role !==
                            'OWNER' && (
                            <button
                              className="text-button"
                              disabled={
                                !online
                              }
                              onClick={() =>
                                open(
                                  row,
                                  config.action,
                                  config.fields,
                                  'Edit record',
                                )
                              }
                            >
                              Edit
                            </button>
                          )}

                        {config.rowAction?.show(
                          row,
                        ) && (
                          <button
                            className="text-button"
                            disabled={!online}
                            onClick={() =>
                              open(
                                {
                                  ...row,
                                  ...config.rowAction?.values?.(
                                    row,
                                  ),
                                },
                                config
                                  .rowAction!
                                  .action,
                                config
                                  .rowAction!
                                  .fields ??
                                  [],
                                config
                                  .rowAction!
                                  .label,
                              )
                            }
                          >
                            {
                              config
                                .rowAction
                                .label
                            }
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {config.rows.length === 0 && (
            <div className="empty-state">
              No records yet.
            </div>
          )}
        </div>
      )}

      {dialog && (
        <WorkflowForm
          key={`${dialog.action}:${String(
            dialog.row.id ?? 'new',
          )}`}
          title={dialog.title}
          fields={dialog.fields}
          initial={dialog.row}
          onClose={() =>
            setDialog(null)
          }
          onSave={async (values) => {
            if (!online) {
              throw new Error(
                'Requires an online connection.',
              );
            }

            const item =
              state.inventory.find(
                (inventoryItem) =>
                  inventoryItem.id ===
                  values.itemId,
              );

            await command({
              ...dialog.row,
              ...values,
              action: dialog.action,
              expectedVersion:
                dialog.row.version,
              expectedUpdatedAt:
                item?.updatedAt ??
                dialog.row.updatedAt,
            });

            await refresh();

            setDialog(null);

            notify(
              'Saved successfully.',
            );
          }}
        />
      )}
    </>
  );
}

export function CreateHousekeepingTask(
  props: PlatformViewProps,
) {
  const [open, setOpen] =
    useState(false);

  if (
    !props.productionMode ||
    !roleCan(
      props.role,
      'housekeeping.assign',
    )
  ) {
    return null;
  }

  return (
    <>
      <button
        className="secondary-button"
        onClick={() => setOpen(true)}
      >
        Create room task
      </button>

      {open && (
        <WorkflowForm
          title="Create housekeeping task"
          fields={[
            select(
              'roomId',
              'Room',
              props.state.rooms,
              'number',
            ),
            choices(
              'taskType',
              'Task type',
              [
                'STAY_SERVICE',
                'CHECKOUT_CLEANING',
              ],
            ),
            choices(
              'priority',
              'Priority',
              ['NORMAL', 'HIGH'],
            ),
            {
              key: 'notes',
              label: 'Notes',
              required: false,
            },
          ]}
          initial={{
            priority: 'NORMAL',
          }}
          onClose={() =>
            setOpen(false)
          }
          onSave={async (values) => {
            await props.command({
              ...values,
              action:
                'CREATE_HOUSEKEEPING_TASK',
            });

            await props.refresh();

            setOpen(false);

            props.notify(
              'Room task created.',
            );
          }}
        />
      )}
    </>
  );
}