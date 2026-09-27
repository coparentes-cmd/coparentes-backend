-- Soft-delete for calendar events (visible as struck-through in Flutter list feed).
ALTER TABLE "CalendarEvent" ADD COLUMN "deletedAt" TIMESTAMP(3);
