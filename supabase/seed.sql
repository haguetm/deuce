-- Reference data needed in every environment.
insert into public.data_sources (id, name, url, license, license_url, commercial_use_allowed) values
  ('sackmann_atp', 'Jeff Sackmann - tennis_atp (archive)', 'https://huggingface.co/datasets/Aneeshers/tennis-sackmann-archive',
   'CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/', false),
  ('sackmann_wta', 'Jeff Sackmann - tennis_wta (archive)', 'https://huggingface.co/datasets/Aneeshers/tennis-sackmann-archive',
   'CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/', false),
  ('wikidata', 'Wikidata', 'https://www.wikidata.org',
   'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/', true),
  ('wikimedia_pageviews', 'Wikimedia Pageviews API', 'https://wikimedia.org/api/rest_v1/',
   'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/', true)
on conflict (id) do update set
  name = excluded.name, url = excluded.url, license = excluded.license,
  license_url = excluded.license_url, commercial_use_allowed = excluded.commercial_use_allowed;
