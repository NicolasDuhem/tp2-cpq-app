# Live Neon Database Intelligence Exports

These CSV files are exported from the live Neon PostgreSQL database and are used as factual source material for code review, documentation refresh, and Codex implementation work.

Codex must not guess table names, columns, constraints, indexes, or relationships. It must validate against these files and the actual repo code.

Files:

- 01_tables.csv
- 02_columns.csv
- 03_constraints.csv
- 04_indexes.csv
- 05_foreign_keys.csv
- 06_table_sizes.csv
- 07_row_estimates.csv
- 08_read_write_stats.csv
- 09_functions.csv
- 10_views.csv
- 11_triggers.csv
- 12_enum_check_values.csv

Export date: YYYY-MM-DD
Environment: staging/prod Neon
