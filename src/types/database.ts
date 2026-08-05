/**
 * Database & AI response TypeScript definitions
 * Aligned with:
 * - supabase/migrations/20260803100000_create_core_tables.sql
 * - PROJECT_PLAN.md System Prompt JSON schemas
 */

// =============================================================================
// Enums / union literals (mirror Postgres enums)
// =============================================================================

export type SubscriptionTier = 'free' | 'pro';

export type TripStatus = 'draft' | 'generating' | 'ready' | 'archived';

/** Place category from Trip Generator System Prompt */
export type PlaceCategory =
  | 'attraction'
  | 'food'
  | 'shopping'
  | 'accommodation';

/** Affiliate partner type from System Prompt */
export type AffiliateType = 'klook' | 'kkday' | 'agoda' | 'none';

/** Preference tags used by the search form */
export type TravelPreference =
  | 'food'
  | 'photo'
  | 'outdoor'
  | 'family'
  | string;

export type AffiliateEventType = 'impression' | 'click' | 'conversion';

/** Deep personalization profile from SearchForm */
export type TravelPace = 'relaxed' | 'balanced' | 'packed';
export type TravelCompanion =
  | 'solo'
  | 'couple'
  | 'family_kids'
  | 'with_elders';
export type TravelBudget = 'budget' | 'comfort' | 'luxury';
export type TravelTransport =
  | 'transit'
  | 'driving'
  | 'taxi'
  | 'walking';
export type DietaryPreference =
  | 'vegetarian'
  | 'no_beef'
  | 'local_snacks'
  | 'famous_queues';

export interface UserTravelProfile {
  pace: TravelPace;
  companions: TravelCompanion;
  budget: TravelBudget;
  transport: TravelTransport;
  dietary: DietaryPreference[];
}

export interface DestinationEssentials {
  currency_code: string;
  currency_name: string;
  fx_note: string;
  plug_type: string;
  emergency_numbers: {
    police: string;
    ambulance: string;
    notes?: string;
  };
}

export type TravelMode = 'walking' | 'transit' | 'driving';

/** UI mode for PathRescue 2.0 */
export type AppTripMode = 'planning' | 'ontrip';

/** Visit progress on a schedule slot */
export type ScheduleItemStatus = 'pending' | 'done' | 'skipped';

/** Trust / verification badge for a place */
export type PlaceTrustLevel = 'verified' | 'name_only' | 'time_risk';

// =============================================================================
// AI System Prompt JSON structures
// =============================================================================

/**
 * Single schedule item inside a day's itinerary.
 * Matches TRIP_GENERATOR_SYSTEM_PROMPT JSON RESPONSE SCHEMA.
 */
export interface ScheduleItem {
  /** e.g. '09:00 - 11:30' */
  time_slot: string;
  /** Official location name for Google Maps / Places search */
  place_name: string;
  category: PlaceCategory;
  estimated_stay_mins: number;
  /** Approximate latitude from LLM (refined later by Places API) */
  latitude: number;
  /** Approximate longitude from LLM (refined later by Places API) */
  longitude: number;
  /** Short, engaging summary */
  reason_to_visit: string;
  suggested_affiliate_type: AffiliateType;
  /** Search query for tickets / tours / hotels */
  affiliate_search_query: string;

  // --- Enriched by Map Services (Phase 3); optional at AI generation time ---
  /** Google Places Place ID after verification */
  place_id?: string | null;
  /** Primary photo URL from Places Photos */
  photo_url?: string | null;
  /** Formatted opening hours text from Places API */
  opening_hours?: string | null;
  /** Travel time in minutes from previous stop (Directions API) */
  travel_from_prev_mins?: number | null;
  /** Encoded polyline or summary from Directions API */
  route_summary?: string | null;
  /** Fallback Google Maps keyword search when Places lookup fails */
  maps_search_url?: string | null;
  /** True when data is served from LocalStorage cache */
  from_cache?: boolean;
  /** Soft lock — AI regen should not overwrite */
  locked?: boolean;
  /** On-trip check-in status */
  status?: ScheduleItemStatus;
  /** Places verification / risk badge */
  trust?: PlaceTrustLevel;
}

/**
 * One day inside the AI-generated itinerary array.
 */
export interface ItineraryDay {
  day: number;
  /** e.g. 'Shinjuku & Shibuya Exploration' */
  theme: string;
  schedule: ScheduleItem[];
}

/**
 * Full Trip Generator LLM response.
 * Matches TRIP_GENERATOR_SYSTEM_PROMPT JSON RESPONSE SCHEMA.
 */
export interface TripGeneratorResponse {
  /** e.g. 'Tokyo 3-Day Culture & Food Tour' */
  trip_title: string;
  destination: string;
  total_days: number;
  /** Trip start date YYYY-MM-DD — drives On-trip mode */
  start_date?: string | null;
  itinerary: ItineraryDay[];
  /** Practical destination essentials for travelers */
  destination_essentials?: DestinationEssentials;
  /** Echo of personalization used for generation */
  user_profile?: UserTravelProfile;
}

/**
 * Single alternative place from Rescue Mode.
 * Matches RESCUE_MODE_SYSTEM_PROMPT JSON RESPONSE SCHEMA.
 */
export interface RescueAlternativePlace {
  place_name: string;
  category: string;
  distance_meters: number;
  latitude: number;
  longitude: number;
  why_this_is_a_good_backup: string;

  // --- Optional enrichment ---
  place_id?: string | null;
  photo_url?: string | null;
  suggested_affiliate_type?: AffiliateType;
  affiliate_search_query?: string;
}

/**
 * Full Rescue Mode LLM response.
 * Matches RESCUE_MODE_SYSTEM_PROMPT JSON RESPONSE SCHEMA.
 */
export interface RescueModeResponse {
  rescue_status: 'success';
  /** e.g. 'Rainy Weather Backup' */
  issue_handled: string;
  current_location_near: string;
  alternative_places: RescueAlternativePlace[];
}

// =============================================================================
// Database row types (public schema)
// =============================================================================

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  request_count: number;
  request_count_reset_at: string;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface UserInsert {
  id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  subscription_tier?: SubscriptionTier;
  request_count?: number;
  request_count_reset_at?: string;
  locale?: string;
}

export interface UserUpdate {
  email?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  subscription_tier?: SubscriptionTier;
  request_count?: number;
  request_count_reset_at?: string;
  locale?: string;
}

export interface Trip {
  id: string;
  user_id: string | null;
  trip_title: string;
  destination: string;
  total_days: number;
  preferences: TravelPreference[];
  status: TripStatus;
  /** Full TripGeneratorResponse JSON stored for replay / export */
  generated_payload: TripGeneratorResponse | null;
  start_date: string | null;
  notes: string | null;
  /** When true, trip is readable via /share/[tripId] */
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface TripInsert {
  id?: string;
  user_id?: string | null;
  trip_title: string;
  destination: string;
  total_days: number;
  preferences?: TravelPreference[];
  status?: TripStatus;
  generated_payload?: TripGeneratorResponse | null;
  start_date?: string | null;
  notes?: string | null;
  is_public?: boolean;
}

export interface TripUpdate {
  trip_title?: string;
  destination?: string;
  total_days?: number;
  preferences?: TravelPreference[];
  status?: TripStatus;
  generated_payload?: TripGeneratorResponse | null;
  start_date?: string | null;
  notes?: string | null;
  is_public?: boolean;
  user_id?: string | null;
}

/** Public share payload returned by GET /api/trips/[tripId] */
export interface PublicTripView {
  id: string;
  trip_title: string;
  destination: string;
  total_days: number;
  preferences: TravelPreference[];
  is_public: boolean;
  generated_payload: TripGeneratorResponse;
  created_at: string;
}

/**
 * DB row for public.itineraries — one day per row.
 * `schedule` is ScheduleItem[] as JSONB.
 */
export interface Itinerary {
  id: string;
  trip_id: string;
  day: number;
  theme: string;
  schedule: ScheduleItem[];
  created_at: string;
  updated_at: string;
}

export interface ItineraryInsert {
  id?: string;
  trip_id: string;
  day: number;
  theme: string;
  schedule?: ScheduleItem[];
}

export interface ItineraryUpdate {
  day?: number;
  theme?: string;
  schedule?: ScheduleItem[];
}

export interface AffiliateLog {
  id: string;
  user_id: string | null;
  trip_id: string | null;
  place_name: string;
  affiliate_type: AffiliateType;
  affiliate_url: string;
  search_query: string | null;
  event_type: AffiliateEventType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AffiliateLogInsert {
  id?: string;
  user_id?: string | null;
  trip_id?: string | null;
  place_name: string;
  affiliate_type: AffiliateType;
  affiliate_url: string;
  search_query?: string | null;
  event_type?: AffiliateEventType;
  metadata?: Record<string, unknown>;
}

export interface AffiliateLogUpdate {
  place_name?: string;
  affiliate_type?: AffiliateType;
  affiliate_url?: string;
  search_query?: string | null;
  event_type?: AffiliateEventType;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Relational / composed types for application use
// =============================================================================

/** Trip with nested day itineraries (joined query result) */
export interface TripWithItineraries extends Trip {
  itineraries: Itinerary[];
}

/** Request body for POST /api/generate-trip */
export interface GenerateTripRequest {
  destination: string;
  total_days: number;
  preferences?: TravelPreference[];
  start_date?: string | null;
  notes?: string | null;
  /** Optional locale hint for AI copy */
  locale?: string;
}

/** Request body for POST /api/rescue */
export interface RescueRequest {
  latitude: number;
  longitude: number;
  issue: string;
  /** Optional trip context */
  trip_id?: string;
  /** Radius in meters; System Prompt default is 1500 */
  radius_meters?: number;
}

// =============================================================================
// Supabase generated-style Database interface
// Compatible with @supabase/supabase-js createClient<Database>()
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Supabase JSONB-friendly row shapes (avoid custom object types that break client inference) */
type TripRow = Omit<Trip, 'generated_payload' | 'preferences'> & {
  preferences: string[];
  generated_payload: Json | null;
};

type TripInsertRow = Omit<TripInsert, 'generated_payload' | 'preferences'> & {
  preferences?: string[];
  generated_payload?: Json | null;
};

type TripUpdateRow = Omit<TripUpdate, 'generated_payload' | 'preferences'> & {
  preferences?: string[];
  generated_payload?: Json | null;
};

type ItineraryRow = Omit<Itinerary, 'schedule'> & {
  schedule: Json;
};

type ItineraryInsertRow = Omit<ItineraryInsert, 'schedule'> & {
  schedule?: Json;
};

type ItineraryUpdateRow = Omit<ItineraryUpdate, 'schedule'> & {
  schedule?: Json;
};

type AffiliateLogRow = Omit<AffiliateLog, 'metadata'> & {
  metadata: Json;
};

type AffiliateLogInsertRow = Omit<AffiliateLogInsert, 'metadata'> & {
  metadata?: Json;
};

type AffiliateLogUpdateRow = Omit<AffiliateLogUpdate, 'metadata'> & {
  metadata?: Json;
};

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: UserInsert;
        Update: UserUpdate;
        Relationships: [];
      };
      trips: {
        Row: TripRow;
        Insert: TripInsertRow;
        Update: TripUpdateRow;
        Relationships: [
          {
            foreignKeyName: 'trips_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      itineraries: {
        Row: ItineraryRow;
        Insert: ItineraryInsertRow;
        Update: ItineraryUpdateRow;
        Relationships: [
          {
            foreignKeyName: 'itineraries_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      affiliate_logs: {
        Row: AffiliateLogRow;
        Insert: AffiliateLogInsertRow;
        Update: AffiliateLogUpdateRow;
        Relationships: [
          {
            foreignKeyName: 'affiliate_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'affiliate_logs_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      subscription_tier: SubscriptionTier;
      trip_status: TripStatus;
      place_category: PlaceCategory;
      affiliate_type: AffiliateType;
    };
    CompositeTypes: Record<string, never>;
  };
}
