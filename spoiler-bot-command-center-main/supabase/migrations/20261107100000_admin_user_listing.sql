CREATE OR REPLACE FUNCTION public.admin_list_users(
  _query text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  confirmed boolean,
  created_at timestamptz,
  display_name text,
  username text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH filtered_users AS (
    SELECT
      u.id,
      u.email::text AS email,
      (u.email_confirmed_at IS NOT NULL) AS confirmed,
      u.created_at,
      p.display_name,
      p.username
    FROM auth.users AS u
    LEFT JOIN public.profiles AS p ON p.id = u.id
    WHERE NULLIF(trim(_query), '') IS NULL
      OR lower(COALESCE(u.email, '')) LIKE '%' || lower(trim(_query)) || '%'
      OR u.id::text LIKE '%' || trim(_query) || '%'
      OR lower(COALESCE(p.display_name, '')) LIKE '%' || lower(trim(_query)) || '%'
      OR lower(COALESCE(p.username, '')) LIKE '%' || lower(trim(_query)) || '%'
  )
  SELECT
    filtered_users.id,
    filtered_users.email,
    filtered_users.confirmed,
    filtered_users.created_at,
    filtered_users.display_name,
    filtered_users.username,
    count(*) OVER () AS total_count
  FROM filtered_users
  ORDER BY filtered_users.created_at DESC, filtered_users.id
  LIMIT LEAST(GREATEST(_limit, 1), 100)
  OFFSET GREATEST(_offset, 0);
$$;
REVOKE ALL ON FUNCTION public.admin_list_users(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer, integer) TO service_role;
