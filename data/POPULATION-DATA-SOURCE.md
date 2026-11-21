# Population comparison data

Subset of Natural Earth **Admin 0 – Countries**, 1:110m, release **v5.1.1**. Source snapshot: [ne_110m_admin_0_countries.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_110m_admin_0_countries.geojson) (tag `v5.1.1`). The full source can be downloaded from that URL; the subset is in `population-comparisons.json`.

Natural Earth states that all its vector and raster data are in the **public domain**, with no permission or credit required: [Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/). The three-letter IDs come from `ADM0_A3`; the Italian names come from `NAME_IT`; the population numbers and reference years come from `POP_EST` and `POP_YEAR`. This subset includes 20 features classified by the source as `TYPE = Sovereign country`, each with `POP_YEAR = 2019`; the ten pairs are disjoint.

These are Natural Earth's population estimates, not census counts. Values are kept exactly as published in the source (people); this game's comparisons use the same reference year on both sides of every pair.
