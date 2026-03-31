import type { Database } from '../database.types'

type Tables = Database['public']['Tables']

export type EventRow        = Tables['events']['Row']
export type ClubRow         = Tables['clubs']['Row']
export type ProfileRow      = Tables['profiles']['Row']
export type TicketRow       = Tables['tickets']['Row']
export type TicketTierRow   = Tables['ticket_tiers']['Row']
export type SavedEventRow   = Tables['saved_events']['Row']
export type SavedClubRow    = Tables['saved_clubs']['Row']
export type NotificationRow = Tables['notifications']['Row']

// saved_brands no está en database.types.ts todavía (tabla nueva)
export type SavedBrandRow = {
  id: string
  user_id: string
  experience_id: string
  push_enabled: boolean
  created_at: string | null
}

export type SavedBrand = {
  experience_id: string
  name: string
  logo_url: string | null
  banner_url: string | null
  primary_color: string | null
  push_enabled: boolean
}

// Shapes que devuelven las queries con joins frecuentes
export type EventWithTiers = EventRow & {
  ticket_tiers: Pick<TicketTierRow, 'id' | 'name' | 'price' | 'total_stock' | 'sold_tickets'>[]
}

export type TicketWithRelations = TicketRow & {
  events: Pick<EventRow, 'id' | 'title' | 'date' | 'hour' | 'image_url' | 'location'> | null
  ticket_tiers: Pick<TicketTierRow, 'id' | 'name' | 'price'> | null
}
