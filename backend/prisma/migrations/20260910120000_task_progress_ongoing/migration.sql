-- Add ONGOING to the TaskProgress enum. Ongoing tasks have no fixed due date.
ALTER TYPE "TaskProgress" ADD VALUE IF NOT EXISTS 'ONGOING';
