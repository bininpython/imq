import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shiftReports = sqliteTable("shift_reports", {
  id: text("id").primaryKey(),
  reportDate: text("report_date").notNull(),
  shift: text("shift").notNull(),
  reporter: text("reporter").notNull(),
  status: text("status").notNull().default("finalizado"),
  payload: text("payload").notNull(),
  deviationCount: integer("deviation_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull(),
  objectKey: text("object_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
