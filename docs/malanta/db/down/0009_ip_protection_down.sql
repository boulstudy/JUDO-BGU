drop view  if exists platform_duplicate_clusters;
drop table if exists content_claims, canary_assignments, export_jobs,
                     extraction_alerts, extraction_limits,
                     content_access_events, content_licenses cascade;
