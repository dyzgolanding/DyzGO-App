-- Permite al comprador cancelar su propia oferta pendiente (SECURITY DEFINER bypass RLS)
CREATE OR REPLACE FUNCTION cancel_resale_offer(p_offer_id UUID, p_buyer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE resale_offers
    SET status = 'cancelled'
    WHERE id = p_offer_id
      AND buyer_id = p_buyer_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Oferta no encontrada o no puedes cancelarla';
    END IF;
END;
$$;

-- Permite al vendedor rechazar una oferta sobre su publicación (SECURITY DEFINER bypass RLS)
CREATE OR REPLACE FUNCTION reject_resale_offer(p_offer_id UUID, p_seller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_listing_id UUID;
BEGIN
    SELECT listing_id INTO v_listing_id
    FROM resale_offers
    WHERE id = p_offer_id;

    IF v_listing_id IS NULL THEN
        RAISE EXCEPTION 'Oferta no encontrada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM resale_listings
        WHERE id = v_listing_id AND seller_id = p_seller_id
    ) THEN
        RAISE EXCEPTION 'No autorizado: no eres el vendedor de este ticket';
    END IF;

    UPDATE resale_offers
    SET status = 'rejected'
    WHERE id = p_offer_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Oferta no encontrada o ya fue procesada';
    END IF;
END;
$$;
