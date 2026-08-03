import { z } from 'zod';

import type {
  RescueModeResponse,
  TripGeneratorResponse,
} from '@/types/database';

const placeCategorySchema = z.enum([
  'attraction',
  'food',
  'shopping',
  'accommodation',
]);

const affiliateTypeSchema = z.enum(['klook', 'kkday', 'agoda', 'none']);

const scheduleItemSchema = z.object({
  time_slot: z.string().min(1),
  place_name: z.string().min(1),
  category: placeCategorySchema,
  estimated_stay_mins: z.number().positive(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reason_to_visit: z.string().min(1),
  suggested_affiliate_type: affiliateTypeSchema,
  affiliate_search_query: z.string(),
});

const itineraryDaySchema = z.object({
  day: z.number().int().positive(),
  theme: z.string().min(1),
  schedule: z.array(scheduleItemSchema).min(1),
});

export const tripGeneratorResponseSchema = z.object({
  trip_title: z.string().min(1),
  destination: z.string().min(1),
  total_days: z.number().int().positive(),
  itinerary: z.array(itineraryDaySchema).min(1),
});

const rescuePlaceSchema = z.object({
  place_name: z.string().min(1),
  category: z.string().min(1),
  distance_meters: z.number().nonnegative(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  why_this_is_a_good_backup: z.string().min(1),
});

export const rescueModeResponseSchema = z.object({
  rescue_status: z.literal('success'),
  issue_handled: z.string().min(1),
  current_location_near: z.string().min(1),
  alternative_places: z.array(rescuePlaceSchema).min(1).max(5),
});

export const generateTripRequestSchema = z.object({
  destination: z.string().min(1).max(120),
  total_days: z.number().int().min(1).max(14),
  preferences: z.array(z.string()).max(8).optional().default([]),
  start_date: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  locale: z.string().optional().default('zh-TW'),
});

export const rescueRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  issue: z.string().min(1).max(500),
  trip_id: z.string().uuid().optional(),
  radius_meters: z.number().int().positive().max(5000).optional().default(1500),
});

export function validateTripGeneratorResponse(
  data: unknown,
): TripGeneratorResponse {
  return tripGeneratorResponseSchema.parse(data);
}

export function validateRescueModeResponse(data: unknown): RescueModeResponse {
  return rescueModeResponseSchema.parse(data) as RescueModeResponse;
}
