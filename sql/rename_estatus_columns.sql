-- Renombrar columnas COLUMNA4 y COLUMNA5 al nuevo esquema de estatus
ALTER TABLE base_datos
  RENAME COLUMN "COLUMNA4" TO "ESTATUS_LOCAL";

ALTER TABLE base_datos
  RENAME COLUMN "COLUMNA5" TO "ESTATUS_FORANEO";

ALTER TABLE nuevo_estatus
  RENAME COLUMN "COLUMNA4" TO "ESTATUS_LOCAL";

ALTER TABLE nuevo_estatus
  RENAME COLUMN "COLUMNA5" TO "ESTATUS_FORANEO";

-- Si manejas datos históricos en excel_data con los mismos campos, opcionalmente:
-- ALTER TABLE excel_data
--   RENAME COLUMN "COLUMNA4" TO "ESTATUS_LOCAL";
-- ALTER TABLE excel_data
--   RENAME COLUMN "COLUMNA5" TO "ESTATUS_FORANEO";
