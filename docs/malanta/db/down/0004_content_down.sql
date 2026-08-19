drop trigger if exists locations_revision on locations;
drop trigger if exists layers_revision    on layers;
drop trigger if exists maps_revision      on maps;
drop function if exists app.record_revision();
alter table if exists membership_map_scopes drop constraint if exists mms_map_fk;
drop table if exists content_revisions, media_assets, locations, layers, maps cascade;
