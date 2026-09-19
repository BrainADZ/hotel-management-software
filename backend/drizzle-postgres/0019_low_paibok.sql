CREATE UNIQUE INDEX "idx_folio_lines_property_source"
ON "folio_lines"
USING btree (
    "property_id",
    "source_type",
    "source_id"
);