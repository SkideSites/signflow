-- Fix: "permission denied for function generate_invite_code"
-- Root cause: the BEFORE INSERT trigger on public.workspaces calls
-- public.generate_invite_code() as the invoking (authenticated) user, but
-- EXECUTE on that function is not granted to authenticated. Make the
-- trigger function SECURITY DEFINER so it calls generate_invite_code as
-- the function owner, and lock down direct client access to both.

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  code text;
  attempts int := 0;
BEGIN
  LOOP
    code := upper(translate(substr(gen_random_uuid()::text, 1, 8), '-', ''));
    code := substr(code, 1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workspaces WHERE invite_code = code);
    attempts := attempts + 1;
    IF attempts > 8 THEN code := code || (floor(random()*100))::int::text; EXIT; END IF;
  END LOOP;
  RETURN code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_invite_code_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := public.generate_invite_code();
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists on workspaces
DROP TRIGGER IF EXISTS trg_set_invite_code_on_insert ON public.workspaces;
CREATE TRIGGER trg_set_invite_code_on_insert
BEFORE INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.set_invite_code_on_insert();

-- Lock down direct EXECUTE. The trigger runs as function owner and does
-- not need role-level EXECUTE grants; keep clients out.
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_invite_code_on_insert() FROM PUBLIC, anon, authenticated;
