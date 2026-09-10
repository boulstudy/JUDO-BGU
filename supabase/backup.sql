-- Run this FIRST, before schema.sql or migrate.sql, and save the output.
--
-- Exports the three existing tables as CSV via psql's \copy, or just eyeball
-- the row counts if you're running this in the Supabase SQL editor (which
-- can't write local files — use the editor's "Download CSV" on each query's
-- result instead).

select 'workouts'   as table_name, count(*) from workouts
union all
select 'drill_library', count(*) from drill_library
union all
select 'attendance', count(*) from attendance;

-- In psql:
--   \copy (select * from workouts)      to 'backup_workouts.csv'      csv header
--   \copy (select * from drill_library) to 'backup_drill_library.csv' csv header
--   \copy (select * from attendance)    to 'backup_attendance.csv'    csv header
