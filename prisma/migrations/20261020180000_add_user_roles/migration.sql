-- 20261020180000_add_user_roles
-- Additive: persisted User.role (OWNER | ADMIN | MEMBER, default MEMBER)
-- alongside User.passwordVersion.
--
-- Step 1 verifies any pre-existing "UserRole" type and "User"."role" column
-- BEFORE any DDL runs, so an incompatible database is left unchanged.
-- Step 2 creates only what is missing. Re-running on a compatible database
-- is a no-op.
--
-- An incompatible shape fails closed, for example an enum carrying a USER
-- label or a USER default, a text column, a nullable column, or any default
-- other than 'MEMBER'::"UserRole". Such a database must be reconciled by a
-- reviewed, separate change; this migration never converts it.

-- Step 1: verify before changing anything.
DO $$
DECLARE
  role_type_oid oid;
  role_type_kind "char";
  found_labels text[];
  user_table_oid oid;
  col_type_oid oid;
  col_not_null boolean;
  col_default text;
BEGIN
  SELECT c.oid
    INTO user_table_oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = current_schema()
     AND c.relname = 'User'
     AND c.relkind IN ('r', 'p');

  IF user_table_oid IS NULL THEN
    RAISE EXCEPTION 'add_user_roles: table "User" not found in schema %', current_schema();
  END IF;

  SELECT t.oid, t.typtype
    INTO role_type_oid, role_type_kind
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = current_schema()
     AND t.typname = 'UserRole';

  IF role_type_oid IS NOT NULL THEN
    IF role_type_kind <> 'e' THEN
      RAISE EXCEPTION 'add_user_roles: type "UserRole" exists but is not an enum';
    END IF;

    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
      INTO found_labels
      FROM pg_enum e
     WHERE e.enumtypid = role_type_oid;

    IF found_labels IS DISTINCT FROM ARRAY['OWNER', 'ADMIN', 'MEMBER']::text[] THEN
      RAISE EXCEPTION 'add_user_roles: enum "UserRole" has labels %, expected {OWNER,ADMIN,MEMBER}', found_labels;
    END IF;
  END IF;

  SELECT a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    INTO col_type_oid, col_not_null, col_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = user_table_oid
     AND a.attname = 'role'
     AND a.attnum > 0
     AND NOT a.attisdropped;

  IF FOUND THEN
    IF role_type_oid IS NULL OR col_type_oid <> role_type_oid THEN
      RAISE EXCEPTION 'add_user_roles: column "User"."role" exists with type %, expected "UserRole"',
        format_type(col_type_oid, NULL);
    END IF;

    IF NOT col_not_null THEN
      RAISE EXCEPTION 'add_user_roles: column "User"."role" exists but is nullable, expected NOT NULL';
    END IF;

    IF col_default IS DISTINCT FROM '''MEMBER''::"UserRole"' THEN
      RAISE EXCEPTION 'add_user_roles: column "User"."role" has default %, expected ''MEMBER''::"UserRole"',
        coalesce(col_default, 'NULL');
    END IF;
  END IF;
END
$$;

-- Step 2: create only what is missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = current_schema()
       AND t.typname = 'UserRole'
  ) THEN
    CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
  END IF;
END
$$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'MEMBER';
