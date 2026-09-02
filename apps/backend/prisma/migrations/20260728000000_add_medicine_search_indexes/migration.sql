-- PostgreSQL full/partial text support for inventory search.
-- Raw SQL belongs in a Prisma migration, never in schema.prisma.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "medicine_name_search_idx"
ON "Medicine" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "medicine_batch_search_idx"
ON "Medicine" USING GIN ("batch" gin_trgm_ops);
