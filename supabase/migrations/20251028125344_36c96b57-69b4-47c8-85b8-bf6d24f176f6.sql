-- Add order_details column to disputes table to store additional information provided by customer
ALTER TABLE public.disputes
ADD COLUMN order_details TEXT;