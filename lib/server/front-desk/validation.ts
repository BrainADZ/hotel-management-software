import { z } from 'zod';
export const idSchema=z.string().uuid();
export const assignRoomSchema=z.object({roomId:idSchema});
export const checkInSchema=z.object({overrideDirty:z.boolean().default(false),earlyCheckInOverride:z.boolean().default(false),stayNotes:z.string().trim().max(2000).optional(),keys:z.array(z.object({keyType:z.enum(['CARD','PHYSICAL']).default('CARD'),keyLabel:z.string().trim().min(1).max(50),quantity:z.number().int().min(1).max(10)})).max(10).default([])});
export const roomMoveSchema=z.object({roomId:idSchema,reason:z.string().trim().min(3).max(500)});
export const lateCheckoutSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('REQUEST'),requestedUntil:z.iso.datetime(),note:z.string().trim().max(500).optional()}),
  z.object({action:z.enum(['APPROVE','REJECT']),note:z.string().trim().min(3).max(500)}),
]);
export const keyIssueSchema=z.object({keyType:z.enum(['CARD','PHYSICAL']).default('CARD'),keyLabel:z.string().trim().min(1).max(50),quantity:z.number().int().min(1).max(10),notes:z.string().trim().max(500).optional()});
export const frontDeskListSchema=z.object({view:z.enum(['arrivals','expected','checked-in','in-house','departures','no-shows']).default('arrivals'),date:z.iso.date().optional(),search:z.string().trim().max(100).optional().default(''),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)});
