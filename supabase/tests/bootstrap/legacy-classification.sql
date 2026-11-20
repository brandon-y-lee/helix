-- The original placeholders lack governed routine facts. Test their actual row
-- values against the current contract without publishing or changing any record.
DO $contract$
DECLARE
  original record;
  refused_count integer := 0;
BEGIN
  FOR original IN SELECT * FROM helix_development_prefix.products LOOP
    IF original.routine_group IS NOT NULL OR original.routine_sort IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected governed values on original placeholder';
    END IF;
    BEGIN
      INSERT INTO public.products
      SELECT (jsonb_populate_record(NULL::public.products, to_jsonb(original))).*;
    EXCEPTION WHEN not_null_violation OR check_violation THEN
      refused_count := refused_count + 1;
    END;
  END LOOP;
  IF refused_count <> 6 THEN
    RAISE EXCEPTION 'The six original records must be assessed individually before exposure';
  END IF;
END
$contract$;
